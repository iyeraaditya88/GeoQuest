// GeoQuest's brand pieces, in the promo ad's look (deep navy, gold, Space Grotesk): the logo mark
// (a globe with real coastlines and a gold orbit), Instagram's profile picture and two lockups,
// and the ad's thumbnail. Drawn as pages and photographed, like the ad.
//
//   npx tsx scripts/marketing/brand.mts
//
// Output: marketing/brand/ (logo-mark.svg, instagram-profile.png, logo-horizontal.png,
// logo-stacked.png) and marketing/ad/thumbnail.png.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { chromium } from 'playwright';
import { FEATURES_110 } from '../../src/lib/data';

const OUT = resolve('marketing', 'brand'), AD = resolve('marketing', 'ad');
mkdirSync(OUT, { recursive: true });

// ── The mark: Africa and Europe facing us, as on the app's icon ──
const R = 300;
const proj = geoOrthographic().scale(R).translate([R, R]).rotate([-14, -18, -8]).clipAngle(90);
const path = geoPath(proj);
const land = FEATURES_110.map((f) => path(f as never)).filter(Boolean).join('');
const grid = path(geoGraticule10()) ?? '';
/** The mark as SVG, `size` px square (the globe and its orbit fill it). */
export const mark = (id = 'm') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-130 -130 860 860">
  <defs>
    <radialGradient id="${id}sea" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#3b82f6"/><stop offset="0.55" stop-color="#1d4ed8"/><stop offset="1" stop-color="#0b1f5c"/></radialGradient>
    <linearGradient id="${id}land" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="0.5" stop-color="#fbbf24"/><stop offset="1" stop-color="#d97706"/></linearGradient>
    <radialGradient id="${id}shade" cx="35%" cy="30%" r="80%"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#020617" stop-opacity="0.55"/></radialGradient>
    <radialGradient id="${id}glow" cx="50%" cy="50%" r="50%"><stop offset="0.78" stop-color="#60a5fa" stop-opacity="0.32"/><stop offset="0.86" stop-color="#60a5fa" stop-opacity="0.12"/><stop offset="1" stop-color="#60a5fa" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}ring" x1="0" x2="1"><stop offset="0" stop-color="#fbbf24" stop-opacity="0.15"/><stop offset="0.55" stop-color="#fbbf24"/><stop offset="1" stop-color="#fff7d6"/></linearGradient>
    <clipPath id="${id}clip"><circle cx="${R}" cy="${R}" r="${R}"/></clipPath>
    <filter id="${id}spark" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>
  <circle cx="${R}" cy="${R}" r="${R * 1.24}" fill="url(#${id}glow)"/>
  <!-- the orbit, behind the globe -->
  <g transform="rotate(-16 ${R} ${R})"><path d="M ${R - 410} ${R} A 410 112 0 0 1 ${R + 410} ${R}" fill="none" stroke="#fbbf24" stroke-opacity="0.35" stroke-width="11" stroke-linecap="round"/></g>
  <circle cx="${R}" cy="${R}" r="${R}" fill="url(#${id}sea)"/>
  <g clip-path="url(#${id}clip)">
    <path d="${grid}" fill="none" stroke="#bfdbfe" stroke-opacity="0.16" stroke-width="1.6"/>
    <path d="${land}" fill="url(#${id}land)" stroke="#f59e0b" stroke-width="0.8" stroke-linejoin="round"/>
    <circle cx="${R}" cy="${R}" r="${R}" fill="url(#${id}shade)"/>
    <ellipse cx="${R * 0.7}" cy="${R * 0.55}" rx="${R * 0.55}" ry="${R * 0.38}" fill="#fff" fill-opacity="0.07"/>
  </g>
  <circle cx="${R}" cy="${R}" r="${R - 1.5}" fill="none" stroke="#93c5fd" stroke-opacity="0.5" stroke-width="3"/>
  <!-- the orbit in front, and the spark on it: the quest -->
  <g transform="rotate(-16 ${R} ${R})">
    <path d="M ${R + 410} ${R} A 410 112 0 0 1 ${R - 410} ${R}" fill="none" stroke="url(#${id}ring)" stroke-width="13" stroke-linecap="round"/>
    <g transform="translate(${R + 395} ${R - 34})">
      <circle r="30" fill="#fde68a" filter="url(#${id}spark)" opacity="0.6"/>
      <path d="M0 -46 C 5 -10 10 -5 46 0 C 10 5 5 10 0 46 C -5 10 -10 5 -46 0 C -10 -5 -5 -10 0 -46 Z" fill="#fff8e1"/>
    </g>
  </g>
</svg>`;

const font = (w: number) => pathToFileURL(resolve(`node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-${w}-normal.woff2`)).href;
const BASE_CSS = `@font-face { font-family: SG; font-weight: 500; src: url(${font(500)}); } @font-face { font-family: SG; font-weight: 700; src: url(${font(700)}); }
* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: SG, sans-serif; color: #fff; overflow: hidden; }
.bg { position: absolute; inset: 0; background: radial-gradient(45% 35% at 28% 22%, rgba(56,108,255,0.32), transparent 70%), radial-gradient(40% 30% at 78% 76%, rgba(251,191,36,0.16), transparent 70%), radial-gradient(85% 65% at 50% 45%, #0c1a3d 0%, #060b1d 55%, #03050d 100%); }
.vig { position: absolute; inset: 0; background: radial-gradient(75% 65% at 50% 50%, transparent 55%, rgba(0,0,0,0.5) 100%); }
.word { font-weight: 700; letter-spacing: -0.05em; } .word b { color: #fbbf24; font-weight: 700; }`;

const shot = (w: number, h: number, html: string, file: string, transparent = false) => ({ w, h, html: `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS} html, body { width: ${w}px; height: ${h}px; ${transparent ? 'background: transparent;' : 'background: #040712;'} }</style></head><body>${html}</body></html>`, file, transparent });

// (The thumbnail keeps everything inside the middle 4:5, y 285–1635: what Instagram's grid shows.)
// Stills for the thumbnail's phones (from the ad's footage).
const still = (name: string, t: number) => { const f = join(OUT, `.${name}.jpg`); execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(t), '-i', join(AD, 'shots', `${name}.mp4`), '-frames:v', '1', '-q:v', '2', '-vf', 'scale=720:1280', f]); return pathToFileURL(f).href; };
const phone = (src: string, style: string) => `<div class="ph" style="${style}"><div class="scr"><div class="st"><span>9:41</span><i></i></div><img src="${src}"></div><div class="isl"></div></div>`;
const PHONE_CSS = `.ph { position: absolute; width: 470px; height: 836px; border-radius: 64px; background: linear-gradient(145deg, #2a2f3d, #0b0d13 40%, #1c2030); box-shadow: 0 70px 140px -30px rgba(0,0,0,0.9), inset 0 0 0 2px rgba(255,255,255,0.14), inset 0 0 0 7px #05060a; }
.ph .scr { position: absolute; inset: 11px; border-radius: 54px; overflow: hidden; background: #050913; }
.ph .st { height: 50px; display: flex; align-items: center; justify-content: space-between; padding: 8px 40px 0 46px; font-weight: 700; font-size: 18px; }
.ph .st i { width: 40px; height: 12px; border-radius: 3px; border: 2px solid rgba(255,255,255,0.6); }
.ph img { width: 100%; height: calc(100% - 50px); object-fit: cover; object-position: 50% 0; display: block; }
.ph .isl { position: absolute; left: 50%; top: 22px; width: 126px; height: 36px; margin-left: -63px; border-radius: 20px; background: #000; }`;

const pieces = [
  // Instagram shows the profile picture as a circle, as small as 110 px: the mark alone, generous margins.
  shot(1080, 1080, `<div class="bg"></div><div style="position:absolute; inset: 150px;">${mark('p')}</div><div class="vig"></div>`, join(OUT, 'instagram-profile.png')),
  shot(2400, 800, `<div style="position:absolute; left: 40px; top: 40px; width: 720px; height: 720px;">${mark('h')}</div><div class="word" style="position:absolute; left: 820px; top: 0; bottom: 0; display:flex; align-items:center; font-size: 300px;">Geo<b>Quest</b></div>`, join(OUT, 'logo-horizontal.png'), true),
  shot(1600, 1600, `<div style="position:absolute; left: 380px; top: 110px; width: 840px; height: 840px;">${mark('s')}</div><div class="word" style="position:absolute; left: 0; right: 0; top: 1040px; text-align:center; font-size: 300px;">Geo<b>Quest</b></div>`, join(OUT, 'logo-stacked.png'), true),
  // (For light backgrounds: "Geo" in the navy, "Quest" a deeper gold that holds up on white.)
  shot(2400, 800, `<style>.word { color: #0b1a3d; } .word b { color: #d97706; }</style><div style="position:absolute; left: 40px; top: 40px; width: 720px; height: 720px;">${mark('hl')}</div><div class="word" style="position:absolute; left: 820px; top: 0; bottom: 0; display:flex; align-items:center; font-size: 300px;">Geo<b>Quest</b></div>`, join(OUT, 'logo-horizontal-on-light.png'), true),
  shot(1600, 1600, `<style>.word { color: #0b1a3d; } .word b { color: #d97706; }</style><div style="position:absolute; left: 380px; top: 110px; width: 840px; height: 840px;">${mark('sl')}</div><div class="word" style="position:absolute; left: 0; right: 0; top: 1040px; text-align:center; font-size: 300px;">Geo<b>Quest</b></div>`, join(OUT, 'logo-stacked-on-light.png'), true),
];
const thumb = shot(1080, 1920, `<style>${PHONE_CSS}</style><div class="bg"></div>
  <div style="position:absolute; left: 0; right: 0; top: 300px; text-align:center;">
    <div style="display:inline-flex; align-items:center; gap: 22px;"><div style="width: 84px; height: 84px;">${mark('t')}</div><div class="word" style="font-size: 58px;">Geo<b>Quest</b></div></div>
    <div class="word" style="margin-top: 26px; font-size: 106px; line-height: 0.98; letter-spacing: -0.055em;">The whole world<br><b>is your game board.</b></div>
  </div>
  ${phone(still('wordle', 11.6), 'left: -60px; top: 722px; transform: perspective(2400px) rotateY(24deg) rotateZ(-8deg) scale(0.86);')}
  ${phone(still('mystery', 13.8), 'right: -60px; top: 722px; transform: perspective(2400px) rotateY(-24deg) rotateZ(8deg) scale(0.86);')}
  ${phone(still('daily', 5.3), 'left: 305px; top: 650px; transform: perspective(2400px) rotateX(6deg); z-index: 2;')}
  <div style="position:absolute; left: 0; right: 0; top: 1518px; text-align:center;"><span style="display:inline-block; padding: 18px 44px; border-radius: 999px; font-weight: 700; font-size: 40px; color: #0a0e1a; background: linear-gradient(135deg, #fde68a, #fbbf24); box-shadow: 0 20px 60px -15px rgba(251,191,36,0.6);">Play free · playgeoquest.app</span></div>
  <div class="vig"></div>`, join(AD, 'thumbnail.png'));

writeFileSync(join(OUT, 'logo-mark.svg'), mark());
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
for (const p of [...pieces, thumb]) {
  const page = await browser.newPage({ viewport: { width: p.w, height: p.h } });
  const html = join(OUT, '.page.html');
  writeFileSync(html, p.html);
  await page.goto(pathToFileURL(html).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: p.file, omitBackground: p.transparent });
  await page.close();
  console.log(p.file);
}
await browser.close();
for (const f of readdirSync(OUT)) if (f.startsWith('.')) rmSync(join(OUT, f)); // (the stills and page it drew from)
