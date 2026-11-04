// Feedback: anyone can send it (guests too); only the owner reads it — and gets a notification.
import type express from 'express';
import * as accounts from '../users.js';
import * as alerts from '../alerts.js';
import * as push from '../push.js';
import { placeFrom } from '../analytics.js';
import { addReply, boxFor, cleanFeedback, cleanReply, getFeedback, guestBox, listFeedback, readMail, saveFeedback, setStatus, type Feedback, type Mail } from '../feedback.js';
import { HOSTED, fail, rateLimit } from '../http.js';

const LABEL: Record<Feedback['kind'], string> = { idea: '💡 Improvement', bug: '🐞 Bug', feature: '✨ Feature request', other: '💬 Feedback' };

/** Tell the owner on their phone (if they've turned notifications on). Never fails the request. */
const notifyOwner = (f: Feedback) => alerts.notifyOwner({
  title: LABEL[f.kind],
  body: `${f.user === 'guest' ? 'A guest' : f.user}: ${f.text.length > 110 ? `${f.text.slice(0, 107)}…` : f.text}`,
  url: '/?inbox=1', tag: `feedback-${f.id}`,
});

/** Tell a player their message was answered, on the devices where notifications are on. Never throws. */
async function notifyPlayer(f: Feedback, text: string) {
  try {
    const prefs = await push.getPrefs(f.user);
    if (!prefs?.subs.length) return 0;
    const note = { title: '💬 GeoQuest replied to you', body: text.length > 110 ? `${text.slice(0, 107)}…` : text, url: '/?replies=1', tag: `reply-${f.id}` };
    return (await push.sendTo(prefs, note)).sent;
  } catch (err) { console.warn('[feedback] reply notification failed', (err as Error).message); return 0; }
}
const isEmail = (s?: string) => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

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
    try { res.json({ feedback: (await listFeedback()).map(({ box, ...f }) => ({ ...f, hasBox: !!box })) }); } catch (err) { fail(res, 500, err); }
  });

  app.patch('/api/feedback/:id', rateLimit(60, 10 * 60_000), async (req, res) => {
    if (HOSTED && req.role !== 'owner') { fail(res, 403, 'Only the owner can change feedback.'); return; }
    const status = req.body?.status === 'done' ? 'done' : 'new';
    try {
      if (!(await setStatus(String(req.params.id), status))) { fail(res, 404, 'Not found.'); return; }
      res.json({ ok: true });
    } catch (err) { fail(res, 500, err); }
  });

  // Answer a message. Accounts and new guests get it in the app; an older guest message can only be
  // answered by email, from the owner's own mail app (we just note that it was).
  app.post('/api/feedback/:id/reply', rateLimit(60, 10 * 60_000), async (req, res) => {
    if (HOSTED && req.role !== 'owner') { fail(res, 403, 'Only the owner can reply to feedback.'); return; }
    const text = cleanReply(req.body?.text);
    if (!text) { fail(res, 400, 'Write a reply first.'); return; }
    const via = req.body?.via === 'email' ? 'email' : 'app';
    try {
      const f = await getFeedback(String(req.params.id));
      if (!f) { fail(res, 404, 'Not found.'); return; }
      if (via === 'email' && !isEmail(f.contact)) { fail(res, 400, 'They didn’t leave an email address.'); return; }
      if (via === 'app') {
        if (!boxFor(f)) { fail(res, 409, 'This guest left no way to reach them.'); return; }
        // The name may be gone, or belong to someone new by now: never hand them this reply.
        const account = f.user !== 'guest' && HOSTED ? await accounts.getUser(f.user, true) : null;
        if (f.user !== 'guest' && HOSTED && (!account?.password || account.createdAt > f.at)) { fail(res, 410, 'That account no longer exists.'); return; }
      }
      const reply = await addReply(f, text, via);
      const notified = via === 'app' && f.user !== 'guest' ? await notifyPlayer(f, text) : 0;
      res.json({ reply, notified });
    } catch (err) { fail(res, 500, err); }
  });

  // My replies (the app asks when it opens). A guest's key comes in a header, never the address.
  app.get('/api/feedback/replies', rateLimit(60, 10 * 60_000), async (req, res) => {
    const user = me(req), guest = guestBox(req.headers['x-gq-reply-key']);
    try {
      const [mine, asGuest] = await Promise.all([user === 'guest' ? [] : readMail(`u/${user}`), guest ? readMail(`g/${guest}`) : []]);
      // Only what's newer than the account: a removed name may have been taken again since.
      const since = user !== 'guest' && HOSTED ? (await accounts.getUser(user))?.createdAt ?? 0 : 0;
      const replies: Mail[] = [...mine.filter((m) => m.at >= since), ...asGuest].sort((a, b) => b.at - a.at);
      res.json({ replies });
    } catch (err) { fail(res, 500, err); }
  });
}
