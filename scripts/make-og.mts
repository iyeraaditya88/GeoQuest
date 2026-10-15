// The link-preview pictures (1200×630) for the home page and invite links: npx tsx scripts/make-og.mts
// Writes public/icons/og-card.jpg and og-invite-card.jpg. Rendered with the same satori + resvg as the
// Daily share cards; the big globe is drawn from real coastlines like the app icon.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createElement as h, type ReactNode } from 'react';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { geoOrthographic, geoPath, geoGraticule10 } from 'd3-geo';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const font = (w: number) => readFileSync(require.resolve(`@fontsource/space-grotesk/files/space-grotesk-latin-${w}-normal.woff`));
const fonts = ([500, 700] as const).map((weight) => ({ name: 'Space Grotesk', weight, style: 'normal' as const, data: font(weight) }));
const png = (svg: string, width: number) => new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
const dataUri = (b: Buffer | Uint8Array, type = 'image/png') => `data:${type};base64,${Buffer.from(b).toString('base64')}`;

// ── The globe (transparent, with its orbit and the quest star) ──
const land = JSON.parse(readFileSync('node_modules/world-atlas/land-50m.json', 'utf8'));
const geo = feature(land, land.objects.land) as unknown as GeoJSON.FeatureCollection;
function globeSvg() {
  const S = 1000, r = 330, cx = S / 2, cy = S / 2;
  const proj = geoOrthographic().rotate([-14, -24, 0]).scale(r).translate([cx, cy]).clipAngle(90).precision(0.2);
  const path = geoPath(proj);
  const rx = r * 1.42, ry = r * 0.38, tilt = -18;
  const orbit = (front: boolean) => `<path d="M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 ${front ? 0 : 1} ${cx + rx} ${cy}" fill="none" stroke="url(#orbit)" stroke-width="${r * 0.04}" stroke-linecap="round" transform="rotate(${tilt} ${cx} ${cy})" ${front ? '' : 'opacity="0.4"'}/>`;
  const a = (206 * Math.PI) / 180, t = (tilt * Math.PI) / 180; // the star rides the front-left of the orbit
  const px = rx * Math.cos(a), py = -ry * Math.sin(a);
  const sx = cx + px * Math.cos(t) - py * Math.sin(t), sy = cy + px * Math.sin(t) + py * Math.cos(t);
  const k = r * 0.12;
  const star = `M ${sx} ${sy - k} C ${sx + k * 0.16} ${sy - k * 0.16} ${sx + k * 0.16} ${sy - k * 0.16} ${sx + k} ${sy} C ${sx + k * 0.16} ${sy + k * 0.16} ${sx + k * 0.16} ${sy + k * 0.16} ${sx} ${sy + k} C ${sx - k * 0.16} ${sy + k * 0.16} ${sx - k * 0.16} ${sy + k * 0.16} ${sx - k} ${sy} C ${sx - k * 0.16} ${sy - k * 0.16} ${sx - k * 0.16} ${sy - k * 0.16} ${sx} ${sy - k} Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  <defs>
    <radialGradient id="ocean" cx="36%" cy="30%" r="80%"><stop offset="0" stop-color="#38bdf8"/><stop offset="0.45" stop-color="#1d6fe0"/><stop offset="1" stop-color="#0b1f5c"/></radialGradient>
    <linearGradient id="land" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1b8"/><stop offset="0.45" stop-color="#fbbf24"/><stop offset="1" stop-color="#ea7a12"/></linearGradient>
    <radialGradient id="shade" cx="34%" cy="28%" r="78%"><stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#020617" stop-opacity="0.6"/></radialGradient>
    <radialGradient id="shine" cx="33%" cy="25%" r="35%"><stop offset="0" stop-color="#fff" stop-opacity="0.4"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0.6" stop-color="#38bdf8" stop-opacity="0.5"/><stop offset="0.74" stop-color="#38bdf8" stop-opacity="0.1"/><stop offset="1" stop-color="#38bdf8" stop-opacity="0"/></radialGradient>
    <linearGradient id="orbit" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fbbf24"/><stop offset="0.4" stop-color="#fde68a"/><stop offset="1" stop-color="#fde68a" stop-opacity="0.12"/></linearGradient>
    <radialGradient id="spark" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff7d6"/><stop offset="0.35" stop-color="#fbbf24" stop-opacity="0.8"/><stop offset="1" stop-color="#fbbf24" stop-opacity="0"/></radialGradient>
    <clipPath id="sphere"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="${r * 1.36}" fill="url(#glow)"/>
  ${orbit(false)}
  <g clip-path="url(#sphere)">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#ocean)"/>
    <path d="${path(geoGraticule10())}" fill="none" stroke="#bae6fd" stroke-opacity="0.16" stroke-width="2"/>
    <path d="${path(geo)}" fill="url(#land)" stroke="#fff7d6" stroke-opacity="0.5" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#shade)"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#shine)"/>
  </g>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#7dd3fc" stroke-opacity="0.55" stroke-width="4"/>
  ${orbit(true)}
  <circle cx="${sx}" cy="${sy}" r="${r * 0.2}" fill="url(#spark)"/>
  <path d="${star}" fill="#fffbeb"/>
</svg>`;
}
const globe = dataUri(png(globeSvg(), 1000));
const icon = dataUri(readFileSync('public/icons/icon-192.png'));

// ── The card ──
const div = (style: Record<string, unknown>, ...children: ReactNode[]) => h('div', { style: { display: 'flex', ...style } }, ...children);
const TILE: Record<string, string> = { g: '#16a34a', y: '#eab308', x: '#334155' };
// A Geo Wordle row, mid-game: the look of the game at a glance (no real answer).
const ROW: [string, string][] = [['C', 'g'], ['H', 'x'], ['I', 'y'], ['L', 'g'], ['E', 'g']];
const CHIPS: [string, string][] = [['Daily challenge', '#fbbf24'], ['Geo Wordle', '#a3e635'], ['Map quiz', '#60a5fa'], ['Street View', '#34d399'], ['Live duels', '#f472b6']];
// A few stars, fixed so the picture never changes between builds.
const STARS = [[30, 160, 2], [610, 40, 2.5], [700, 600, 2], [1150, 600, 2.4], [1170, 40, 2], [760, 120, 1.8], [36, 420, 1.8], [720, 300, 1.6], [470, 24, 1.6], [960, 610, 1.8]];

function card(invite: boolean) {
  return div(
    { width: 1200, height: 630, position: 'relative', fontFamily: 'Space Grotesk', color: '#e8eefc', overflow: 'hidden',
      backgroundColor: '#050913',
      backgroundImage: 'radial-gradient(circle at 82% 50%, #1b3a78 0%, #0b1530 38%, rgba(5,9,19,0) 70%), radial-gradient(circle at 100% 0%, rgba(251,191,36,0.28) 0%, rgba(251,191,36,0) 45%), radial-gradient(circle at 0% 100%, rgba(99,102,241,0.22) 0%, rgba(99,102,241,0) 50%)' },
    ...STARS.map(([x, y, r], i) => h('div', { key: `s${i}`, style: { position: 'absolute', left: x, top: y, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: '#fff', opacity: 0.75 } })),
    // The globe, big and spilling off the right edge.
    h('img', { src: globe, width: 760, height: 760, style: { position: 'absolute', left: 640, top: -64 } }),
    // Words on the left.
    div({ position: 'absolute', left: 64, top: 52, width: 660, flexDirection: 'column' },
      div({ alignItems: 'center', gap: 14 },
        h('img', { src: icon, width: 52, height: 52, style: { borderRadius: 14 } }),
        div({ fontSize: 32, fontWeight: 700, letterSpacing: -0.5 }, 'GeoQuest'),
        invite ? div({ marginLeft: 8, padding: '6px 14px', borderRadius: 999, fontSize: 19, fontWeight: 700, letterSpacing: 1.5, color: '#1a1205', backgroundColor: '#fbbf24' }, 'YOU’RE INVITED') : null),
      div({ flexDirection: 'column', marginTop: 34, fontSize: 78, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2.5 },
        div({}, 'How well do you'),
        div({}, 'know the ', h('span', { style: { color: '#fbbf24', marginLeft: 20 } }, 'world?'))),
      div({ alignItems: 'center', gap: 10, marginTop: 30 },
        ...ROW.map(([ch, m], i) => div({ key: i, width: 62, height: 62, borderRadius: 12, alignItems: 'center', justifyContent: 'center', fontSize: 34, fontWeight: 700, color: '#fff', backgroundColor: TILE[m] }, ch)),
        div({ marginLeft: 14, fontSize: 24, fontWeight: 500, color: '#a5b4d4', lineHeight: 1.2, flexDirection: 'column' }, div({}, 'A new country'), div({}, 'every day'))),
      div({ flexWrap: 'wrap', gap: 10, marginTop: 30, width: 600 },
        ...CHIPS.map(([label, c], i) => div({ key: i, alignItems: 'center', gap: 10, padding: '9px 18px', borderRadius: 999, fontSize: 22, fontWeight: 500, color: '#e8eefc', backgroundColor: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.14)' },
          h('div', { style: { width: 12, height: 12, borderRadius: 6, backgroundColor: c } }), label)))),
    div({ position: 'absolute', left: 64, bottom: 40, fontSize: 22, fontWeight: 500, color: '#8b98b8' }, invite ? 'Free · play solo or live with friends · playgeoquest.app' : 'Free · no sign-up needed · playgeoquest.app'),
  );
}

for (const [file, invite] of [['og-card', false], ['og-invite-card', true]] as const) {
  const svg = await satori(card(invite), { width: 1200, height: 630, fonts });
  const out = `public/icons/${file}.png`;
  writeFileSync(out, png(svg, 1200));
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '88', out, '--out', `public/icons/${file}.jpg`], { stdio: 'ignore' });
  execFileSync('rm', [out]);
  console.log(`wrote public/icons/${file}.jpg`);
}
