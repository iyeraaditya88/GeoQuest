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

// Link previews (WhatsApp, iMessage, Slack…) for a shared Daily result (/?daily=1): invite whoever
// sees it to play today's. Only for the preview bots — people get the app as usual.
const PREVIEW_BOTS = /facebookexternalhit|facebot|twitterbot|whatsapp|slackbot|telegrambot|discordbot|linkedinbot|skypeuripreview|redditbot|pinterest|embedly|vkshare|applebot|googlebot|bingbot/i;
const DAILY_TITLE = 'GeoQuest Daily — can you find today’s 5 countries?';
const DAILY_DESC = 'A new set of 5 countries every day. Find them on a 3D globe in 3 tries each, then share your squares. Free, no sign-up needed.';

/**
 * The home page's preview tags, retitled for a shared Daily link — and when the link carries a
 * score (?daily=42&r=33231), the picture shows it: "Daily #42 · 13/15" with the squares.
 */
export function dailyPreview(html: string, url?: URL) {
  const no = Number(url?.searchParams.get('daily'));
  const r = url?.searchParams.get('r') ?? '';
  const scored = Number.isInteger(no) && no >= 1 && no <= 100_000 && /^[0-3]{5}$/.test(r);
  const score = [...r].reduce((s, c) => s + Number(c), 0);
  const title = scored ? `GeoQuest Daily #${no} — ${score}/15. Can you beat it?` : DAILY_TITLE;
  let out = html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta (?:property|name)="(?:og|twitter):title" content=")[^"]*"/g, `$1${title}"`)
    .replace(/(<meta (?:property|name)="(?:og|twitter):description" content=")[^"]*"/g, `$1${DAILY_DESC}"`);
  if (scored && url) {
    const img = `https://${url.host}/api/og/daily?n=${no}&r=${r}`;
    out = out
      .replace(/(<meta (?:property|name)="(?:og|twitter):image" content=")[^"]*"/g, `$1${img}"`)
      .replace(/(<meta property="og:image:alt" content=")[^"]*"/, `$1GeoQuest Daily #${no}: ${score} out of 15"`);
  }
  return out;
}

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  const main = process.env.PUBLIC_HOST;
  if (main && OLD_HOSTS.has(url.host) && url.host !== main) {
    return new Response(null, { status: 308, headers: { Location: `https://${main}${url.pathname}${url.search}`, 'Cache-Control': 'no-store' } });
  }
  // Clean URLs for the one static auth page (vercel.json rewrites don't apply after middleware).
  if (PAGES.has(url.pathname)) return rewrite(new URL('/login.html' + url.search, url));
  if (url.pathname === '/' && url.searchParams.has('daily') && PREVIEW_BOTS.test(request.headers.get('user-agent') ?? '')) {
    try {
      const page = await fetch(new URL('/index.html', url));
      if (page.ok) return new Response(dailyPreview(await page.text(), url), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
    } catch { /* fall through to the normal page */ }
  }
  return next();
}
