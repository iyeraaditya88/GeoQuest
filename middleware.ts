// Vercel Routing Middleware: the whole hosted site sits behind a sign-in.
// Runs on Vercel only (local `npm run dev` has no login). Every request — pages, scripts,
// textures, data and API — needs a valid session cookie; otherwise pages redirect to
// /login and API calls get 401. Fails closed: with no SESSION_SECRET nobody gets in.
import { next, rewrite } from '@vercel/functions';
import { SESSION_COOKIE, readCookie, verifySession } from './server/session.js';

// Reachable without signing in: the login page itself and what it needs.
const PUBLIC = new Set(['/login', '/login.html', '/api/login', '/api/logout', '/favicon.svg', '/textures/loader-earth.jpg']);

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  // Serve the clean /login URL from the static page (vercel.json rewrites don't apply after middleware).
  if (url.pathname === '/login') return rewrite(new URL('/login.html' + url.search, url));
  if (PUBLIC.has(url.pathname)) return next();

  const session = await verifySession(readCookie(request.headers.get('cookie'), SESSION_COOKIE));
  if (session) return next();

  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Please sign in.' }), { status: 401, headers: { 'content-type': 'application/json' } });
  }
  const login = new URL('/login', url);
  if (url.pathname !== '/' || url.search) login.searchParams.set('next', url.pathname + url.search);
  return new Response(null, { status: 302, headers: { Location: login.toString(), 'Cache-Control': 'no-store' } });
}
