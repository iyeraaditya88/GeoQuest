// Vercel Routing Middleware (hosted site only).
// GeoQuest is open to guests: pages, scripts and data are public, and the API itself decides what
// needs an account (see the session guard in server/routes/auth.ts). Here we only move the old
// addresses to the main one, and give the sign-in page its clean URLs.
import { next, rewrite } from '@vercel/functions';
import { dailyNumber, localDate } from './src/lib/daily.js';
import { isCountryPath } from './src/lib/countryPages.js';
import { GAME_PITCH, isShareGame } from './src/lib/shareGames.js';
import { decodeWordle, wordleScore } from './src/lib/wordleResult.js';

export const config = { runtime: 'nodejs' };

// The sign-in page (it also handles invites, game and group links, and first-time setup).
const PAGES = new Set(['/login', '/welcome', '/setup', '/join']);
// About, Privacy and Terms: static pages, at clean URLs.
const INFO_PAGES = new Set(['/about', '/privacy', '/terms', '/countries']);

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
  const scored = Number.isInteger(no) && no >= 1 && no <= dailyNumber(localDate(Date.now(), 'UTC')) + 1 && /^[0-3]{5}$/.test(r);
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

/** A shared Geo Wordle (/?wordle=42&r=gyxxg.ggggg): its score in the title, its grid in the picture. */
export function wordlePreview(html: string, url?: URL) {
  const no = Number(url?.searchParams.get('wordle'));
  const game = decodeWordle(url?.searchParams.get('r'), url?.searchParams.get('h'));
  const ok = !!url && !!game && Number.isInteger(no) && no >= 1 && no <= dailyNumber(localDate(Date.now(), 'UTC')) + 1;
  const title = ok ? `Geo Wordle #${no} — ${wordleScore(game.rows)}. Can you beat it?` : `${GAME_PITCH.wordle.name} on GeoQuest — can you beat me?`;
  const desc = 'Guess today’s country in six tries — every guess a real country. Free, on a 3D globe, no sign-up needed.';
  let out = html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta (?:property|name)="(?:og|twitter):title" content=")[^"]*"/g, `$1${title}"`)
    .replace(/(<meta (?:property|name)="(?:og|twitter):description" content=")[^"]*"/g, `$1${desc}"`);
  if (ok) {
    const img = `https://${url.host}/api/og/wordle?n=${no}&r=${encodeURIComponent(game.rows.join('.'))}${game.hints ? `&h=${game.hints}` : ''}`;
    out = out
      .replace(/(<meta (?:property|name)="(?:og|twitter):image" content=")[^"]*"/g, `$1${img}"`)
      .replace(/(<meta property="og:image:alt" content=")[^"]*"/, `$1Geo Wordle #${no}: ${wordleScore(game.rows)}"`);
  }
  return out;
}

/** The home page's preview tags, retitled for a shared game link (/?game=wordle). */
export function gamePreview(html: string, url?: URL) {
  const g = url?.searchParams.get('game');
  if (!isShareGame(g)) return html;
  const title = `${GAME_PITCH[g].name} on GeoQuest — can you beat me?`;
  const desc = `${GAME_PITCH[g].pitch}. Free, on a 3D globe, no sign-up needed.`;
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta (?:property|name)="(?:og|twitter):title" content=")[^"]*"/g, `$1${esc(title)}"`)
    .replace(/(<meta (?:property|name)="(?:og|twitter):description" content=")[^"]*"/g, `$1${esc(desc)}"`);
}

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  const main = process.env.PUBLIC_HOST;
  if (main && OLD_HOSTS.has(url.host) && url.host !== main) {
    return new Response(null, { status: 308, headers: { Location: `https://${main}${url.pathname}${url.search}`, 'Cache-Control': 'no-store' } });
  }
  // Clean URLs for the one static auth page (vercel.json rewrites don't apply after middleware).
  if (PAGES.has(url.pathname)) return rewrite(new URL('/login.html' + url.search, url));
  if (INFO_PAGES.has(url.pathname)) return rewrite(new URL(`${url.pathname}.html`, url));
  if (isCountryPath(url.pathname)) return rewrite(new URL(`${url.pathname}.html`, url)); // /country/india → the built page
  const shared = url.searchParams.has('daily') ? dailyPreview : url.searchParams.has('wordle') ? wordlePreview : url.searchParams.has('game') ? gamePreview : null;
  if (url.pathname === '/' && shared && PREVIEW_BOTS.test(request.headers.get('user-agent') ?? '')) {
    try {
      const page = await fetch(new URL('/index.html', url));
      if (page.ok) return new Response(shared(await page.text(), url), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
    } catch { /* fall through to the normal page */ }
  }
  return next();
}
