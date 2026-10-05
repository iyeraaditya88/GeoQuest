// Generates the GeoQuest app icon (SVG) from real coastlines: npx tsx scripts/make-icon.mts
// Writes design/icon.svg (full-bleed) and icon-maskable.svg (globe inside the safe zone).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { geoOrthographic, geoPath, geoGraticule10 } from 'd3-geo';
import { feature } from 'topojson-client';

const land = JSON.parse(readFileSync('node_modules/world-atlas/land-50m.json', 'utf8'));
const geo = feature(land, land.objects.land) as unknown as GeoJSON.FeatureCollection;
const S = 1024;

function globe(r: number, cx: number, cy: number) {
  // Europe/Africa/Atlantic facing, tilted a little toward the north.
  const proj = geoOrthographic().rotate([-12, -22, 0]).scale(r).translate([cx, cy]).clipAngle(90).precision(0.2);
  const path = geoPath(proj);
  return { land: path(geo) ?? '', grid: path(geoGraticule10()) ?? '' };
}

function svg(r: number) {
  const cx = S / 2, cy = S / 2 + r * 0.02;
  const g = globe(r, cx, cy);
  // A tilted orbit: back half behind the globe, front half over it.
  const rx = r * 1.36, ry = r * 0.36, tilt = -18;
  const orbit = (front: boolean) => `<path d="M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 ${front ? 0 : 1} ${cx + rx} ${cy}" fill="none" stroke="url(#orbit)" stroke-width="${r * 0.045}" stroke-linecap="round" transform="rotate(${tilt} ${cx} ${cy})" ${front ? '' : 'opacity="0.45"'}/>`;
  // The quest marker riding the orbit (front-right).
  const a = (28 * Math.PI) / 180, px = cx + rx * Math.cos(a), py = cy + ry * Math.sin(a);
  const t = (tilt * Math.PI) / 180;
  const sx = cx + (px - cx) * Math.cos(t) - (py - cy) * Math.sin(t), sy = cy + (px - cx) * Math.sin(t) + (py - cy) * Math.cos(t);
  const star = (x: number, y: number, k: number) => `M ${x} ${y - k} C ${x + k * 0.16} ${y - k * 0.16} ${x + k * 0.16} ${y - k * 0.16} ${x + k} ${y} C ${x + k * 0.16} ${y + k * 0.16} ${x + k * 0.16} ${y + k * 0.16} ${x} ${y + k} C ${x - k * 0.16} ${y + k * 0.16} ${x - k * 0.16} ${y + k * 0.16} ${x - k} ${y} C ${x - k * 0.16} ${y - k * 0.16} ${x - k * 0.16} ${y - k * 0.16} ${x} ${y - k} Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="75%"><stop offset="0" stop-color="#13224a"/><stop offset="0.55" stop-color="#070d22"/><stop offset="1" stop-color="#03050d"/></radialGradient>
    <radialGradient id="ocean" cx="36%" cy="30%" r="80%"><stop offset="0" stop-color="#38bdf8"/><stop offset="0.45" stop-color="#1d6fe0"/><stop offset="1" stop-color="#0b1f5c"/></radialGradient>
    <linearGradient id="land" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1b8"/><stop offset="0.45" stop-color="#fbbf24"/><stop offset="1" stop-color="#ea7a12"/></linearGradient>
    <radialGradient id="shade" cx="34%" cy="28%" r="78%"><stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#020617" stop-opacity="0.62"/></radialGradient>
    <radialGradient id="shine" cx="33%" cy="25%" r="35%"><stop offset="0" stop-color="#fff" stop-opacity="0.38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0.62" stop-color="#38bdf8" stop-opacity="0.55"/><stop offset="0.75" stop-color="#38bdf8" stop-opacity="0.12"/><stop offset="1" stop-color="#38bdf8" stop-opacity="0"/></radialGradient>
    <linearGradient id="orbit" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fde68a" stop-opacity="0.15"/><stop offset="0.6" stop-color="#fde68a"/><stop offset="1" stop-color="#fbbf24"/></linearGradient>
    <radialGradient id="spark" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff7d6"/><stop offset="0.35" stop-color="#fbbf24" stop-opacity="0.8"/><stop offset="1" stop-color="#fbbf24" stop-opacity="0"/></radialGradient>
    <clipPath id="sphere"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
  </defs>
  <rect width="${S}" height="${S}" fill="url(#bg)"/>
  <g fill="#fff" opacity="0.7">
    <circle cx="170" cy="190" r="3"/><circle cx="860" cy="150" r="2.4"/><circle cx="905" cy="760" r="2.6"/><circle cx="120" cy="820" r="2"/><circle cx="760" cy="905" r="1.8"/><circle cx="260" cy="935" r="1.6"/><circle cx="640" cy="88" r="1.8"/><circle cx="72" cy="470" r="1.6"/>
  </g>
  <circle cx="${cx}" cy="${cy}" r="${r * 1.32}" fill="url(#glow)"/>
  ${orbit(false)}
  <g clip-path="url(#sphere)">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#ocean)"/>
    <path d="${g.grid}" fill="none" stroke="#bae6fd" stroke-opacity="0.16" stroke-width="${r * 0.006}"/>
    <path d="${g.land}" fill="url(#land)" stroke="#fff7d6" stroke-opacity="0.55" stroke-width="${r * 0.006}" stroke-linejoin="round"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#shade)"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#shine)"/>
  </g>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#7dd3fc" stroke-opacity="0.55" stroke-width="${r * 0.012}"/>
  ${orbit(true)}
  <circle cx="${sx}" cy="${sy}" r="${r * 0.2}" fill="url(#spark)"/>
  <path d="${star(sx, sy, r * 0.13)}" fill="#fffbeb"/>
</svg>`;
}

mkdirSync('design', { recursive: true });
writeFileSync('design/icon.svg', svg(330));          // "any": globe fills most of the tile
writeFileSync('design/icon-maskable.svg', svg(250)); // maskable: orbit stays inside the 80% safe circle
console.log('icons written');
