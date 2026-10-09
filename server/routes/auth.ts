// Accounts on the hosted site: owner setup, sign-in, invites, the session guard, and people.
import type express from 'express';
import * as accounts from '../users.js';
import * as prefs from '../prefs.js';
import * as live from '../live.js';
import { KEY_COOKIE, SESSION_COOKIE, authConfigured, verifySession } from '../session.js';
import { HOSTED, MLY_COOKIE, authLimit, clearCookie, cookie, fail, signIn } from '../http.js';

/** Public routes (sign-in, invites), then the guard that every other /api route sits behind. */
export function registerAuth(app: express.Express) {
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
      await signIn(res, u);
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
    await signIn(res, u);
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
      await signIn(res, u);
      res.json({ ok: true, user: u.name });
    } catch (err) { fail(res, 400, err); }
  });

  // Game links, opened while signed out: who's inviting to what — and, for the owner's links, a
  // way to create an account right there and go straight into the lobby.
  app.get('/api/invites/info', authLimit(60), async (req, res) => {
    const t = await live.readOpenInvite(req.query.token);
    res.json(t ? { valid: true, host: t.host, game: t.game, signup: !!t.signup } : { valid: false });
  });
  app.post('/api/invites/signup', authLimit(10), async (req, res) => {
    if (!HOSTED || !(await authConfigured())) { fail(res, 503, 'Sign-in isn’t set up yet.'); return; }
    const { token, username, password } = (req.body ?? {}) as { token?: unknown; username?: unknown; password?: unknown };
    const t = await live.readOpenInvite(token);
    if (!t) { fail(res, 400, 'This game link has expired — ask for a new one.'); return; }
    if (!t.signup) { fail(res, 403, 'This link is for existing players — sign in to join.'); return; }
    if (!accounts.validPassword(password)) { fail(res, 400, 'Use a password of at least 8 characters.'); return; }
    try {
      const u = await accounts.createMember(username, password, t.m);
      await signIn(res, u);
      res.json({ ok: true, user: u.name });
    } catch (err) { fail(res, 400, err); }
  });

  // Group invite links (one link for a whole chat): check it, and join through it.
  app.get('/api/group', authLimit(60), async (req, res) => {
    try { res.json(await accounts.groupInfo(req.query.code)); } catch (err) { fail(res, 500, err); }
  });
  app.post('/api/group/join', authLimit(10), async (req, res) => {
    if (!HOSTED || !(await authConfigured())) { fail(res, 503, 'Sign-in isn’t set up yet.'); return; }
    const { code, username, password } = (req.body ?? {}) as { code?: unknown; username?: unknown; password?: unknown };
    if (!accounts.validPassword(password)) { fail(res, 400, 'Use a password of at least 8 characters.'); return; }
    try {
      const u = await accounts.joinGroup(code, username, password);
      await signIn(res, u);
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
    // Removed accounts, and sessions from before a password reset, are signed out at once.
    if (!s || !u?.password || (s.v ?? 0) !== (u.sv ?? 0)) { res.status(401).json({ error: 'Please sign in.' }); return; }
    req.user = s.u;
    req.role = u.role;
    prefs.touchSeen(s.u); // "last seen" for friends lists (throttled)
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
  // Group links (owner): make one, see how they're going, switch one off.
  const groupLink = (req: express.Request, code: string) => `https://${process.env.PUBLIC_HOST || req.headers.host}/join?code=${code}`;
  app.get('/api/groups', ownerOnly, async (_req, res) => { res.json({ groups: await accounts.listGroups() }); });
  app.post('/api/groups', ownerOnly, async (req, res) => {
    const b = (req.body ?? {}) as { max?: unknown; days?: unknown; label?: unknown };
    try {
      const g = await accounts.createGroup(req.user!, Number(b.max ?? 30), Number(b.days ?? 7), typeof b.label === 'string' ? b.label.trim() : undefined);
      res.json({ id: g.id, link: groupLink(req, g.code), max: g.max, days: g.days });
    } catch (err) { fail(res, 400, err); }
  });
  app.delete('/api/groups/:id', ownerOnly, async (req, res) => {
    try { res.json({ revoked: await accounts.revokeGroup(String(req.params.id)) }); } catch (err) { fail(res, 400, err); }
  });

  app.delete('/api/people/:name', ownerOnly, async (req, res) => {
    try { res.json({ removed: await accounts.removeUser(req.params.name) }); } catch (err) { fail(res, 400, err); }
  });
}
