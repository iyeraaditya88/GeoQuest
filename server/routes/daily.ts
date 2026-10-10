// The Daily challenge (results, streaks, today's board) and morning reminders (notifications).
import { timingSafeEqual } from 'node:crypto';
import type express from 'express';
import * as accounts from '../users.js';
import * as daily from '../daily.js';
import * as push from '../push.js';
import { HOSTED, fail, rateLimit } from '../http.js';
import { addDays, localDate } from '../../src/lib/daily.js';

const me = (req: express.Request) => (HOSTED ? req.user ?? null : accounts.normName(req.headers['x-gq-as']) || 'you');

/** Public: the hourly scheduler (GitHub Actions) — registered before the sign-in guard. */
export function registerCron(app: express.Express) {
  app.post('/api/cron/morning', rateLimit(30, 60 * 60_000), async (req, res) => {
    // Refuses everything unless CRON_SECRET is set and matches.
    const secret = process.env.CRON_SECRET ?? '';
    const got = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
    const ok = secret.length >= 16 && got.length === secret.length && timingSafeEqual(Buffer.from(got), Buffer.from(secret));
    if (!ok) { fail(res, 401, 'Not allowed.'); return; }
    try {
      const out = await push.morningRun(daily.played, async (u, d) => {
        // The streak they'd be keeping alive today (it's still standing if they played yesterday).
        const s = await daily.getStreak(u);
        return s.last === addDays(d, -1) ? s.count : 0;
      });
      console.log('[push] morning run', out);
      res.json(out);
    } catch (err) { fail(res, 500, err); }
  });
}

export function registerDaily(app: express.Express) {
  app.get('/api/daily', async (req, res) => {
    const date = String(req.query.date ?? '');
    if (!daily.playableDate(date)) { fail(res, 400, 'Not a valid day.'); return; }
    try {
      const user = me(req);
      // Guests play too, but don't see who else played (names are for signed-in friends).
      if (!user) { res.json({ date, mine: null, streak: { count: 0, best: 0 }, board: [], guest: true }); return; }
      const [mine, streak, board] = await Promise.all([daily.getResult(user, date), daily.getStreak(user), daily.board(date)]);
      res.json({ date, mine: mine?.points ?? null, streak: daily.currentStreak(streak, date), board });
    } catch (err) { fail(res, 500, err); }
  });

  app.post('/api/daily', rateLimit(20, 10 * 60_000), async (req, res) => {
    const { date, points } = (req.body ?? {}) as { date?: unknown; points?: unknown };
    if (!daily.playableDate(date)) { fail(res, 400, 'Not a valid day.'); return; }
    try {
      const { streak } = await daily.saveResult(me(req)!, date, points);
      res.json({ ok: true, streak: daily.currentStreak(streak, date), board: await daily.board(date) });
    } catch (err) { const m = (err as Error).message; fail(res, /already/i.test(m) ? 409 : /finished/i.test(m) ? 400 : 500, err); }
  });

  // ── Morning reminders ──
  app.get('/api/push', async (req, res) => {
    try {
      const p = await push.getPrefs(me(req)!);
      res.json({ key: await push.publicKey(), hour: p?.hour ?? 8, tz: p?.tz ?? null, endpoints: (p?.subs ?? []).map((s) => s.endpoint) });
    } catch (err) { fail(res, 500, err); }
  });

  app.post('/api/push', rateLimit(30, 10 * 60_000), async (req, res) => {
    const { subscription, hour, tz } = (req.body ?? {}) as { subscription?: unknown; hour?: unknown; tz?: unknown };
    const sub = push.cleanSub(subscription);
    const h = Number(hour);
    if (!sub || !Number.isInteger(h) || h < 0 || h > 23 || !push.validTz(tz)) { fail(res, 400, 'That reminder couldn’t be saved — try again.'); return; }
    try {
      const prev = await push.getPrefs(me(req)!);
      await push.setPrefs(me(req)!, push.withSub(prev, sub, h, tz));
      res.json({ ok: true, hour: h });
    } catch (err) { fail(res, 500, err); }
  });

  app.delete('/api/push', rateLimit(30, 10 * 60_000), async (req, res) => {
    const endpoint = String((req.body as { endpoint?: unknown })?.endpoint ?? '');
    try {
      const p = await push.getPrefs(me(req)!);
      if (p) await push.setPrefs(me(req)!, { ...p, subs: p.subs.filter((s) => s.endpoint !== endpoint) });
      res.json({ ok: true });
    } catch (err) { fail(res, 500, err); }
  });

  // "Send a test": to my own devices only.
  app.post('/api/push/test', rateLimit(5, 10 * 60_000), async (req, res) => {
    try {
      const p = await push.getPrefs(me(req)!);
      if (!p?.subs.length) { fail(res, 400, 'Turn the reminder on first.'); return; }
      const date = localDate(Date.now(), p.tz);
      const { alive, sent } = await push.sendTo(p, { ...push.morningNote(date, 0), title: '🌍 GeoQuest reminders are on!', body: `You’ll get one at ${p.hour}:00 each morning. Tap to play today’s Daily.` });
      if (alive.length !== p.subs.length) await push.setPrefs(me(req)!, { ...p, subs: alive });
      if (!sent) { fail(res, 400, 'This device didn’t accept the notification — try turning the reminder off and on.'); return; }
      res.json({ ok: true, sent });
    } catch (err) { fail(res, 500, err); }
  });
}
