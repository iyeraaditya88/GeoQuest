// Shared HTTP helpers for the API: cookies, rate limits, error replies.
import type express from 'express';
import { SESSION_COOKIE, SESSION_DAYS, readCookie, signSession } from './session.js';

/** Running as a public deployment (Vercel), not on your own machine. */
export const HOSTED = !!process.env.VERCEL;

export const MLY_COOKIE = 'gq_mly';
const DAY = 86400;

// Cookies on the hosted site are always Secure (https) and, for credentials, httpOnly.
export function setCookie(res: express.Response, name: string, value: string, opts: { days: number; sameSite?: 'Lax' | 'Strict'; httpOnly?: boolean }) {
  res.append('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${Math.round(opts.days * DAY)}; ${opts.httpOnly === false ? '' : 'HttpOnly; '}Secure; SameSite=${opts.sameSite ?? 'Lax'}`);
}
export const clearCookie = (res: express.Response, name: string) => res.append('Set-Cookie', `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
export const cookie = (req: express.Request, name: string) => readCookie(req.headers.cookie, name);

// Best-effort rate limit (per server instance), keyed by user when signed in, else by IP.
export function rateLimit(max: number, windowMs: number, message = 'Too many requests — take a breather and try again in a few minutes.'): express.RequestHandler {
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

export const fail = (res: express.Response, status: number, err: unknown) => {
  // 4xx messages are ours and meant for the user; 5xx details stay in the server log.
  if (status >= 500 && err instanceof Error) {
    console.error('[geoquest]', err);
    return res.status(status).json({ error: 'Something went wrong on our side — please try again.' });
  }
  return res.status(status).json({ error: err instanceof Error ? err.message : String(err) });
};
export const signIn = async (res: express.Response, u: { name: string; sv?: number }) => setCookie(res, SESSION_COOKIE, await signSession(u.name, u.sv ?? 0), { days: SESSION_DAYS });
// Each auth route gets its own budget (opening an invite shouldn't eat into signing in).
export const authLimit = (max: number) => rateLimit(max, 10 * 60_000, 'Too many attempts — wait a few minutes and try again.');
