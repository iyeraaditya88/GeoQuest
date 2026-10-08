// Live play: players, favourites, realtime tokens, challenges, invite links and match results.
import type express from 'express';
import * as accounts from '../users.js';
import * as live from '../live.js';
import * as prefs from '../prefs.js';
import { historyFor, saveMatch, type MatchRecord } from '../matches.js';
import { HOSTED, fail, rateLimit } from '../http.js';

export function registerLive(app: express.Express) {
  // ── Live matches ──
  // Hosted: Ably, with tokens scoped by signed match tickets (server/live.ts). Locally there's no
  // login and no Ably — the browser plays over a BroadcastChannel between tabs, and says who it is.
  const me = (req: express.Request) => (HOSTED ? req.user! : accounts.normName(req.headers['x-gq-as']) || 'you');

  // Everyone signed in can see who else plays (names only — managing people stays owner-only).
  app.get('/api/players', async (req, res) => {
    if (!HOSTED) { res.json({ players: [] }); return; }
    const people = (await accounts.listUsers()).filter((p) => p.status === 'active' && p.name !== req.user);
    const seen = await prefs.lastSeen(people.map((p) => p.name));
    res.json({ players: people.map((p) => ({ name: p.name, lastLogin: Math.max(p.lastLogin ?? 0, seen[p.name] ?? 0) || null })) });
  });

  // Favourite friends (per player).
  app.get('/api/favorites', async (req, res) => { res.json({ favorites: await prefs.getFavorites(me(req)) }); });
  app.put('/api/favorites', rateLimit(60, 10 * 60_000), async (req, res) => {
    const list = (req.body as { favorites?: unknown })?.favorites;
    const favorites = [...new Set((Array.isArray(list) ? list : []).map(accounts.normName))].filter((n) => accounts.validName(n) && n !== me(req)).slice(0, 40);
    try { await prefs.setFavorites(me(req), favorites); res.json({ favorites }); } catch (err) { fail(res, 500, err); }
  });

  // Open invite links: pick a game, share the link; anyone signed in who opens it joins your lobby.
  app.post('/api/invites', rateLimit(40, 10 * 60_000), async (req, res) => {
    if (!HOSTED || !live.liveConfigured()) { fail(res, 404, 'Live play isn’t set up.'); return; }
    const body = req.body as { game?: unknown; opts?: unknown };
    const game = body.game as live.GameId;
    if (!live.GAMES.includes(game)) { fail(res, 400, 'Unknown game.'); return; }
    const opts = typeof body.opts === 'object' && body.opts ? body.opts : {};
    const id = live.newMatchId();
    const signup = req.role === 'owner'; // only the owner brings new people in
    res.json({ id, signup, token: await live.issueOpenInvite({ m: id, host: req.user!, game, opts, signup }), ticket: await live.issueTicket({ m: id, host: req.user!, players: [req.user!], game }) });
  });
  app.post('/api/invites/join', rateLimit(60, 10 * 60_000), async (req, res) => {
    if (!HOSTED || !live.liveConfigured()) { fail(res, 404, 'Live play isn’t set up.'); return; }
    const t = await live.readOpenInvite((req.body as { token?: unknown })?.token);
    if (!t) { fail(res, 400, 'This invite link has expired — ask for a new one.'); return; }
    if (t.host === req.user) { fail(res, 400, 'That’s your own invite link — send it to a friend.'); return; }
    res.json({ id: t.m, host: t.host, game: t.game, opts: t.opts, ticket: await live.issueTicket({ m: t.m, host: t.host, players: [t.host, req.user!], game: t.game }) });
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
}
