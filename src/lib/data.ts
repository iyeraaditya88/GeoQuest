import { feature } from 'topojson-client';
import { geoBounds, geoContains } from 'd3-geo';
import type { Topology, GeometryCollection } from 'topojson-specification';
import topo from 'world-atlas/countries-50m.json';
import topo110 from 'world-atlas/countries-110m.json';
import raw from '../data/countries.json';
import { CURATED, type Curated, type Tip } from '../data/curated';

export interface Country {
  cca2: string; cca3: string; ccn3: string; name: string; official: string;
  capital: string[]; capLatLng: [number, number] | null; region: string; subregion: string;
  population: number; area: number; latlng: [number, number]; languages: string[];
  currencies: { code: string; name: string; symbol: string }[];
  drive: 'left' | 'right'; carSigns: string[]; tld: string[]; idd: string; timezones: string[];
  borders: string[]; landlocked: boolean; demonym: string; continents: string[];
  un: boolean; independent: boolean; flag: string; startOfWeek: string;
}

export interface CountryFeature {
  type: 'Feature';
  id: string;
  properties: { name: string; cca3: string | null };
  geometry: GeoJSON.Geometry;
}

export const COUNTRIES = raw as Country[];
export const BY_CCA3 = new Map(COUNTRIES.map((c) => [c.cca3, c]));
const BY_CCN3 = new Map(COUNTRIES.filter((c) => c.ccn3).map((c) => [c.ccn3, c]));

// Shapes in world-atlas without an ISO numeric code.
const NAME_FALLBACK: Record<string, string> = {
  Kosovo: 'UNK', Somaliland: 'SOM', 'N. Cyprus': 'CYP', 'Siachen Glacier': 'IND',
};

/**
 * Rings that touch both ±180° (Russia's mainland, via Chukotka) look globe-wide to anything
 * that reasons in plain lng/lat boxes — three's conic polygon builder then triangulates
 * a 360°-wide grid and Russia alone took ~3.5 s to build. Shifting the ring's western
 * longitudes by +360° is the same place on the sphere and makes it compact again.
 */
function unwrapRings(g: GeoJSON.Geometry): GeoJSON.Geometry {
  const fix = (ring: GeoJSON.Position[]) => {
    let lo = Infinity, hi = -Infinity;
    for (const [x] of ring) { if (x < lo) lo = x; if (x > hi) hi = x; }
    return hi - lo > 180 ? ring.map(([x, y]) => [x < 0 ? x + 360 : x, y]) : ring;
  };
  if (g.type === 'Polygon') return { ...g, coordinates: g.coordinates.map(fix) };
  if (g.type === 'MultiPolygon') return { ...g, coordinates: g.coordinates.map((p) => p.map(fix)) };
  return g;
}

type CountriesTopo = Topology<{ countries: GeometryCollection<{ name: string }> }>;
function buildFeatures(src: unknown): CountryFeature[] {
  const t = src as CountriesTopo;
  const fc = feature(t, t.objects.countries) as unknown as GeoJSON.FeatureCollection<GeoJSON.Geometry, { name: string }>;
  return fc.features
    .filter((f) => f.properties.name !== 'Antarctica')
    .map((f) => {
      const id = String(f.id ?? '');
      const c = BY_CCN3.get(id) ?? BY_CCA3.get(NAME_FALLBACK[f.properties.name] ?? '');
      return { type: 'Feature', id, properties: { name: f.properties.name, cca3: c?.cca3 ?? null }, geometry: unwrapRings(f.geometry) };
    });
}

export const FEATURES = buildFeatures(topo);
/** Low-detail shapes, used while animating the flat atlas. */
export const FEATURES_110 = buildFeatures(topo110);

export const MAPPABLE = new Set(FEATURES.map((f) => f.properties.cca3).filter(Boolean) as string[]);

export const flagUrl = (cca2: string, w: 80 | 160 | 320 | 640 | 1280 = 320) =>
  `https://flagcdn.com/w${w}/${cca2.toLowerCase()}.png`;

export const curatedFor = (cca3: string): Curated | undefined => CURATED[cca3];

// ── Formatting ────────────────────────────────────────────
export const fmtInt = (n: number) => n.toLocaleString('en-US');
export function fmtCompact(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

export function rankOf(c: Country, key: 'population' | 'area') {
  const sorted = [...COUNTRIES].filter((x) => x.independent).sort((a, b) => b[key] - a[key]);
  const i = sorted.findIndex((x) => x.cca3 === c.cca3);
  return i >= 0 ? i + 1 : null;
}

// Camera altitude that frames the country nicely.
export function altitudeFor(c: Country) {
  return Math.min(2.3, Math.max(0.32, 0.22 + Math.sqrt(c.area || 1) / 1350));
}

// ── Auto-derived GeoGuessr tips (work for every country) ──
const SCRIPT_HINTS: Record<string, string> = {
  Arabic: 'Arabic script (right-to-left)', Russian: 'Cyrillic script', Ukrainian: 'Cyrillic script', Bulgarian: 'Cyrillic script',
  Serbian: 'Cyrillic and/or Latin script', Greek: 'Greek alphabet', Hebrew: 'Hebrew script', Thai: 'Thai script',
  Japanese: 'Japanese kana and kanji', Korean: 'Hangul script', Chinese: 'Chinese characters', Hindi: 'Devanagari script',
  Bengali: 'Bengali script', Amharic: 'Ge’ez script', Georgian: 'Georgian script (curly, unique alphabet)',
  Armenian: 'Armenian alphabet', Khmer: 'Khmer script', Lao: 'Lao script', Burmese: 'Burmese script (round letters)',
  Sinhala: 'Sinhala script', Tamil: 'Tamil script', Persian: 'Persian (Arabic script)', Urdu: 'Urdu (Arabic script)',
  Mongolian: 'Mongolian Cyrillic', Nepali: 'Devanagari script', Dzongkha: 'Tibetan script',
};

export function autoTips(c: Country): Tip[] {
  const out: Tip[] = [];
  out.push({ k: 'road', t: `Drives on the ${c.drive.toUpperCase()}` + (c.drive === 'left' ? ' — only ~75 countries do' : '') });
  const scripts = [...new Set(c.languages.map((l) => SCRIPT_HINTS[l]).filter(Boolean))];
  if (scripts.length) out.push({ k: 'script', t: `Look for ${scripts.join(' / ')}` });
  else if (c.languages.length) out.push({ k: 'script', t: `Signs likely in ${c.languages.slice(0, 3).join(', ')}` });
  if (c.tld[0]) out.push({ k: 'sign', t: `Websites on billboards end in ${c.tld[0]}` });
  if (c.idd) out.push({ k: 'sign', t: `Phone numbers on shopfronts start with ${c.idd}` });
  if (c.currencies[0]) {
    const cur = c.currencies[0];
    out.push({ k: 'misc', t: `Prices shown in ${cur.name}${cur.symbol ? ` (${cur.symbol})` : ''}` });
  }
  if (c.latlng[0] < -5) out.push({ k: 'nature', t: 'Southern Hemisphere — the sun sits in the NORTH at midday' });
  else if (c.latlng[0] > 5) out.push({ k: 'nature', t: 'Northern Hemisphere — the sun sits in the SOUTH at midday' });
  else out.push({ k: 'nature', t: 'Near the equator — the sun is almost overhead at midday' });
  return out;
}


// ── Political map colouring ───────────────────────────────
// Greedy graph colouring over land borders so neighbours never share a colour.
const POLITICAL_PALETTE = ['#f3d9a8', '#cfe6c3', '#f6cdc8', '#d9cff0', '#f8e7a1', '#f7c9a6', '#c6e0dc'];
export const POLITICAL_COLOR: Map<string, string> = (() => {
  const out = new Map<string, string>();
  const order = [...COUNTRIES].sort((a, b) => b.borders.length - a.borders.length || b.area - a.area);
  for (const c of order) {
    const used = new Set(c.borders.map((b) => out.get(b)).filter(Boolean));
    // Rotate the start index so islands don't all get the first colour.
    const start = (c.cca3.charCodeAt(0) + c.cca3.charCodeAt(2)) % POLITICAL_PALETTE.length;
    for (let i = 0; i < POLITICAL_PALETTE.length; i++) {
      const col = POLITICAL_PALETTE[(start + i) % POLITICAL_PALETTE.length];
      if (!used.has(col)) { out.set(c.cca3, col); break; }
    }
  }
  return out;
})();

export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + amt))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// ── Hit-testing: which country is at a lat/lng ────────────
const BOUNDS = FEATURES.map((f) => geoBounds(f as unknown as GeoJSON.Feature));
export function countryAt(lat: number, lng: number): string | null {
  for (let i = 0; i < FEATURES.length; i++) {
    const [[w, s], [e, n]] = BOUNDS[i];
    if (lat < s || lat > n) continue;
    // Antimeridian-crossing boxes come either wrapped (w > e) or unwrapped past 180° (see unwrapRings).
    const inLng = w <= e ? (lng >= w && lng <= e) || (e > 180 && lng <= e - 360) : lng >= w || lng <= e;
    if (!inLng) continue;
    if (geoContains(FEATURES[i] as unknown as GeoJSON.Feature, [lng, lat])) return FEATURES[i].properties.cca3;
  }
  return null;
}
