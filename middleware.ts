// Vercel Routing Middleware (hosted site only).
// GeoQuest is open to guests: pages, scripts and data are public, and the API itself decides what
// needs an account (see the session guard in server/routes/auth.ts). Here we only move the old
// addresses to the main one, and give the sign-in page its clean URLs.
import { next, rewrite } from '@vercel/functions';
import { decodeChallenge, previewTitle } from './src/lib/challenge.js';

export const config = { runtime: 'nodejs' };

// The sign-in page (it also handles invites, game and group links, and first-time setup).
const PAGES = new Set(['/login', '/welcome', '/setup', '/join']);

// Old public addresses: everything moves to the main one (PUBLIC_HOST, e.g. playgeoquest.app), same
// path and query — so old invite links, bookmarks and installed apps still land in the right place.
// (The protected setup address and preview deployments are left alone.)
const OLD_HOSTS = new Set(['geoquest-app.vercel.app', 'geoquest-phi.vercel.app']);

// Link previews (WhatsApp, iMessage, Slack…) for a 5-country challenge: say who sent it and their
// score. Only for the preview bots — people get the app as usual.
const PREVIEW_BOTS = /facebookexternalhit|facebot|twitterbot|whatsapp|slackbot|telegrambot|discordbot|linkedinbot|skypeuripreview|redditbot|pinterest|embedly|vkshare|applebot|googlebot|bingbot/i;
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The home page's preview tags, retitled for a challenge link (unchanged if the token isn't valid). */
export function challengePreview(html: string, token: string | null) {
  const ch = decodeChallenge(token);
  if (!ch) return html;
  const title = attr(previewTitle(ch));
  const desc = 'Find the same 5 countries on a 3D globe — 3 tries each. Free, no sign-up needed.';
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta (?:property|name)="(?:og|twitter):title" content=")[^"]*"/g, `$1${title}"`)
    .replace(/(<meta (?:property|name)="(?:og|twitter):description" content=")[^"]*"/g, `$1${attr(desc)}"`);
}

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  const main = process.env.PUBLIC_HOST;
  if (main && OLD_HOSTS.has(url.host) && url.host !== main) {
    return new Response(null, { status: 308, headers: { Location: `https://${main}${url.pathname}${url.search}`, 'Cache-Control': 'no-store' } });
  }
  // Clean URLs for the one static auth page (vercel.json rewrites don't apply after middleware).
  if (PAGES.has(url.pathname)) return rewrite(new URL('/login.html' + url.search, url));
  if (url.pathname === '/' && url.searchParams.has('ch') && PREVIEW_BOTS.test(request.headers.get('user-agent') ?? '')) {
    try {
      const page = await fetch(new URL('/index.html', url));
      if (page.ok) {
        return new Response(challengePreview(await page.text(), url.searchParams.get('ch')), {
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
        });
      }
    } catch { /* fall through to the normal page */ }
  }
  return next();
}
