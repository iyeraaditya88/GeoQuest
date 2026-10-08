// Map quiz as a learning tool: a nudge after each wrong guess, and something to remember
// about where a country is once it's revealed. Everything is worked out from our own data.
import { BY_CCA3, COUNTRIES, MAPPABLE, type Country } from './data';

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
function distKm(a: [number, number], b: [number, number]) {
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bearing(a: [number, number], b: [number, number]) {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const compass = (deg: number) => DIRS[Math.round(deg / 45) % 8];
const roundKm = (km: number) => (km < 150 ? 'just' : km < 1000 ? `about ${Math.round(km / 50) * 50} km` : `about ${(Math.round(km / 100) * 100).toLocaleString('en-US')} km`);
const list = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const the = (c: Country) => (/^(United|Netherlands|Philippines|Bahamas|Gambia|Maldives|Comoros|Seychelles|Solomon|Marshall|Central African|Dominican|Czech|Democratic|Republic)/.test(c.name) ? `the ${c.name}` : c.name);

/** Neighbours, biggest first (the ones people know best). */
const neighbours = (c: Country) => c.borders.map((b) => BY_CCA3.get(b)).filter((n): n is Country => !!n).sort((a, b) => b.population - a.population);

/** The best-known big country near `c` (for islands and anchors). */
function anchorNear(c: Country) {
  return COUNTRIES
    .filter((o) => o.cca3 !== c.cca3 && o.area > 250_000 && MAPPABLE.has(o.cca3))
    .map((o) => ({ o, d: distKm(o.latlng, c.latlng) - Math.log10(o.population + 1) * 40 }))
    .sort((a, b) => a.d - b.d)[0]?.o;
}

/** The nudge after a wrong guess: where the target is from where you clicked, plus a clue. */
export function missHint(targetId: string, clickedId: string, misses: number) {
  const t = BY_CCA3.get(targetId), c = BY_CCA3.get(clickedId);
  if (!t) return '';
  const parts: string[] = [];
  if (c) {
    const km = distKm(c.latlng, t.latlng);
    parts.push(km < 150 ? `So close — ${the(t)} is right next to ${the(c)}.` : `${the(t)[0].toUpperCase()}${the(t).slice(1)} is ${roundKm(km)} ${compass(bearing(c.latlng, t.latlng))} of ${the(c)}.`);
  }
  if (misses === 1) parts.push(`It’s in ${t.subregion || t.region}.`);
  else {
    const ns = neighbours(t);
    if (ns.length) parts.push(`It borders ${list(ns.slice(0, 3).map(the))}.`);
    else parts.push(`It’s an island nation${t.landlocked ? '' : ` in ${t.subregion || t.region}`}.`);
  }
  return parts.join(' ');
}

/** What to remember about where a country is (2–3 short lines). */
export function takeaway(targetId: string): string[] {
  const t = BY_CCA3.get(targetId);
  if (!t) return [];
  const out: string[] = [];
  const ns = neighbours(t);
  const where = t.subregion || t.region;
  if (ns.length >= 2) {
    // Two best-known neighbours, in west → east order, reads like a map.
    const pair = ns.slice(0, 2).sort((a, b) => a.latlng[1] - b.latlng[1]);
    out.push(`${the(t)[0].toUpperCase()}${the(t).slice(1)} sits in ${where}, between ${the(pair[0])} and ${the(pair[1])}${t.landlocked ? ' — with no coastline' : ''}.`);
  } else if (ns.length === 1) {
    out.push(`${the(t)[0].toUpperCase()}${the(t).slice(1)} sits in ${where}, sharing its only land border with ${the(ns[0])}.`);
  } else {
    const a = anchorNear(t);
    out.push(a ? `An island nation in ${where}, ${compass(bearing(a.latlng, t.latlng))} of ${the(a)}.` : `An island nation in ${where}.`);
  }
  const a = ns[0] ?? anchorNear(t);
  if (a) {
    const km = distKm(a.latlng, t.latlng);
    out.push(`Find ${the(a)} first, then look ${compass(bearing(a.latlng, t.latlng))}${km > 150 ? ` (${roundKm(km)})` : ''}.`);
  }
  if (t.capital[0]) out.push(`Capital: ${t.capital[0]}${t.area < 30_000 ? ' · it’s small — zoom in to spot it' : ''}.`);
  return out;
}
