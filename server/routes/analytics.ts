// Usage analytics: every signed-in player's browser reports its visit; only the owner reads them.
import type express from 'express';
import * as accounts from '../users.js';
import { cleanSession, placeFrom, recentSessions, saveSession } from '../analytics.js';
import { HOSTED, fail, rateLimit } from '../http.js';
import * as alerts from '../alerts.js';

export function registerAnalytics(app: express.Express) {
  const me = (req: express.Request) => (HOSTED ? req.user ?? 'guest' : accounts.normName(req.headers['x-gq-as']) || 'you');

  app.post('/api/analytics', rateLimit(40, 10 * 60_000), async (req, res) => {
    const s = cleanSession(me(req), req.body);
    if (!s) { fail(res, 400, 'Not a valid session.'); return; }
    const place = HOSTED ? placeFrom(req.headers) : undefined;
    if (place) s.place = place;
    // A guest's first report of a visit (once they've stayed a little while): tell the owner.
    if (HOSTED && !req.user && (req.body as { first?: unknown })?.first === true && s.active >= 15) await alerts.guestVisit(s);
    try { await saveSession(s); res.json({ ok: true }); } catch (err) { fail(res, 500, err); }
  });

  // The owner's notification switches (new players, guest visits) and how many devices get them.
  app.get('/api/alerts', async (req, res) => {
    if (HOSTED && req.role !== 'owner') { fail(res, 403, 'Only the owner can change notifications.'); return; }
    try { res.json({ ...(await alerts.getSettings()), devices: await alerts.ownerDeviceCount() }); } catch (err) { fail(res, 500, err); }
  });
  app.put('/api/alerts', rateLimit(30, 10 * 60_000), async (req, res) => {
    if (HOSTED && req.role !== 'owner') { fail(res, 403, 'Only the owner can change notifications.'); return; }
    const b = (req.body ?? {}) as { signups?: unknown; guests?: unknown };
    const next: Partial<alerts.AlertSettings> = {};
    if (typeof b.signups === 'boolean') next.signups = b.signups;
    if (typeof b.guests === 'boolean') next.guests = b.guests;
    try { res.json(await alerts.setSettings(next)); } catch (err) { fail(res, 500, err); }
  });

  app.get('/api/analytics', rateLimit(30, 10 * 60_000), async (req, res) => {
    if (HOSTED && req.role !== 'owner') { fail(res, 403, 'Only the owner can see activity.'); return; }
    const days = Math.min(90, Math.max(1, Math.round(Number(req.query.days) || 7)));
    try {
      const [sessions, people] = await Promise.all([recentSessions(days), HOSTED ? accounts.listUsers() : Promise.resolve([])]);
      res.json({ sessions, me: me(req), people: people.map((p) => ({ name: p.name, role: p.role, status: p.status, createdAt: p.createdAt, lastLogin: p.lastLogin })) });
    } catch (err) { fail(res, 500, err); }
  });
}
