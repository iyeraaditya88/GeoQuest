// @vitest-environment node
// The API in hosted mode (as on Vercel), against temporary local files instead of Blob storage.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request as httpRequest, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';

const dir = mkdtempSync(join(tmpdir(), 'gq-test-'));
Object.assign(process.env, {
  VERCEL: '1',
  SESSION_SECRET: randomBytes(36).toString('base64'),
  ABLY_API_KEY: 'testapp.testkey:abcdef0123456789',
  OWNER_SETUP_HOST: 'setup.test',
  PUBLIC_HOST: 'play.test',
  GQ_USERS_FILE: join(dir, 'users.json'),
  GQ_MATCHES_FILE: join(dir, 'matches.json'),
  GQ_PREFS_FILE: join(dir, 'prefs.json'),
});
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.BLOB_STORE_ID;
delete process.env.ANTHROPIC_API_KEY;

let server: Server;
let port = 0;

interface Res { status: number; headers: Record<string, string | string[] | undefined>; body: Record<string, unknown> }
function call(method: string, path: string, opts: { body?: unknown; cookie?: string; host?: string; origin?: string } = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const data = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const req = httpRequest({
      host: '127.0.0.1', port, method, path,
      headers: {
        host: opts.host ?? 'play.test',
        ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}),
        ...(opts.cookie ? { cookie: opts.cookie } : {}),
        ...(opts.origin ? { origin: opts.origin } : {}),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let body: Record<string, unknown> = {};
        try { body = JSON.parse(raw); } catch { /* not JSON */ }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
const sessionOf = (r: Res) => {
  const set = ([] as string[]).concat(r.headers['set-cookie'] ?? []);
  const c = set.find((x) => x.startsWith('gq_session='));
  return c ? c.split(';')[0] : '';
};

const OWNER_PW = randomBytes(9).toString('base64url');
const BOB_PW = randomBytes(9).toString('base64url');
let owner = '', bob = '';

beforeAll(async () => {
  const { default: app } = await import('../server/app');
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
  port = (server.address() as AddressInfo).port;
});
afterAll(() => { server?.close(); rmSync(dir, { recursive: true, force: true }); });

describe('accounts', () => {
  it('needs a session for the API', async () => {
    expect((await call('GET', '/api/health')).status).toBe(401);
  });

  it('only allows owner setup from the protected address, once', async () => {
    expect((await call('POST', '/api/setup', { body: { username: 'owner', password: OWNER_PW } })).status).toBe(403);
    const r = await call('POST', '/api/setup', { host: 'setup.test', body: { username: 'owner', password: OWNER_PW } });
    expect(r.status).toBe(200);
    owner = sessionOf(r);
    expect(owner).toMatch(/^gq_session=/);
    expect((await call('POST', '/api/setup', { host: 'setup.test', body: { username: 'other', password: OWNER_PW } })).status).toBe(400);
  });

  it('signs in with the right password only, with one generic error', async () => {
    const bad = await call('POST', '/api/login', { body: { username: 'owner', password: 'nope-nope-nope' } });
    expect(bad.status).toBe(401);
    const unknown = await call('POST', '/api/login', { body: { username: 'ghost', password: 'nope-nope-nope' } });
    expect(unknown.body.error).toBe(bad.body.error); // doesn't reveal who exists
    const ok = await call('POST', '/api/login', { body: { username: 'owner', password: OWNER_PW } });
    expect(ok.status).toBe(200);
    const cookie = ([] as string[]).concat(ok.headers['set-cookie'] ?? []).join(';');
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  it('invites a member, who sets their own password', async () => {
    const inv = await call('POST', '/api/people', { cookie: owner, body: { username: 'bob' } });
    expect(inv.status).toBe(200);
    const link = new URL(String(inv.body.link));
    expect(link.host).toBe('play.test');
    const t = link.searchParams.get('t')!;
    expect((await call('GET', `/api/invite?u=bob&t=${t}`)).body.valid).toBe(true);
    const acc = await call('POST', '/api/invite/accept', { body: { username: 'bob', token: t, password: BOB_PW } });
    expect(acc.status).toBe(200);
    bob = sessionOf(acc);
    // single use
    expect((await call('POST', '/api/invite/accept', { body: { username: 'bob', token: t, password: BOB_PW } })).status).toBe(400);
    expect((await call('GET', '/api/health', { cookie: bob })).body.user).toBe('bob');
  });

  it('keeps people management owner-only', async () => {
    expect((await call('GET', '/api/people', { cookie: bob })).status).toBe(403);
    expect((await call('GET', '/api/people', { cookie: owner })).status).toBe(200);
  });

  it('signs out old sessions when a password is reset', async () => {
    const inv = await call('POST', '/api/people', { cookie: owner, body: { username: 'bob' } });
    expect((await call('GET', '/api/health', { cookie: bob })).status).toBe(401);
    const t = new URL(String(inv.body.link)).searchParams.get('t')!;
    bob = sessionOf(await call('POST', '/api/invite/accept', { body: { username: 'bob', token: t, password: BOB_PW } }));
    expect((await call('GET', '/api/health', { cookie: bob })).status).toBe(200);
  });

  it('rejects a tampered session', async () => {
    const forged = bob.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
    expect((await call('GET', '/api/health', { cookie: forged })).status).toBe(401);
  });
});

describe('request hygiene', () => {
  it('blocks cross-site writes', async () => {
    expect((await call('PUT', '/api/favorites', { cookie: bob, origin: 'https://evil.example', body: { favorites: ['owner'] } })).status).toBe(403);
    expect((await call('PUT', '/api/favorites', { cookie: bob, origin: 'https://play.test', body: { favorites: ['owner'] } })).status).toBe(200);
  });

  it('sends security headers and no X-Powered-By', async () => {
    const r = await call('GET', '/api/health', { cookie: bob });
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['x-powered-by']).toBeUndefined();
  });

  it('validates questions for the Atlas', async () => {
    expect((await call('POST', '/api/ask', { cookie: bob, body: { messages: [{ role: 'system', content: 'hi' }] } })).status).toBe(400);
    expect((await call('POST', '/api/ask', { cookie: bob, body: { messages: [{ role: 'user', content: 'x'.repeat(9000) }] } })).status).toBe(400);
    // well-formed, but this user hasn't connected a key
    expect((await call('POST', '/api/ask', { cookie: bob, body: { messages: [{ role: 'user', content: 'Capital of Peru?' }] } })).status).toBe(503);
  });
});

describe('favourites and players', () => {
  it('stores favourites per player, cleaned', async () => {
    const r = await call('PUT', '/api/favorites', { cookie: bob, body: { favorites: ['owner', 'OWNER', 'bob', 'bad name!'] } });
    expect(r.body.favorites).toEqual(['owner']);
    expect((await call('GET', '/api/favorites', { cookie: owner })).body.favorites).toEqual([]);
  });

  it('lists other players by name only', async () => {
    const r = await call('GET', '/api/players', { cookie: bob });
    expect(r.body.players).toEqual([expect.objectContaining({ name: 'owner' })]);
    expect(JSON.stringify(r.body)).not.toMatch(/scrypt|password|invite/);
  });
});

describe('live play', () => {
  it('scopes realtime tokens to the player and their tickets', async () => {
    const r = await call('POST', '/api/realtime/token', { cookie: bob, body: { tickets: ['junk'] } });
    expect(r.body.clientId).toBe('bob');
    expect(JSON.parse(String(r.body.capability))).toEqual({ 'inbox:bob': ['subscribe'], lobby: ['presence', 'subscribe'] });
  });

  it('validates challenges', async () => {
    expect((await call('POST', '/api/challenges', { cookie: bob, body: { to: ['nobody'], game: 'capitals' } })).status).toBe(400);
    expect((await call('POST', '/api/challenges', { cookie: bob, body: { to: ['owner'], game: 'chess' } })).status).toBe(400);
    expect((await call('POST', '/api/challenges', { cookie: bob, body: { to: ['bob'], game: 'capitals' } })).status).toBe(400);
  });

  it('lets others join an invite link, not its owner, and refuses forgeries', async () => {
    const inv = await call('POST', '/api/invites', { cookie: owner, body: { game: 'trivia' } });
    const token = String(inv.body.token);
    const join = await call('POST', '/api/invites/join', { cookie: bob, body: { token } });
    expect(join.body).toEqual(expect.objectContaining({ host: 'owner', game: 'trivia' }));
    expect(typeof join.body.ticket).toBe('string');
    const tok = await call('POST', '/api/realtime/token', { cookie: bob, body: { tickets: [join.body.ticket] } });
    expect(Object.keys(JSON.parse(String(tok.body.capability)))).toContain(`match:${inv.body.id}`);
    expect((await call('POST', '/api/invites/join', { cookie: owner, body: { token } })).status).toBe(400);
    expect((await call('POST', '/api/invites/join', { cookie: bob, body: { token: `${token}x` } })).status).toBe(400);
  });

  it('lets newcomers sign up from the owner\'s game link only, a few per link', async () => {
    const inv = await call('POST', '/api/invites', { cookie: owner, body: { game: 'capitals' } });
    expect(inv.body.signup).toBe(true);
    const token = String(inv.body.token);
    expect((await call('GET', `/api/invites/info?token=${encodeURIComponent(token)}`)).body).toEqual({ valid: true, host: 'owner', game: 'capitals', signup: true });
    expect((await call('GET', '/api/invites/info?token=junk')).body).toEqual({ valid: false });

    const pw = 'newbie-pass-123';
    const r = await call('POST', '/api/invites/signup', { body: { token, username: 'Newbie', password: pw } });
    expect(r.status).toBe(200);
    const nb = sessionOf(r);
    expect((await call('POST', '/api/invites/join', { cookie: nb, body: { token } })).body).toEqual(expect.objectContaining({ host: 'owner', game: 'capitals' }));
    expect((await call('POST', '/api/invites/signup', { body: { token, username: 'newbie', password: pw } })).status).toBe(400); // taken
    expect((await call('POST', '/api/invites/signup', { body: { token: `${token}x`, username: 'forger', password: pw } })).status).toBe(400);

    // A member's link doesn't let anyone new in, even if the request claims otherwise.
    const mine = await call('POST', '/api/invites', { cookie: bob, body: { game: 'capitals', signup: true } });
    expect(mine.body.signup).toBe(false);
    expect((await call('POST', '/api/invites/signup', { body: { token: mine.body.token, username: 'sneaky', password: pw } })).status).toBe(403);

    // Each link admits only a handful of new accounts.
    for (const n of ['nb2', 'nb3', 'nb4', 'nb5']) expect((await call('POST', '/api/invites/signup', { body: { token, username: n, password: pw } })).status).toBe(200);
    const sixth = await call('POST', '/api/invites/signup', { body: { token, username: 'nb6', password: pw } });
    expect(sixth.status).toBe(400);
    expect(String(sixth.body.error)).toMatch(/new one/);
  });

  it('only records a result from the match host', async () => {
    const players = [{ name: 'bob', score: 9999 }, { name: 'owner', score: 0 }];
    expect((await call('POST', '/api/matches/abcdefgh/result', { cookie: bob, body: { ticket: 'junk', game: 'capitals', players } })).status).toBe(403);
  });
});

describe('rate limiting', () => {
  it('slows down repeated sign-in attempts', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await call('POST', '/api/login', { body: { username: 'owner', password: 'wrong-wrong-wrong' } })).status);
    expect(codes).toContain(429);
  });
});
