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
import express from 'express';
import * as accounts from './users.js';
import { setSecretSource } from './session.js';
import { HOSTED } from './http.js';
import { registerAuth } from './routes/auth.js';
import { registerLive } from './routes/live.js';
import { registerAnalytics } from './routes/analytics.js';
import { registerCron, registerDaily } from './routes/daily.js';
import { registerPlaces } from './routes/places.js';
import { registerAi, checkAi } from './routes/ai.js';

declare module 'express-serve-static-core' {
  /** user/role: signed in; guest: browsing without an account (only a few routes allow it) */
  interface Request { user?: string; role?: accounts.Role; guest?: boolean }
}

setSecretSource(accounts.sessionSecret); // signing key lives in the private account store

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  // API responses: never sniffed, framed, cached by proxies, or leaking the URL as a referrer.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', 'no-store');
  next();
});
// Requests that change something must come from this site (defence in depth on top of SameSite cookies).
app.use((req, res, next) => {
  if (!HOSTED || req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') { next(); return; }
  const origin = req.headers.origin;
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch { /* malformed */ }
    if (host !== req.headers.host) { res.status(403).json({ error: 'Cross-site request blocked.' }); return; }
  }
  next();
});
app.use(express.json({ limit: '256kb' }));

registerCron(app); // public: the hourly scheduler (checks its own secret)
registerAuth(app); // sign-in & invites (public), then the session guard, then people (owner)
registerLive(app);
registerAnalytics(app);
registerDaily(app);
registerPlaces(app);
registerAi(app);

export { checkAi };
export default app;
