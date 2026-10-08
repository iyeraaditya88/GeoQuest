// Street-level imagery for the GeoGuessr-style game, from Panoramax — an open,
// keyless, CC-licensed street imagery network (https://panoramax.fr).
import { geoBounds } from 'd3-geo';
import { FEATURES, countryAt } from './data';

const API = 'https://api.panoramax.xyz/api';

export interface StreetItem {
  id: string;
  collection: string;
  lat: number;
  lng: number;
  heading: number;
  is360: boolean;
  fov: number;
  /** height/width of the photo, filled in once loaded */
  aspect?: number;
  image: string;
  /** small preview, used for instant steps before the full image streams in */
  preview: string;
  thumb: string;
  author: string;
  license: string;
  prev?: { id: string; lat: number; lng: number };
  next?: { id: string; lat: number; lng: number };
}

interface RawFeature {
  id: string;
  collection: string;
  geometry: { coordinates: [number, number] };
  assets: Record<string, { href: string }>;
  links: { rel: string; id?: string; geometry?: { coordinates: [number, number] } }[];
  properties: Record<string, unknown> & {
    'view:azimuth'?: number;
    'pers:interior_orientation'?: { field_of_view?: number };
    license?: string;
    exif?: Record<string, string>;
    'geovisio:producer'?: string;
  };
}

function parse(f: RawFeature): StreetItem {
  const p = f.properties;
  const fov = p['pers:interior_orientation']?.field_of_view ?? 0;
  const is360 = fov === 360;
  const link = (rel: string) => {
    const l = f.links.find((x) => x.rel === rel && x.id && x.geometry);
    return l ? { id: l.id!, lng: l.geometry!.coordinates[0], lat: l.geometry!.coordinates[1] } : undefined;
  };
  return {
    id: f.id,
    collection: f.collection,
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    heading: Number(p['view:azimuth'] ?? 0),
    is360,
    fov: is360 ? 360 : fov || 100, // most street cams without metadata are wide-angle
    // Full-res for 360° (sd is blurry once stretched round a sphere); sd for flat photos.
    image: (is360 ? f.assets.hd?.href : f.assets.sd?.href) ?? f.assets.hd?.href ?? f.assets.sd.href,
    preview: f.assets.sd?.href ?? f.assets.hd?.href,
    thumb: f.assets.thumb?.href ?? f.assets.sd?.href,
    author: String(p['geovisio:producer'] ?? p.exif?.['Exif.Image.Artist'] ?? 'Panoramax contributor'),
    license: String(p.license ?? 'CC-BY-SA-4.0'),
    prev: link('prev'),
    next: link('next'),
  };
}

async function getJSON<T>(url: string, signal?: AbortSignal, timeoutMs = 9000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  signal?.addEventListener('abort', () => ctl.abort());
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

const itemCache = new Map<string, StreetItem>();

export async function getItem(collection: string, id: string, signal?: AbortSignal) {
  const hit = itemCache.get(id);
  if (hit) return hit;
  const f = await getJSON<RawFeature>(`${API}/collections/${collection}/items/${id}`, signal);
  const item = parse(f);
  itemCache.set(id, item);
  return item;
}

// Countries GeoGuessr players actually see, weighted towards well-covered ones.
const POOL: [string, number][] = [
  ['FRA', 3], ['ESP', 2], ['ITA', 2], ['DEU', 2], ['GBR', 2], ['PRT', 1], ['BEL', 1], ['NLD', 1], ['CHE', 1], ['AUT', 1],
  ['POL', 1], ['CZE', 1], ['NOR', 1], ['SWE', 1], ['FIN', 1], ['DNK', 1], ['IRL', 1], ['GRC', 1], ['ROU', 1], ['HUN', 1],
  ['USA', 2], ['CAN', 1], ['MEX', 1], ['BRA', 2], ['ARG', 1], ['CHL', 1], ['COL', 1], ['PER', 1],
  ['JPN', 2], ['KOR', 1], ['TWN', 1], ['IND', 1], ['THA', 1], ['IDN', 1], ['PHL', 1], ['MYS', 1], ['TUR', 1],
  ['AUS', 2], ['NZL', 1], ['ZAF', 1], ['KEN', 1], ['MAR', 1], ['SEN', 1],
];
const BOUNDS = new Map<string, [[number, number], [number, number]]>();
for (const f of FEATURES) {
  const id = f.properties.cca3;
  if (id && POOL.some(([c]) => c === id) && !BOUNDS.has(id)) BOUNDS.set(id, geoBounds(f as unknown as GeoJSON.Feature) as [[number, number], [number, number]]);
}

function pickCountry(not: Set<string>) {
  const pool = POOL.filter(([c]) => !not.has(c) && BOUNDS.has(c));
  const total = pool.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [c, w] of pool) if ((r -= w) <= 0) return c;
  return pool[0][0];
}

function randomPointIn(cca3: string): [number, number] | null {
  const [[w, s], [e, n]] = BOUNDS.get(cca3)!;
  const width = e >= w ? e - w : e + 360 - w;
  for (let i = 0; i < 60; i++) {
    const lng = ((w + Math.random() * width + 540) % 360) - 180;
    const lat = s + Math.random() * (n - s);
    if (countryAt(lat, lng) === cca3) return [lng, lat];
  }
  return null;
}

async function search(bbox: number[], only360: boolean, signal?: AbortSignal) {
  const q = new URLSearchParams({ limit: '25', bbox: bbox.map((v) => v.toFixed(4)).join(',') });
  if (only360) q.set('filter', 'field_of_view=360');
  const d = await getJSON<{ features: RawFeature[] }>(`${API}/search?${q}`, signal);
  return d.features ?? [];
}

const hasLinks = (f: RawFeature) => f.links.some((l) => (l.rel === 'next' || l.rel === 'prev') && l.id);

async function tryCountry(country: string, only360: boolean, signal?: AbortSignal, avoid: string[] = []): Promise<StreetItem> {
  const pt = randomPointIn(country);
  if (!pt) throw new Error('no point');
  const r = only360 ? 2.5 : 2;
  const feats = await search([pt[0] - r, pt[1] - r * 0.7, pt[0] + r, pt[1] + r * 0.7], only360, signal);
  // Must be walkable (part of a sequence) and actually inside a country.
  const pool = feats.filter((f) => {
    if (!(f.assets?.sd || f.assets?.hd) || !hasLinks(f)) return false;
    const c = countryAt(f.geometry.coordinates[1], f.geometry.coordinates[0]);
    return !!c && !avoid.includes(c); // not at sea, nor over a border into a country already played
  });
  if (!pool.length) throw new Error('no imagery');
  const item = parse(pool[Math.floor(Math.random() * pool.length)]);
  itemCache.set(item.id, item);
  return item;
}

/**
 * Find a playable spot: walkable 360° imagery somewhere random. Searches several
 * countries in parallel and takes the first hit; regular photos only as a last resort.
 */
export async function findLocation(signal?: AbortSignal, avoid: string[] = []): Promise<StreetItem> {
  const tried = new Set<string>(avoid);
  for (let batch = 0; batch < 5; batch++) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const only360 = batch < 4;
    const countries = Array.from({ length: 4 }, () => {
      const c = pickCountry(tried.size > 30 ? new Set() : tried);
      tried.add(c);
      return c;
    });
    try {
      return await Promise.any(countries.map((c) => tryCountry(c, only360, signal, avoid)));
    } catch {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    }
  }
  throw new Error('Couldn’t find street imagery right now — check your connection and try again.');
}

/** Warm the cache for the next few steps in both directions so walking feels instant. */
export function prefetchAround(item: StreetItem, depth = 3) {
  const visit = (it: StreetItem, dir: 'next' | 'prev', left: number) => {
    const l = it[dir];
    if (!l || left <= 0) return;
    void getItem(it.collection, l.id).then((n) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = n.is360 ? n.preview : n.image;
      visit(n, dir, left - 1);
    }).catch(() => null);
  };
  visit(item, 'next', depth);
  visit(item, 'prev', depth);
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** GeoGuessr-style scoring: 5,000 for a perfect guess, decaying with distance. */
export const scoreFor = (km: number) => Math.round(5000 * Math.exp(-km / 1492.7));
