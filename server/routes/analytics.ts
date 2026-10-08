// Usage analytics: every signed-in player's browser reports its visit; only the owner reads them.
import type express from 'express';
import * as accounts from '../users.js';
import { cleanSession, recentSessions, saveSession } from '../analytics.js';
import { HOSTED, fail, rateLimit } from '../http.js';

export function registerAnalytics(app: express.Express) {
  const me = (req: express.Request) => (HOSTED ? req.user! : accounts.normName(req.headers['x-gq-as']) || 'you');

  app.post('/api/analytics', rateLimit(40, 10 * 60_000), async (req, res) => {
    const s = cleanSession(me(req), req.body);
    if (!s) { fail(res, 400, 'Not a valid session.'); return; }
    try { await saveSession(s); res.json({ ok: true }); } catch (err) { fail(res, 500, err); }
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
