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
/** Distance and direction from one country to another: { km, dir: 'north-east', text: 'about 2,300 km' }. */
export function fromTo(fromCca3: string, toCca3: string) {
  const a = BY_CCA3.get(fromCca3), b = BY_CCA3.get(toCca3);
  if (!a || !b) return null;
  const km = distKm(a.latlng, b.latlng);
  return { km, dir: compass(bearing(a.latlng, b.latlng)), text: roundKm(km) };
}
export { distKm };
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

/** The continent, the way people say it ("South America", not "Americas"). */
function continent(c: Country) {
  if (c.region !== 'Americas') return c.region === 'Antarctic' ? 'Antarctica' : c.region;
  if (c.subregion === 'South America') return 'South America';
  if (c.subregion === 'Caribbean') return 'the Caribbean';
  if (c.subregion === 'Central America') return 'Central America';
  return 'North America';
}
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * Overseas parts that the map draws as part of their country (Natural Earth merges them): a tap on
 * French Guiana registers as France. Named here so the hint can say what was really tapped, and
 * measure from there rather than from Paris.
 */
const OVERSEAS: { of: string; name: string; at: [number, number]; km: number; continent: string }[] = [
  { of: 'FRA', name: 'French Guiana', at: [4.0, -53.0], km: 450, continent: 'South America' },
  { of: 'FRA', name: 'Guadeloupe', at: [16.2, -61.55], km: 150, continent: 'the Caribbean' },
  { of: 'FRA', name: 'Martinique', at: [14.64, -61.02], km: 100, continent: 'the Caribbean' },
  { of: 'FRA', name: 'Réunion', at: [-21.11, 55.53], km: 150, continent: 'Africa' },
  { of: 'FRA', name: 'Mayotte', at: [-12.83, 45.15], km: 100, continent: 'Africa' },
  { of: 'USA', name: 'Alaska', at: [64, -152], km: 1900, continent: 'North America' },
  { of: 'USA', name: 'Hawaii', at: [20.8, -157], km: 600, continent: 'Oceania' },
  { of: 'NOR', name: 'Svalbard', at: [78.5, 17], km: 500, continent: 'Europe' },
  { of: 'ESP', name: 'the Canary Islands', at: [28.3, -15.7], km: 400, continent: 'Africa' },
  { of: 'PRT', name: 'the Azores', at: [38.5, -28], km: 450, continent: 'Europe' },
  { of: 'PRT', name: 'Madeira', at: [32.7, -16.9], km: 150, continent: 'Africa' },
  { of: 'ECU', name: 'the Galápagos Islands', at: [-0.6, -90.4], km: 350, continent: 'South America' },
  { of: 'CHL', name: 'Easter Island', at: [-27.1, -109.35], km: 120, continent: 'Oceania' },
  { of: 'NLD', name: 'the Dutch Caribbean', at: [14.5, -66], km: 600, continent: 'the Caribbean' },
];
/** The overseas part of `cca3` a tap at `at` landed in, if any. */
export function overseasAt(cca3: string, at?: [number, number]) {
  if (!at) return null;
  return OVERSEAS.find((o) => o.of === cca3 && distKm(o.at, at) <= o.km) ?? null;
}

/**
 * The nudge after a wrong guess. It says what was picked (so the hint clearly follows from it),
 * then — by real distance, not by continent labels:
 *   neighbours / next door  → "So close — …"
 *   a shared neighbour      → "Not far — Ukraine is on the other side of Russia, to the west."
 *   within a few thousand km → "Y is about 2,300 km north-west of X."
 *   far away                → "That's a long way from Y — try looking in Africa."
 * The second miss narrows it down with neighbours.
 * `at` is where the tap landed — so a tap on French Guiana is treated as French Guiana, not France.
 */
export function missHint(targetId: string, clickedId: string, misses: number, at?: [number, number]) {
  const t = BY_CCA3.get(targetId), c = BY_CCA3.get(clickedId);
  if (!t) return '';
  const parts: string[] = [];
  let wayOff = false;
  if (c) {
    const part = overseasAt(c.cca3, at);
    const from = part ? part.at : c.latlng;            // measure from what was actually tapped
    const fromName = part ? part.name : the(c);
    const km = distKm(from, t.latlng);
    const dir = compass(bearing(from, t.latlng));
    const via = part ? null : t.borders.map((b) => BY_CCA3.get(b)).find((n) => n && c.borders.includes(n.cca3));
    const sameContinent = (part ? part.continent : continent(c)) === continent(t);
    wayOff = km > 7000 || (!sameContinent && km > 2500 && !via);
    parts.push(part ? `You picked ${part.name} (part of ${the(c)}).` : `You picked ${the(c)}.`);
    if (!part && t.borders.includes(c.cca3)) parts.push(`So close — ${the(t)} borders ${the(c)}, to the ${dir}.`);
    else if (km < 150) parts.push(`So close — ${the(t)} is right next to it.`);
    else if (via) parts.push(km < 3000 ? `Not far — ${the(t)} is on the other side of ${the(via)}, to the ${dir}.` : `${cap(the(t))} is on the other side of ${the(via)}, to the ${dir}.`);
    else if (wayOff) parts.push(sameContinent ? `That’s a long way from ${the(t)} — it’s about ${roundKm(km).replace('about ', '')} ${dir}.` : `That’s a long way from ${the(t)} — try looking in ${continent(t)}.`);
    else parts.push(`${cap(the(t))} is ${roundKm(km)} ${dir} of ${fromName}.`);
  }
  if (misses === 1) {
    // Way off: the continent was the hint. Otherwise narrow it to the region.
    if (!wayOff) parts.push(`It’s in ${t.subregion || t.region}.`);
  } else {
    const ns = neighbours(t);
    if (wayOff) parts.push(`It’s in ${t.subregion || t.region}.`);
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
