// Vercel Routing Middleware: the whole hosted site sits behind a sign-in.
// Runs on Vercel only (local `npm run dev` has no login). Every request — pages, scripts,
// textures, data and API — needs a valid session cookie; otherwise pages redirect to
// /login and API calls get 401. Fails closed: with no signing key nobody gets in.
import { next, rewrite } from '@vercel/functions';
import { SESSION_COOKIE, authConfigured, readCookie, setSecretSource, verifySession } from './server/session.js';
import { sessionSecret } from './server/users.js';

// Node runtime: the signing key is read from the private account store (then cached).
export const config = { runtime: 'nodejs' };
setSecretSource(sessionSecret);

// Reachable without signing in: the sign-in page (which also handles invites and first-time
// setup) and what it needs.
const PAGES = new Set(['/login', '/welcome', '/setup', '/join']);
const PUBLIC = new Set(['/login.html', '/login.js', '/api/login', '/api/logout', '/api/setup', '/api/invite', '/api/invite/accept', '/api/invites/info', '/api/invites/signup', '/api/cron/morning', '/api/group', '/api/group/join', '/favicon.svg', '/textures/loader-earth.jpg', '/manifest.webmanifest', '/sw.js']);
// App icons are public too: the home screen and the sign-in page need them.
const PUBLIC_PREFIX = ['/icons/'];

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  // Clean URLs for the one static auth page (vercel.json rewrites don't apply after middleware).
  if (PAGES.has(url.pathname)) return rewrite(new URL('/login.html' + url.search, url));
  if (PUBLIC.has(url.pathname) || PUBLIC_PREFIX.some((p) => url.pathname.startsWith(p))) return next();

  const session = await verifySession(readCookie(request.headers.get('cookie'), SESSION_COOKIE));
  if (session) return next();

  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Please sign in.' }), { status: 401, headers: { 'content-type': 'application/json' } });
  }
  const login = new URL('/login', url);
  if (url.pathname !== '/' || url.search) login.searchParams.set('next', url.pathname + url.search);
  // x-gq-auth: whether sign-in is wired up (handy when checking a deployment; not sensitive).
  return new Response(null, { status: 302, headers: { Location: login.toString(), 'Cache-Control': 'no-store', 'x-gq-auth': (await authConfigured()) ? 'ready' : 'not-configured' } });
}
