// Vercel Routing Middleware (hosted site only).
// GeoQuest is open to guests: pages, scripts and data are public, and the API itself decides what
// needs an account (see the session guard in server/routes/auth.ts). Here we only move the old
// addresses to the main one, and give the sign-in page its clean URLs.
import { next, rewrite } from '@vercel/functions';

export const config = { runtime: 'nodejs' };

// The sign-in page (it also handles invites, game and group links, and first-time setup).
const PAGES = new Set(['/login', '/welcome', '/setup', '/join']);

// Old public addresses: everything moves to the main one (PUBLIC_HOST, e.g. playgeoquest.app), same
// path and query — so old invite links, bookmarks and installed apps still land in the right place.
// (The protected setup address and preview deployments are left alone.)
const OLD_HOSTS = new Set(['geoquest-app.vercel.app', 'geoquest-phi.vercel.app']);

export default function middleware(request: Request) {
  const url = new URL(request.url);
  const main = process.env.PUBLIC_HOST;
  if (main && OLD_HOSTS.has(url.host) && url.host !== main) {
    return new Response(null, { status: 308, headers: { Location: `https://${main}${url.pathname}${url.search}`, 'Cache-Control': 'no-store' } });
  }
  // Clean URLs for the one static auth page (vercel.json rewrites don't apply after middleware).
  if (PAGES.has(url.pathname)) return rewrite(new URL('/login.html' + url.search, url));
  return next();
}
