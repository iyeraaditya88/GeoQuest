// Debug mode (an easter egg: seven taps on the logo): a device that turned it on sends what it saw
// — the narrator's state, errors — every few seconds. Each report goes to the server log, tagged
// with the device's short code, to be read from the deployment's logs. Nothing is stored.
import type express from 'express';
import { rateLimit } from '../http.js';

const str = (v: unknown, n: number) => (typeof v === 'string' ? v : String(v ?? '')).replace(/[\r\n]+/g, ' ').slice(0, n);

export function registerDebug(app: express.Express) {
  app.post('/api/debug', rateLimit(150, 10 * 60_000), (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const code = typeof b.code === 'string' && /^[a-z0-9]{4,8}$/.test(b.code) ? b.code : null;
    if (!code) { res.status(400).end(); return; }
    const entries = (Array.isArray(b.entries) ? b.entries.slice(0, 200) : []).filter(Array.isArray) as unknown[][];
    if (b.first) console.log(`[debug ${code}] device ${str(b.ua, 220)} · ${str(b.screen, 40)} · ${str(b.app, 60)}`);
    for (const [t, kind, msg] of entries) {
      const at = Number(t);
      console.log(`[debug ${code}] ${Number.isFinite(at) ? new Date(at).toISOString().slice(11, 23) : '?'} ${str(kind, 16)} ${str(msg, 400)}`);
    }
    res.status(204).end();
  });
}
