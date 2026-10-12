// Feedback: anyone can send it (guests too); only the owner reads it — and gets a notification.
import type express from 'express';
import * as accounts from '../users.js';
import * as push from '../push.js';
import { placeFrom } from '../analytics.js';
import { cleanFeedback, listFeedback, saveFeedback, setStatus, type Feedback } from '../feedback.js';
import { HOSTED, fail, rateLimit } from '../http.js';

const LABEL: Record<Feedback['kind'], string> = { idea: '💡 Improvement', bug: '🐞 Bug', feature: '✨ Feature request', other: '💬 Feedback' };

/** Tell the owner on their phone (if they've turned notifications on). Never fails the request. */
async function notifyOwner(f: Feedback) {
  try {
    const owner = (await accounts.listUsers()).find((u) => u.role === 'owner');
    const prefs = owner ? await push.getPrefs(owner.name) : null;
    if (!prefs?.subs.length) return;
    const body = `${f.user === 'guest' ? 'A guest' : f.user}: ${f.text.length > 110 ? `${f.text.slice(0, 107)}…` : f.text}`;
    await push.sendTo(prefs, { title: LABEL[f.kind], body, url: '/?inbox=1', tag: `feedback-${f.id}` });
  } catch (err) { console.warn('[feedback] notify failed', (err as Error).message); }
}

export function registerFeedback(app: express.Express) {
  const me = (req: express.Request) => (HOSTED ? req.user ?? 'guest' : accounts.normName(req.headers['x-gq-as']) || 'you');

  app.post('/api/feedback', rateLimit(6, 60 * 60_000, 'Thanks — that’s plenty of feedback for now. Try again in a while.'), async (req, res) => {
    const f = cleanFeedback(me(req), req.body);
    if (typeof f === 'string') { if (f === 'Thanks!') res.json({ ok: true }); else fail(res, 400, f); return; }
    const place = HOSTED ? placeFrom(req.headers) : undefined;
    if (place) f.place = place;
    try {
      await saveFeedback(f);
      await notifyOwner(f);
      res.json({ ok: true });
    } catch (err) { fail(res, 500, err); }
  });

  app.get('/api/feedback', rateLimit(30, 10 * 60_000), async (req, res) => {
    if (HOSTED && req.role !== 'owner') { fail(res, 403, 'Only the owner can read feedback.'); return; }
    try { res.json({ feedback: await listFeedback() }); } catch (err) { fail(res, 500, err); }
  });

  app.patch('/api/feedback/:id', rateLimit(60, 10 * 60_000), async (req, res) => {
    if (HOSTED && req.role !== 'owner') { fail(res, 403, 'Only the owner can change feedback.'); return; }
    const status = req.body?.status === 'done' ? 'done' : 'new';
    try {
      if (!(await setStatus(String(req.params.id), status))) { fail(res, 404, 'Not found.'); return; }
      res.json({ ok: true });
    } catch (err) { fail(res, 500, err); }
  });
}
