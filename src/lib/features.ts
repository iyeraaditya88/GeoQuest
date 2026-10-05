// Rivers, ranges, peaks and lakes as selectable things: hit-testing (click near a river line),
// facts we can compute ourselves (countries crossed, highest peaks), and a Wikipedia summary.
import { BY_CCA3, countryAt } from './data';
import { loadNature, type Lake, type Nature, type Peak, type Range, type River } from './nature';

export type FeatureKind = 'river' | 'range' | 'peak' | 'lake';
export interface FeatureRef { kind: FeatureKind; name: string }

export interface FeatureInfo {
  kind: FeatureKind;
  name: string;
  /** [west, south, east, north] to frame the camera */
  bbox: [number, number, number, number];
  center: { lat: number; lng: number };
  countries: string[]; // cca3, in order along the feature
  peaks?: { name: string; e: number }[]; // ranges: highest mapped peaks
  elevation?: number; // peaks
  river?: River;
  range?: Range;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ── River hit-testing: a 1° grid of segments ──
let grid: Map<string, { r: River; a: [number, number]; b: [number, number] }[]> | null = null;
function riverGrid(d: Nature) {
  if (grid) return grid;
  grid = new Map();
  for (const r of d.rivers) {
    if (!r.n) continue;
    for (const c of r.c) for (let i = 1; i < c.length; i++) {
      const a = c[i - 1], b = c[i];
      const k = `${Math.floor((a[0] + b[0]) / 2)}:${Math.floor((a[1] + b[1]) / 2)}`;
      let cell = grid.get(k);
      if (!cell) grid.set(k, (cell = []));
      cell.push({ r, a, b });
    }
  }
  return grid;
}

/** The named river whose line passes within `tolDeg` of a point, if any. */
export async function riverNear(lat: number, lng: number, tolDeg: number): Promise<River | null> {
  const d = await loadNature();
  if (!d) return null;
  const g = riverGrid(d);
  const k = Math.cos((lat * Math.PI) / 180);
  let best: River | null = null, bestD = tolDeg;
  const span = Math.ceil(tolDeg) + 1;
  for (let x = Math.floor(lng) - span; x <= Math.floor(lng) + span; x++) {
    for (let y = Math.floor(lat) - span; y <= Math.floor(lat) + span; y++) {
      for (const s of g.get(`${x}:${y}`) ?? []) {
        // point–segment distance in a local equirectangular frame (degrees)
        const ax = (s.a[0] - lng) * k, ay = s.a[1] - lat, bx = (s.b[0] - lng) * k, by = s.b[1] - lat;
        const dx = bx - ax, dy = by - ay;
        const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
        const dist = Math.hypot(ax + t * dx, ay + t * dy);
        if (dist < bestD) { bestD = dist; best = s.r; }
      }
    }
  }
  return best;
}

function uniqCountries(points: [number, number][]) {
  const out: string[] = [];
  for (const [lng, lat] of points) {
    const c = countryAt(lat, lng);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/** Everything the side panel and camera need for a feature. */
export async function featureInfo(ref: FeatureRef): Promise<FeatureInfo | null> {
  const d = await loadNature();
  if (!d) return null;
  if (ref.kind === 'river') {
    const r = d.rivers.find((x) => x.id === ref.name);
    if (!r) return null;
    // Sample along the courses (longest first) for the countries it flows through.
    const chains = [...r.c].sort((a, b) => b.length - a.length);
    const pts: [number, number][] = [];
    for (const c of chains) { const step = Math.max(1, Math.floor(c.length / 40)); for (let i = 0; i < c.length; i += step) pts.push(c[i]); pts.push(c[c.length - 1]); }
    const [w, s, e, n] = r.bb;
    return { kind: 'river', name: r.id, bbox: r.bb, center: { lat: (s + n) / 2, lng: (w + e) / 2 }, countries: uniqCountries(pts).slice(0, 10), river: r };
  }
  if (ref.kind === 'range') {
    const rg = d.ranges.find((x) => x.n === ref.name);
    if (!rg) return null;
    const dx = rg.b[0] - rg.a[0], dy = rg.b[1] - rg.a[1];
    const along = (t: number): [number, number] => [rg.a[0] + dx * t, rg.a[1] + dy * t];
    const half = rg.len / 2;
    const pts = Array.from({ length: 21 }, (_, i) => along(-half + (i / 20) * rg.len));
    // Peaks close to the range's axis, highest first.
    const k = Math.cos((rg.a[1] * Math.PI) / 180);
    const near = (p: Peak) => {
      const px = (p.a[0] - rg.a[0]) * k, py = p.a[1] - rg.a[1];
      const ux = dx * k, uy = dy, ul = Math.hypot(ux, uy) || 1;
      const t = (px * ux + py * uy) / ul, perp = Math.abs(px * uy - py * ux) / ul;
      return Math.abs(t) <= half + 1 && perp <= Math.max(1.5, rg.len * 0.18);
    };
    const peaks = d.peaks.filter(near).sort((a, b) => b.e - a.e).slice(0, 3).map((p) => ({ name: p.n, e: p.e }));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const pad = Math.max(1, rg.len * 0.12);
    return { kind: 'range', name: rg.n, bbox: [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad], center: { lat: rg.a[1], lng: rg.a[0] }, countries: uniqCountries(pts), peaks, range: rg };
  }
  if (ref.kind === 'peak') {
    const p = d.peaks.find((x) => x.n === ref.name);
    if (!p) return null;
    const c = countryAt(p.a[1], p.a[0]);
    return { kind: 'peak', name: p.n, bbox: [p.a[0] - 3, p.a[1] - 3, p.a[0] + 3, p.a[1] + 3], center: { lat: p.a[1], lng: p.a[0] }, countries: c ? [c] : [], elevation: p.e };
  }
  const l = d.lakes.find((x: Lake) => x.n === ref.name);
  if (!l) return null;
  const ring = l.p.flatMap((poly) => poly[0]);
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  const step = Math.max(1, Math.floor(ring.length / 30));
  return { kind: 'lake', name: l.n, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], center: { lat: l.l[1], lng: l.l[0] }, countries: uniqCountries(ring.filter((_, i) => i % step === 0)), };
}

/** A friendly display name: "Colorado" → "Colorado River". */
export function displayName(ref: FeatureRef) {
  if (ref.kind === 'river') ref = { ...ref, name: ref.name.replace(/#\d+$/, '') }; // same-named rivers: "Colorado#2"
  if (ref.kind === 'river' && !/\b(river|rio|río|creek|canal|branch)\b/i.test(ref.name)) return `${ref.name} River`;
  if (ref.kind === 'range') return ref.name.replace(/\b\w+/g, (w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()));
  return ref.name;
}

/**
 * A river's length from its Wikipedia summary — only from a phrase that states a length
 * ("2,330 km long", "length of 6,650 km", "1,450 mi (2,330 km) long"), not any distance
 * ("rises 160 km northeast of Lima").
 */
export function riverLength(text: string): number | undefined {
  const num = (s: string) => Number(s.replace(/,/g, ''));
  const KM = String.raw`([\d,]+(?:\.\d+)?)\s*(?:km|kilomet(?:re|er)s)`;
  const patterns = [
    new RegExp(String.raw`${KM}(?:\s*\([^)]*\))?\s*(?:long|in length)`, 'i'),                // 2,330 km (1,450 mi) long
    new RegExp(String.raw`[\d,.]+\s*(?:mi|miles)\s*\(${KM}\)\s*(?:long|in length)`, 'i'),   // 1,450 mi (2,330 km) long
    new RegExp(String.raw`(?:length|long)[^.]{0,40}?(?:of|is|about|approximately|some)\s+(?:about\s+|approximately\s+|some\s+)?${KM}`, 'i'), // a length of 6,650 km
    new RegExp(String.raw`[\d,-]+[-\s](?:mile|mi)[-\s]long\s*\(${KM}\)`, 'i'),                // 1,450-mile-long (2,330 km)
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) { const v = Math.round(num(m[1])); if (v > 10) return v; }
  }
  return undefined;
}

// ── Wikipedia summary (free, no key, CORS-enabled) ──
export interface WikiSummary { title: string; description?: string; extract: string; thumbnail?: string; url: string; lengthKm?: number }
const wikiCache = new Map<string, Promise<WikiSummary | null>>();
export function wikiSummary(ref: FeatureRef, countries: string[] = []) {
  const key = `${ref.kind}:${ref.name}`;
  if (!wikiCache.has(key)) wikiCache.set(key, (async () => {
    const hint = { river: 'river', range: 'mountains', peak: 'mountain', lake: 'lake' }[ref.kind];
    const where = countries[0] ? BY_CCA3.get(countries[0])?.name ?? '' : '';
    const q = `${displayName(ref)} ${norm(displayName(ref)).includes(hint.slice(0, 4)) ? '' : hint} ${where}`.trim();
    const s = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&format=json&origin=*`).then((r) => r.json());
    const title: string | undefined = s?.query?.search?.[0]?.title;
    if (!title) return null;
    const p = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`).then((r) => (r.ok ? r.json() : null));
    if (!p?.extract) return null;
    const lengthKm = ref.kind === 'river' ? riverLength(p.extract) : undefined;
    return { title: p.title, description: p.description, extract: p.extract, thumbnail: p.thumbnail?.source, url: p.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`, lengthKm };
  })().catch(() => null));
  return wikiCache.get(key)!;
}

