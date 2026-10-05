// The API: streams Claude answers to the globe UI and grades fuzzy game answers.
// Runs two ways: locally via server/index.ts (Express on 127.0.0.1), and on Vercel as a
// serverless function (api/index.ts).
//
// Locally: no login; the Anthropic key comes from .env (or is pasted into the app and saved
// to .env on this machine only).
// Hosted (Vercel): every request needs a signed-in session. Accounts live in a private Blob
// store (server/users.ts): the owner sets up once through the Vercel-protected address, then
// invites people from the app. Each user brings their own Anthropic key, kept encrypted in an
// httpOnly cookie in their browser — never stored on the server. The owner's key is never used.
import 'dotenv/config';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import countries from '../src/data/countries.json' with { type: 'json' };
import { CURATED } from '../src/data/curated.js';
import { KEY_COOKIE, SESSION_COOKIE, SESSION_DAYS, authConfigured, openKey, readCookie, sealKey, signSession, verifySession } from './session.js';
import * as accounts from './users.js';
import * as live from './live.js';
import { historyFor, saveMatch, type MatchRecord } from './matches.js';
import { setSecretSource } from './session.js';

declare module 'express-serve-static-core' {
  interface Request { user?: string; role?: accounts.Role }
}

const ENV_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');

/** Running as a public deployment (Vercel), not on your own machine. */
const HOSTED = !!process.env.VERCEL;

setSecretSource(accounts.sessionSecret); // signing key lives in the private account store

const app = express();
app.use(express.json({ limit: '256kb' }));

const MLY_COOKIE = 'gq_mly';
const DAY = 86400;

// Cookies on the hosted site are always Secure (https) and, for credentials, httpOnly.
function setCookie(res: express.Response, name: string, value: string, opts: { days: number; sameSite?: 'Lax' | 'Strict'; httpOnly?: boolean }) {
  res.append('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${Math.round(opts.days * DAY)}; ${opts.httpOnly === false ? '' : 'HttpOnly; '}Secure; SameSite=${opts.sameSite ?? 'Lax'}`);
}
const clearCookie = (res: express.Response, name: string) => res.append('Set-Cookie', `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
const cookie = (req: express.Request, name: string) => readCookie(req.headers.cookie, name);

// Best-effort rate limit (per server instance), keyed by user when signed in, else by IP.
function rateLimit(max: number, windowMs: number, message = 'Too many requests — take a breather and try again in a few minutes.'): express.RequestHandler {
  const hits = new Map<string, number[]>();
  return (req, res, next) => {
    if (!HOSTED) { next(); return; }
    const who = req.user ?? String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '?').split(',')[0].trim();
    const now = Date.now();
    const recent = (hits.get(who) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) { res.status(429).json({ error: message }); return; }
    recent.push(now);
    hits.set(who, recent);
    if (hits.size > 5000) hits.clear(); // keep memory bounded
    next();
  };
}

// ── Accounts (hosted only) ──
const fail = (res: express.Response, status: number, err: unknown) => res.status(status).json({ error: err instanceof Error ? err.message : String(err) });
const signIn = async (res: express.Response, name: string) => setCookie(res, SESSION_COOKIE, await signSession(name), { days: SESSION_DAYS });
// Each auth route gets its own budget (opening an invite shouldn't eat into signing in).
const authLimit = (max: number) => rateLimit(max, 10 * 60_000, 'Too many attempts — wait a few minutes and try again.');

/**
 * First-time setup may only happen through the Vercel-protected address (Vercel asks the
 * owner to sign in to Vercel before the request ever reaches us), and only while there's no owner.
 */
const viaProtectedHost = (req: express.Request) => !!process.env.OWNER_SETUP_HOST && req.headers.host === process.env.OWNER_SETUP_HOST;

app.get('/api/setup', async (req, res) => {
  res.json({ needsSetup: HOSTED && !(await accounts.hasOwner()), allowedHere: viaProtectedHost(req), setupUrl: process.env.OWNER_SETUP_HOST ? `https://${process.env.OWNER_SETUP_HOST}/setup` : null, ready: await authConfigured() });
});

app.post('/api/setup', authLimit(10), async (req, res) => {
  if (!HOSTED || !(await authConfigured())) { fail(res, 503, 'Sign-in storage isn’t connected yet.'); return; }
  if (!viaProtectedHost(req)) { fail(res, 403, 'Open the setup link from your Vercel-protected address.'); return; }
  const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
  if (!accounts.validPassword(password)) { fail(res, 400, 'Use a password of at least 8 characters.'); return; }
  try {
    const u = await accounts.createOwner(username, password);
    await signIn(res, u.name);
    // Setup happens on the protected address; continue on the public site.
    res.json({ ok: true, user: u.name, next: process.env.PUBLIC_HOST ? `https://${process.env.PUBLIC_HOST}/login?ready=1` : '/' });
  } catch (err) { fail(res, 400, err); }
});

app.post('/api/login', authLimit(10), async (req, res) => {
  if (!HOSTED) { res.json({ ok: true, user: null }); return; } // no login on your own machine
  if (!(await authConfigured())) { fail(res, 503, 'Sign-in isn’t set up yet.'); return; }
  const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
  if (!accounts.normName(username) || typeof password !== 'string' || !password || password.length > 200) { fail(res, 400, 'Enter your username and password.'); return; }
  const u = await accounts.checkLogin(username, password);
  if (!u) { fail(res, 401, 'Wrong username or password.'); return; }
  await signIn(res, u.name);
  res.json({ ok: true, user: u.name });
});

// Invite links: check (to greet the person) and accept (they choose their own password).
app.get('/api/invite', authLimit(40), async (req, res) => {
  res.json({ valid: await accounts.inviteValid(req.query.u, req.query.t) });
});
app.post('/api/invite/accept', authLimit(10), async (req, res) => {
  if (!HOSTED || !(await authConfigured())) { fail(res, 503, 'Sign-in isn’t set up yet.'); return; }
  const { username, token, password } = (req.body ?? {}) as { username?: string; token?: string; password?: string };
  if (!accounts.validPassword(password)) { fail(res, 400, 'Use a password of at least 8 characters.'); return; }
  try {
    const u = await accounts.acceptInvite(username, token, password);
    await signIn(res, u.name);
    res.json({ ok: true, user: u.name });
  } catch (err) { fail(res, 400, err); }
});

app.post('/api/logout', (_req, res) => {
  for (const c of [SESSION_COOKIE, KEY_COOKIE, MLY_COOKIE]) clearCookie(res, c);
  res.json({ ok: true });
});

// Everything else under /api needs a valid session on the hosted site — and the account must
// still exist (so removing someone cuts them off at once). Routing middleware already gates the
// whole site; this is the second lock.
app.use('/api', async (req, res, next) => {
  if (!HOSTED) { next(); return; }
  const s = await verifySession(cookie(req, SESSION_COOKIE));
  const u = s ? await accounts.getUser(s.u) : null;
  if (!s || !u?.password) { res.status(401).json({ error: 'Please sign in.' }); return; }
  req.user = s.u;
  req.role = u.role;
  next();
});

// ── People (owner only) ──
const ownerOnly: express.RequestHandler = (req, res, next) => {
  if (HOSTED && req.role === 'owner') { next(); return; }
  fail(res, 403, 'Only the owner can manage people.');
};
const inviteLink = (req: express.Request, name: string, token: string) =>
  `https://${process.env.PUBLIC_HOST || req.headers.host}/welcome?u=${encodeURIComponent(name)}&t=${token}`;

app.get('/api/people', ownerOnly, async (_req, res) => { res.json({ people: await accounts.listUsers() }); });
app.post('/api/people', ownerOnly, async (req, res) => {
  try {
    const r = await accounts.invite((req.body as { username?: string })?.username);
    res.json({ name: r.name, link: inviteLink(req, r.name, r.token), days: r.days });
  } catch (err) { fail(res, 400, err); }
});
app.delete('/api/people/:name', ownerOnly, async (req, res) => {
  try { res.json({ removed: await accounts.removeUser(req.params.name) }); } catch (err) { fail(res, 400, err); }
});

// ── Live matches ──
// Hosted: Ably, with tokens scoped by signed match tickets (server/live.ts). Locally there's no
// login and no Ably — the browser plays over a BroadcastChannel between tabs, and says who it is.
const me = (req: express.Request) => (HOSTED ? req.user! : accounts.normName(req.headers['x-gq-as']) || 'you');

// Everyone signed in can see who else plays (names only — managing people stays owner-only).
app.get('/api/players', async (req, res) => {
  if (!HOSTED) { res.json({ players: [] }); return; }
  const people = await accounts.listUsers();
  res.json({ players: people.filter((p) => p.status === 'active' && p.name !== req.user).map((p) => ({ name: p.name, lastLogin: p.lastLogin })) });
});

app.post('/api/realtime/token', rateLimit(120, 10 * 60_000), async (req, res) => {
  if (!HOSTED || !live.liveConfigured()) { fail(res, 404, 'Live play isn’t set up.'); return; }
  try { res.json(await live.tokenRequest(req.user!, (req.body as { tickets?: unknown })?.tickets)); } catch (err) { fail(res, 502, err); }
});

app.post('/api/challenges', rateLimit(40, 10 * 60_000), async (req, res) => {
  if (!HOSTED || !live.liveConfigured()) { fail(res, 404, 'Live play isn’t set up.'); return; }
  const body = req.body as { to?: unknown; game?: unknown; opts?: unknown };
  const game = body.game as live.GameId;
  const to = [...new Set((Array.isArray(body.to) ? body.to : []).map(accounts.normName))].filter((n) => n && n !== req.user);
  if (!live.GAMES.includes(game)) { fail(res, 400, 'Unknown game.'); return; }
  if (!to.length || to.length > 5) { fail(res, 400, 'Challenge between 1 and 5 friends.'); return; }
  for (const n of to) if (!(await accounts.getUser(n))?.password) { fail(res, 400, `There’s no player called “${n}”.`); return; }
  const opts = typeof body.opts === 'object' && body.opts ? body.opts : {};
  const id = live.newMatchId();
  const players = [req.user!, ...to];
  try {
    await Promise.all(to.map(async (name) => live.sendInvite(name, { id, from: req.user, game, opts, players, at: Date.now(), ticket: await live.issueTicket({ m: id, host: req.user!, players, game }) })));
    res.json({ id, players, ticket: await live.issueTicket({ m: id, host: req.user!, players, game }) });
  } catch (err) { fail(res, 502, err); }
});

app.get('/api/matches', async (req, res) => { res.json({ matches: await historyFor(me(req)) }); });
app.post('/api/matches/:id/result', rateLimit(30, 10 * 60_000), async (req, res) => {
  const body = req.body as { ticket?: unknown; game?: unknown; mode?: unknown; players?: unknown };
  const id = String(req.params.id);
  let allowed: string[] | null = null;
  if (HOSTED) {
    const t = await live.readTicket(body.ticket, req.user!);
    if (!t || t.m !== id || t.host !== req.user) { fail(res, 403, 'Only the host can record this match.'); return; }
    allowed = t.players;
  }
  const players = (Array.isArray(body.players) ? body.players : [])
    .map((p: { name?: unknown; score?: unknown }) => ({ name: accounts.normName(p?.name), score: Math.max(0, Math.round(Number(p?.score) || 0)) }))
    .filter((p) => accounts.validName(p.name) && (!allowed || allowed.includes(p.name)))
    .slice(0, 6);
  if (players.length < 2 || !/^[\w-]{6,24}$/.test(id)) { fail(res, 400, 'Not a finished match.'); return; }
  const rec: MatchRecord = { id, game: String(body.game).slice(0, 12), mode: body.mode ? String(body.mode).slice(0, 12) : undefined, host: me(req), at: Date.now(), players };
  try { await saveMatch(rec); res.json({ ok: true }); } catch (err) { fail(res, 500, err); }
});

const byCca3 = new Map((countries as { cca3: string }[]).map((c) => [c.cca3, c]));

let client: Anthropic | null = null;
let keySource: 'env' | 'app' | null = null;
let aiReady: boolean | null = null;

async function verify(c: Anthropic) {
  await c.models.retrieve('claude-opus-5-5');
}

/** The Anthropic client for this request: the server's (locally) or the user's own key (hosted). */
async function clientFor(req: express.Request): Promise<Anthropic | null> {
  if (!HOSTED) return (await checkAi()) ? client : null;
  const key = await openKey(cookie(req, KEY_COOKIE), req.user!);
  return key ? new Anthropic({ apiKey: key }) : null;
}

async function checkAi() {
  if (aiReady !== null) return aiReady;
  try {
    const c = new Anthropic();
    await verify(c);
    client = c;
    keySource = 'env';
    aiReady = true;
  } catch (err) {
    console.warn('[geoquest] Claude unavailable — offline mode until a key is added:', (err as Error).message);
    aiReady = false;
  }
  return aiReady;
}

// Persist a variable in .env (gitignored, readable only by this user).
async function setEnvVar(name: string, value: string | null) {
  let text = '';
  try { text = await readFile(ENV_PATH, 'utf8'); } catch { /* no .env yet */ }
  const lines = text.split('\n').filter((l) => l.trim() && !l.startsWith(`${name}=`));
  if (value) lines.push(`${name}=${value}`);
  await writeFile(ENV_PATH, lines.join('\n') + '\n', 'utf8');
  await chmod(ENV_PATH, 0o600);
}
const saveKeyToEnv = (key: string | null) => setEnvVar('ANTHROPIC_API_KEY', key);

// ── Mapillary (street-level imagery for the Street View challenge) ──
// Mapillary *client* tokens are designed to be used in the browser, so the app
// can read it back; we keep it in .env so it survives restarts.
app.get('/api/mapillary', (req, res) => {
  res.json({ token: (HOSTED ? cookie(req, MLY_COOKIE) : null) || process.env.MAPILLARY_TOKEN || null });
});

app.post('/api/mapillary', async (req, res) => {
  const token = String((req.body as { token?: string })?.token ?? '').trim();
  if (!/^MLY\|\d+\|[0-9a-f]{16,}$/i.test(token)) {
    res.status(400).json({ error: 'That doesn’t look like a Mapillary client token (it starts with MLY|).' });
    return;
  }
  try {
    // The viewer reads images through the Graph API, so check exactly that
    // (a public image), not just that the token is syntactically accepted.
    const url = `https://graph.mapillary.com/500609427720893?access_token=${encodeURIComponent(token)}&fields=id`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) {
      const body = (await r.json().catch(() => ({}))) as { error?: { code?: number } };
      res.status(400).json({
        error: body.error?.code === 100 || r.status === 401 || r.status === 403
          ? 'This token can’t read images. In the Mapillary dashboard, make sure the app has Read access, and copy the Client Token (not the Client Secret).'
          : `Mapillary returned ${r.status} — try again in a moment.`,
      });
      return;
    }
  } catch {
    res.status(400).json({ error: 'Couldn’t reach Mapillary to check the token — try again.' });
    return;
  }
  if (HOSTED) { setCookie(res, MLY_COOKIE, token, { days: 365 }); res.json({ token }); return; } // per user
  process.env.MAPILLARY_TOKEN = token;
  try { await setEnvVar('MAPILLARY_TOKEN', token); } catch (err) { console.warn('[geoquest] could not save Mapillary token:', err); }
  res.json({ token });
});

app.delete('/api/mapillary', async (_req, res) => {
  if (HOSTED) { clearCookie(res, MLY_COOKIE); res.json({ token: null }); return; }
  delete process.env.MAPILLARY_TOKEN;
  try { await setEnvVar('MAPILLARY_TOKEN', null); } catch { /* ignore */ }
  res.json({ token: null });
});

app.get('/api/health', async (req, res) => {
  if (HOSTED) {
    const ai = !!(await openKey(cookie(req, KEY_COOKIE), req.user!));
    res.json({ ai, source: ai ? 'user' : null, hosted: true, user: req.user, role: req.role, live: live.liveConfigured() ? 'ably' : null });
    return;
  }
  res.json({ ai: await checkAi(), source: keySource, hosted: false, user: null, live: 'local' });
});

app.post('/api/key', rateLimit(10, 10 * 60_000), async (req, res) => {
  const key = String((req.body as { key?: string })?.key ?? '').trim();
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) {
    res.status(400).json({ error: 'That doesn’t look like an Anthropic API key (it should start with sk-ant-).' });
    return;
  }
  const c = new Anthropic({ apiKey: key });
  try {
    await verify(c);
  } catch (err) {
    const msg = err instanceof Anthropic.AuthenticationError ? 'Anthropic rejected this key.'
      : err instanceof Anthropic.PermissionDeniedError ? 'This key doesn’t have access to Claude Opus 5.5.'
        : 'Couldn’t reach Anthropic to check the key — try again.';
    res.status(400).json({ error: msg });
    return;
  }
  if (HOSTED) {
    // The user's own key: sealed into an httpOnly cookie in their browser, never stored here.
    setCookie(res, KEY_COOKIE, await sealKey(key, req.user!), { days: SESSION_DAYS, sameSite: 'Strict' });
    res.json({ ai: true, source: 'user' });
    return;
  }
  client = c;
  keySource = 'app';
  aiReady = true;
  process.env.ANTHROPIC_API_KEY = key;
  try { await saveKeyToEnv(key); } catch (err) { console.warn('[geoquest] could not save key to .env:', err); }
  res.json({ ai: true, source: keySource });
});

app.delete('/api/key', async (_req, res) => {
  if (HOSTED) { clearCookie(res, KEY_COOKIE); res.json({ ai: false, source: null }); return; }
  client = null;
  keySource = null;
  aiReady = false;
  delete process.env.ANTHROPIC_API_KEY;
  try { await saveKeyToEnv(null); } catch { /* ignore */ }
  res.json({ ai: false, source: null });
});

const SYSTEM = `You are the Atlas inside GeoQuest, an interactive 3D globe for learning geography trivia and getting better at GeoGuessr.

Scope:
- You can answer ANY question the user asks — geography or not (science, history, sport, culture, current events, everyday questions). Be genuinely helpful first.
- When it's natural, add a light geographic angle (where something happened, where it comes from), but never force it.
- Use web search for recent events, live facts, or anything you are unsure about; otherwise answer from knowledge.

Style:
- Accurate and enthusiastic. If a figure is approximate or disputed, say so briefly.
- Keep answers tight: usually 2–6 short sentences or a compact markdown list. Use **bold** for the key answer.
- For geography answers, add one memorable hook or a GeoGuessr clue when useful (script, road lines, bollards, plates, vegetation, architecture, driving side).
- Use markdown lists and bold only; no headings, no tables.

Map control:
- If your answer names specific countries the user would benefit from seeing on the globe, end with ONE final line exactly in the form:
MAP: ISO3,ISO3,ISO3
using ISO 3166-1 alpha-3 codes (max 20). Omit the line when no countries are relevant.`;

interface AskBody {
  messages: { role: 'user' | 'assistant'; content: string }[];
  country?: string | null;
}

app.post('/api/ask', rateLimit(60, 10 * 60_000), async (req, res) => {
  const { messages, country } = req.body as AskBody;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages required' });
    return;
  }
  const ai = await clientFor(req);
  if (!ai) {
    res.status(503).json({ error: 'AI not configured' });
    return;
  }

  // Ground the model in the selected country's dataset entry.
  const ctx = country && byCca3.get(country)
    ? `\n\nThe user currently has this country selected on the globe (use it when they say "it", "here", "this country"):\n${JSON.stringify({ ...byCca3.get(country), curated: CURATED[country] ?? null })}`
    : '\n\nNo country is selected; the user may be asking about the whole world or about anything at all.';

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  let aborted = false;
  let current: { abort: () => void } | null = null;
  req.on('close', () => { aborted = true; current?.abort(); });

  try {
    const convo: Anthropic.Beta.BetaMessageParam[] = messages.slice(-12).map((m) => ({ role: m.role, content: m.content }));
    // Server-side web search can pause long turns; resume a few times.
    for (let turn = 0; turn < 4 && !aborted; turn++) {
      const stream = ai.beta.messages.stream({
        model: 'claude-opus-5-5',
        max_tokens: 6000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system: SYSTEM + ctx,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
        messages: convo,
      });
      current = stream;
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') res.write(event.delta.text);
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === 'refusal') {
        res.write('\n\nSorry — I can’t help with that one. Try another question!');
        break;
      }
      if (final.stop_reason !== 'pause_turn') break;
      convo.push({ role: 'assistant', content: final.content });
    }
    res.end();
  } catch (err) {
    if (aborted) return;
    if (err instanceof Anthropic.AuthenticationError) {
      if (HOSTED) { if (!res.headersSent) clearCookie(res, KEY_COOKIE); } // their key stopped working
      else { aiReady = false; client = null; keySource = null; }
    }
    const msg = err instanceof Anthropic.RateLimitError
      ? 'The Atlas is a bit busy — try again in a moment.'
      : err instanceof Anthropic.AuthenticationError
        ? 'Your Anthropic key was rejected — reconnect it from the Atlas header.'
        : err instanceof Anthropic.APIError
          ? `The Atlas hit an error (${err.status ?? 'network'}).`
          : 'The Atlas lost its connection.';
    console.error('[geoquest] ask failed:', err);
    if (!res.headersSent) res.status(502).json({ error: msg });
    else res.end(`\n\n_${msg}_`);
  }
});

// ── Lenient answer matching for "Name the Top 5" ─────────────
// Fuzzy matching happens in the browser; this is the fallback for answers that are
// semantically right but spelled/phrased differently ("the big river in Egypt").
app.post('/api/match', rateLimit(200, 10 * 60_000), async (req, res) => {
  const { guess, options, question } = req.body as { guess?: string; options?: string[]; question?: string };
  if (!guess || !Array.isArray(options) || !options.length) { res.status(400).json({ error: 'guess and options required' }); return; }
  const ai = await clientFor(req);
  if (!ai) { res.json({ match: null }); return; }
  try {
    const msg = await ai.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 1500,
      output_config: { effort: 'low' },
      system: 'You grade answers in a geography trivia game. Be lenient about spelling, abbreviations, alternative or historical names and translations, but do not accept a genuinely different place. Reply with ONLY the exact matching option text, or NONE.',
      messages: [{
        role: 'user',
        content: `Question: ${String(question ?? '').slice(0, 200)}\nOptions:\n${options.slice(0, 10).map((o) => `- ${String(o).slice(0, 80)}`).join('\n')}\nPlayer answered: "${String(guess).slice(0, 80)}"\nWhich option did the player mean?`,
      }],
    });
    if (msg.stop_reason === 'refusal') { res.json({ match: null }); return; }
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    const match = options.find((o) => o.toLowerCase() === text.toLowerCase()) ?? null;
    res.json({ match });
  } catch (err) {
    console.warn('[geoquest] match failed:', (err as Error).message);
    res.json({ match: null });
  }
});

export { checkAi };
export default app;
