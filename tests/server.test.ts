// @vitest-environment node
// The API in hosted mode (as on Vercel), against temporary local files instead of Blob storage.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { request as httpRequest, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';

// Notifications: nothing is really sent — record who'd get one (and simulate a dead device).
const pushes = vi.hoisted(() => ({ sent: [] as string[], gone: new Set<string>() }));
vi.mock('web-push', () => ({
  default: {
    generateVAPIDKeys: () => ({ publicKey: 'BTestPublicKey', privateKey: 'test-private' }),
    sendNotification: async (s: { endpoint: string }) => {
      if (pushes.gone.has(s.endpoint)) throw Object.assign(new Error('gone'), { statusCode: 410 });
      pushes.sent.push(s.endpoint);
    },
  },
}));

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
  GQ_ANALYTICS_FILE: join(dir, 'analytics.json'),
  GQ_DAILY_FILE: join(dir, 'daily.json'),
  GQ_PLACES_FILE: join(dir, 'places.json'),
  GQ_PUSH_FILE: join(dir, 'push.json'),
  GQ_VAPID_FILE: join(dir, 'vapid.json'),
  CRON_SECRET: 'test-cron-secret-0123456789abcdef',
});
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.BLOB_STORE_ID;
process.env.ANTHROPIC_API_KEY = ''; // (not deleted: .env would fill it back in with a real key)

let server: Server;
let port = 0;

interface Res { status: number; headers: Record<string, string | string[] | undefined>; body: Record<string, unknown> }
function call(method: string, path: string, opts: { body?: unknown; cookie?: string; host?: string; origin?: string; auth?: string } = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const data = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const req = httpRequest({
      host: '127.0.0.1', port, method, path,
      headers: {
        host: opts.host ?? 'play.test',
        ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}),
        ...(opts.cookie ? { cookie: opts.cookie } : {}),
        ...(opts.origin ? { origin: opts.origin } : {}),
        ...(opts.auth ? { authorization: opts.auth } : {}),
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
  it("lets guests in, but keeps friends' features behind signing in", async () => {
    const h = await call('GET', '/api/health');
    expect(h.status).toBe(200);
    expect(h.body).toEqual(expect.objectContaining({ guest: true, user: null, live: null }));
    for (const [m, path] of [['GET', '/api/players'], ['GET', '/api/places'], ['GET', '/api/favorites'], ['POST', '/api/challenges'], ['POST', '/api/realtime/token'], ['GET', '/api/push']] as const) {
      expect((await call(m, path, m === 'POST' ? { body: {} } : {})).status, path).toBe(401);
    }
    const d = await call('GET', `/api/daily?date=${new Date().toISOString().slice(0, 10)}`);
    expect(d.body).toEqual(expect.objectContaining({ mine: null, board: [], guest: true })); // no names for guests
    expect((await call('POST', '/api/daily', { body: { date: new Date().toISOString().slice(0, 10), points: [3, 3, 3, 3, 3] } })).status).toBe(401);
    expect((await call('POST', '/api/ask', { body: { messages: [{ role: 'user', content: 'Hi' }] } })).status).toBe(503); // allowed, just no key in tests
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
    const stale = await call('GET', '/api/health', { cookie: bob });
    expect(stale.body.user).toBeNull(); // signed out: back to being a guest…
    expect(String(stale.headers['set-cookie'])).toMatch(/gq_session=;/); // …and the old sign-in is forgotten
    expect((await call('GET', '/api/players', { cookie: bob })).status).toBe(401);
    const t = new URL(String(inv.body.link)).searchParams.get('t')!;
    bob = sessionOf(await call('POST', '/api/invite/accept', { body: { username: 'bob', token: t, password: BOB_PW } }));
    expect((await call('GET', '/api/health', { cookie: bob })).status).toBe(200);
  });

  it('rejects a tampered session', async () => {
    // Change a character inside the signature (the very last one only carries padding bits).
    const forged = bob.replace(/(.)(....)$/, (_, c: string, rest: string) => (c === 'A' ? 'B' : 'A') + rest);
    expect((await call('GET', '/api/players', { cookie: forged })).status).toBe(401);
    expect((await call('GET', '/api/health', { cookie: forged })).body.user).toBeNull();
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

  it('uses the owner\'s key for everyone once it\'s set (nobody is asked for theirs)', async () => {
    expect((await call('GET', '/api/health', { cookie: bob })).body).toEqual(expect.objectContaining({ ai: false, source: null }));
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key-000000000000';
    try {
      expect((await call('GET', '/api/health', { cookie: bob })).body).toEqual(expect.objectContaining({ ai: true, source: 'server' }));
    } finally { process.env.ANTHROPIC_API_KEY = ''; }
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

describe('activity analytics', () => {
  const visit = (extra: object = {}) => ({ sid: 'abc123def4', start: Date.now() - 60_000, active: 45, device: 'phone', os: 'iOS', browser: 'Safari', pwa: true,
    events: [[3, 'country', { c: 'FRA' }], [20, 'game', { g: 'street' }], [9, '<script>', {}], [30, 'score', { g: 'street', s: 12345, evil: 'x'.repeat(500) }]], ...extra });

  it('records a player\'s visit under their own name, tidied', async () => {
    expect((await call('POST', '/api/analytics', { cookie: bob, body: visit({ user: 'owner' }) })).status).toBe(200);
    const r = await call('GET', '/api/analytics?days=7', { cookie: owner });
    const s = (r.body.sessions as { user: string; events: unknown[]; active: number }[]).find((x) => x.user === 'bob')!;
    expect(s).toBeTruthy(); // filed under bob, whatever the body claimed
    expect(s.events).toEqual([[3, 'country', { c: 'FRA' }], [20, 'game', { g: 'street' }], [30, 'score', { g: 'street', s: 12345, evil: 'x'.repeat(48) }]]); // bad names dropped, long values cut
    expect(s.active).toBe(45);
  });

  it('shows activity to the owner only', async () => {
    expect((await call('GET', '/api/analytics', { cookie: bob })).status).toBe(403);
    expect((await call('GET', '/api/analytics')).status).toBe(401);
  });

  it('rejects implausible visits', async () => {
    expect((await call('POST', '/api/analytics', { cookie: bob, body: visit({ sid: '../../etc' }) })).status).toBe(400);
    expect((await call('POST', '/api/analytics', { cookie: bob, body: visit({ start: Date.now() - 9 * 86400_000 }) })).status).toBe(400);
  });
});

describe('daily challenge', () => {
  const today = new Date().toISOString().slice(0, 10);
  it('records a result once, with the streak and today\'s board', async () => {
    const r = await call('POST', '/api/daily', { cookie: bob, body: { date: today, points: [3, 2, 3, 0, 1] } });
    expect(r.status).toBe(200);
    expect(r.body.streak).toEqual({ count: 1, best: 1 });
    expect(r.body.board).toEqual([{ name: 'bob', points: [3, 2, 3, 0, 1], total: 9 }]);
    expect((await call('POST', '/api/daily', { cookie: bob, body: { date: today, points: [3, 3, 3, 3, 3] } })).status).toBe(409); // one go a day
    const g = await call('GET', `/api/daily?date=${today}`, { cookie: bob });
    expect(g.body.mine).toEqual([3, 2, 3, 0, 1]);
  });
  it('refuses odd days and impossible scores', async () => {
    expect((await call('POST', '/api/daily', { cookie: owner, body: { date: '2020-01-01', points: [3, 3, 3, 3, 3] } })).status).toBe(400);
    expect((await call('POST', '/api/daily', { cookie: owner, body: { date: today, points: [9, 3, 3, 3, 3] } })).status).toBe(400);
    expect((await call('GET', '/api/daily?date=nope', { cookie: owner })).status).toBe(400);
  });
  it('keeps streaks going, breaks them, and remembers the best', async () => {
    const { nextStreak, currentStreak } = await import('../server/daily');
    let s = nextStreak({ last: null, count: 0, best: 0 }, '2026-10-09');
    s = nextStreak(s, '2026-10-10');
    s = nextStreak(s, '2026-10-11');
    expect(s).toEqual({ last: '2026-10-11', count: 3, best: 3 });
    expect(nextStreak(s, '2026-10-11')).toEqual(s); // same day again: no change
    expect(nextStreak(s, '2026-10-14')).toEqual({ last: '2026-10-14', count: 1, best: 3 }); // missed days
    expect(currentStreak(s, '2026-10-12').count).toBe(3); // still alive today
    expect(currentStreak(s, '2026-10-13').count).toBe(0); // missed yesterday
  });
});

describe('morning reminders', () => {
  const sub = (id: string) => ({ endpoint: `https://push.example/${id}`, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } });
  const nowHour = () => new Date().getUTCHours();

  it('checks a device before saving it', async () => {
    expect((await call('POST', '/api/push', { cookie: owner, body: { subscription: { endpoint: 'http://x', keys: {} }, hour: 8, tz: 'UTC' } })).status).toBe(400);
    expect((await call('POST', '/api/push', { cookie: owner, body: { subscription: sub('o1'), hour: 25, tz: 'UTC' } })).status).toBe(400);
    expect((await call('POST', '/api/push', { cookie: owner, body: { subscription: sub('o1'), hour: 8, tz: 'Mars/Base' } })).status).toBe(400);
    expect((await call('GET', '/api/push', { cookie: owner })).body.key).toBe('BTestPublicKey');
  });

  it('only lets the scheduler in with the right secret', async () => {
    expect((await call('POST', '/api/cron/morning')).status).toBe(401);
    expect((await call('POST', '/api/cron/morning', { auth: 'Bearer wrong-secret-0123456789abcdef' })).status).toBe(401);
  });

  it('nudges whoever\'s morning it is — once, not if they\'ve played, and forgets dead devices', async () => {
    const h = nowHour();
    await call('POST', '/api/push', { cookie: owner, body: { subscription: sub('owner-phone'), hour: h, tz: 'UTC' } });
    await call('POST', '/api/push', { cookie: owner, body: { subscription: sub('owner-old'), hour: h, tz: 'UTC' } });
    await call('POST', '/api/push', { cookie: bob, body: { subscription: sub('bob-phone'), hour: h, tz: 'UTC' } }); // bob played today
    pushes.gone.add('https://push.example/owner-old');
    pushes.sent.length = 0;
    const r = await call('POST', '/api/cron/morning', { auth: 'Bearer test-cron-secret-0123456789abcdef' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ nudged: 1, skipped: 1 });
    expect(pushes.sent).toEqual(['https://push.example/owner-phone']);
    const again = await call('POST', '/api/cron/morning', { auth: 'Bearer test-cron-secret-0123456789abcdef' });
    expect(again.body).toEqual({ nudged: 0, skipped: 0 }); // already sent today
    const devices = (await call('GET', '/api/push', { cookie: owner })).body.endpoints;
    expect(devices).toEqual(['https://push.example/owner-phone']); // the dead one is gone
  });
});

describe('my places', () => {
  const home = { id: 'home000001', lat: 18.52, lng: 73.86, name: 'Home', kind: 'home', note: 'Where it all starts', at: 1 };
  it('keeps each player\'s pins to themselves', async () => {
    expect((await call('PUT', '/api/places', { cookie: bob, body: { places: [home] } })).status).toBe(200);
    expect((await call('GET', '/api/places', { cookie: bob })).body.places).toEqual([home]);
    expect((await call('GET', '/api/places', { cookie: owner })).body.places).toEqual([]); // not bob's
    expect((await call('GET', '/api/places')).status).toBe(401);
  });
  it('refuses nonsense and a second Home, and tidies names', async () => {
    const bad = (places: unknown) => call('PUT', '/api/places', { cookie: bob, body: { places } }).then((r) => r.status);
    expect(await bad([{ ...home, lat: 120 }])).toBe(400);
    expect(await bad([home, { ...home, id: 'home000002' }])).toBe(400); // two homes
    expect(await bad([home, home])).toBe(400); // same id twice
    expect(await bad(Array.from({ length: 101 }, (_, i) => ({ ...home, id: `p${String(i).padStart(9, '0')}`, kind: 'favorite' })))).toBe(400);
    const r = await call('PUT', '/api/places', { cookie: bob, body: { places: [{ ...home, name: '  Snehil\u0007’s place  ', kind: 'weird' }] } });
    expect(r.body.places[0]).toEqual(expect.objectContaining({ name: 'Snehil ’s place', kind: 'favorite' }));
  });
});

describe('group invite links', () => {
  const code = (link: unknown) => new URL(String(link)).searchParams.get('code')!;
  const pw = 'group-member-pass-1';
  it('only the owner can make one', async () => {
    expect((await call('POST', '/api/groups', { cookie: bob, body: { max: 10, days: 7 } })).status).toBe(403);
    expect((await call('POST', '/api/groups', { cookie: owner, body: { max: 500, days: 7 } })).status).toBe(400);
  });
  it('lets people join with their own usernames, up to the limit', async () => {
    const g = await call('POST', '/api/groups', { cookie: owner, body: { max: 2, days: 7 } });
    expect(g.status).toBe(200);
    expect(String(g.body.link)).toMatch(/^https:\/\/play\.test\/join\?code=/);
    const c = code(g.body.link);
    expect((await call('GET', `/api/group?code=${encodeURIComponent(c)}`)).body).toEqual({ valid: true, by: 'owner', left: 2 });
    const a = await call('POST', '/api/group/join', { body: { code: c, username: 'Ravi', password: pw } });
    expect(a.status).toBe(200);
    expect((await call('GET', '/api/players', { cookie: sessionOf(a) })).status).toBe(200); // signed in
    expect((await call('POST', '/api/group/join', { body: { code: c, username: 'ravi', password: pw } })).status).toBe(400); // taken
    expect((await call('POST', '/api/group/join', { body: { code: c, username: 'meera', password: pw } })).status).toBe(200);
    const full = await call('POST', '/api/group/join', { body: { code: c, username: 'third', password: pw } });
    expect(full.status).toBe(400);
    expect(String(full.body.error)).toMatch(/full/);
    const list = (await call('GET', '/api/groups', { cookie: owner })).body.groups as { used: number; max: number; active: boolean }[];
    expect(list[0]).toEqual(expect.objectContaining({ used: 2, max: 2, active: false }));
  });
  it('stops working once revoked, and refuses made-up codes', async () => {
    const g = await call('POST', '/api/groups', { cookie: owner, body: { max: 10, days: 1 } });
    const c = code(g.body.link);
    expect((await call('DELETE', `/api/groups/${g.body.id}`, { cookie: owner })).body).toEqual({ revoked: true });
    expect((await call('POST', '/api/group/join', { body: { code: c, username: 'late', password: pw } })).status).toBe(400);
    expect((await call('GET', '/api/group?code=abcdefgh.xxxxxxxxxxxxxxxxxxxxxxxxxx')).body).toEqual({ valid: false });
    expect((await call('GET', `/api/group?code=${encodeURIComponent(c.split('.')[0] + '.' + 'y'.repeat(32))}`)).body).toEqual({ valid: false });
  });
});

describe('open sign-up', () => {
  it('lets anyone create an account (usernames checked, taken ones refused)', async () => {
    const r = await call('POST', '/api/signup', { body: { username: 'Newcomer', password: 'a-good-password' } });
    expect(r.status).toBe(200);
    expect((await call('GET', '/api/health', { cookie: sessionOf(r) })).body.user).toBe('newcomer');
    expect((await call('POST', '/api/signup', { body: { username: 'newcomer', password: 'another-password' } })).status).toBe(400);
    expect((await call('POST', '/api/signup', { body: { username: 'x', password: 'another-password' } })).status).toBe(400);
    expect((await call('POST', '/api/signup', { body: { username: 'shorty', password: 'short' } })).status).toBe(400);
  });
});

describe('rate limiting', () => {
  it('slows down repeated sign-in attempts', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await call('POST', '/api/login', { body: { username: 'owner', password: 'wrong-wrong-wrong' } })).status);
    expect(codes).toContain(429);
  });
});
