// Street-level imagery from Mapillary (https://www.mapillary.com) for the
// Street View challenge. Needs a free client token (with Read access), entered once.
//
// Spots come from Mapillary's coverage vector tiles — the same data its own map uses.
// (The Graph API /images bbox search is unreliable: empty or "too much data" errors.)
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import citiesRaw from '../data/cities.json';
import { countryAt } from './data';

export interface MapillarySpot {
  provider: 'mapillary';
  id: string;
  lat: number;
  lng: number;
  pano: boolean;
}

export class MapillaryTokenError extends Error {}

type City = [string, number, number, number, number, 0 | 1, string];

// Countries with good Mapillary coverage that GeoGuessr players actually see.
const WEIGHTS: Record<string, number> = {
  FRA: 3, DEU: 3, ESP: 2, ITA: 2, GBR: 2, NLD: 2, BEL: 1, CHE: 1, AUT: 1, PRT: 1, POL: 2, CZE: 1, SVK: 1, HUN: 1, ROU: 1, BGR: 1,
  GRC: 1, HRV: 1, SVN: 1, SRB: 1, NOR: 1, SWE: 1, FIN: 1, DNK: 1, IRL: 1, EST: 1, LVA: 1, LTU: 1, TUR: 1, UKR: 1,
  USA: 4, CAN: 2, MEX: 2, BRA: 3, ARG: 2, CHL: 1, COL: 1, PER: 1, ECU: 1, URY: 1, GTM: 1, CRI: 1,
  JPN: 2, KOR: 1, TWN: 1, IND: 2, IDN: 2, THA: 1, PHL: 1, MYS: 1, VNM: 1,
  AUS: 2, NZL: 1, ZAF: 2, KEN: 1, NGA: 1, GHA: 1, SEN: 1, MAR: 1, TUN: 1, EGY: 1,
  RUS: 1, KAZ: 1, MNG: 1, ISR: 1, ARE: 1,
};

// Towns and cities in those countries — street imagery lives where people do. Grouped by
// country: the country is picked first (by its weight), then a town in it — otherwise countries
// with many towns in the data (the US had ~a third of all picks) would come up again and again.
const PLACES = new Map<string, { lat: number; lng: number }[]>();
for (const [, lat, lng, , rank, , iso] of citiesRaw as City[]) {
  if (!WEIGHTS[iso] || rank < 2) continue; // ordinary towns over mega-cities
  if (!PLACES.has(iso)) PLACES.set(iso, []);
  PLACES.get(iso)!.push({ lat, lng });
}

/** A weighted-random country with towns to search, skipping `not` (unless that leaves none). */
export function pickCountry(not: Set<string>) {
  let pool = [...PLACES.keys()].filter((c) => !not.has(c));
  if (!pool.length) pool = [...PLACES.keys()];
  let r = Math.random() * pool.reduce((s, c) => s + WEIGHTS[c], 0);
  for (const c of pool) if ((r -= WEIGHTS[c]) <= 0) return c;
  return pool[0];
}
const randomTown = (iso: string) => { const list = PLACES.get(iso)!; return list[Math.floor(Math.random() * list.length)]; };

const Z = 14; // finest zoom of the image-point layer
function tileOf(lat: number, lng: number) {
  const n = 2 ** Z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return { x, y };
}

async function fetchWithTimeout(url: string, signal?: AbortSignal, ms = 10000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  signal?.addEventListener('abort', () => ctl.abort());
  try {
    return await fetch(url, { signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

const NO_READ = 'Your Mapillary token can’t read images. Re-register the app with **Read** access enabled and paste its **Client Token** (not the Client Secret).';
/** A long-lived public image: if the token can read this, the token is fine. */
const KNOWN_IMAGE = '500609427720893';
const tokenOk = new Map<string, Promise<boolean>>();
function tokenCanRead(token: string) {
  if (!tokenOk.has(token)) {
    tokenOk.set(token, fetchWithTimeout(`https://graph.mapillary.com/${KNOWN_IMAGE}?access_token=${encodeURIComponent(token)}&fields=id`)
      .then((r) => r.ok || (r.status !== 401 && r.status !== 403 && r.status !== 400))
      .catch(() => true)); // offline: don't blame the token
  }
  return tokenOk.get(token)!;
}

/**
 * Mapillary's viewer loads images through the Graph API — make sure this one can be read.
 * Error code 100 means "doesn't exist or can't be loaded": usually a photo removed since the
 * coverage tiles were built, *not* a bad token — so only blame the token if it can't read a
 * known public image either.
 */
async function assertReadable(token: string, id: string, signal?: AbortSignal) {
  const r = await fetchWithTimeout(`https://graph.mapillary.com/${id}?access_token=${encodeURIComponent(token)}&fields=id`, signal);
  if (r.ok) return;
  const body = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403 || ((body?.error?.code === 100 || body?.error?.code === 190) && !(await tokenCanRead(token)))) throw new MapillaryTokenError(NO_READ);
  throw new Error(`Image ${id} unavailable (${r.status})`);
}

async function spotNear(token: string, lat: number, lng: number, wantPano: boolean, signal?: AbortSignal, avoid: string[] = []): Promise<MapillarySpot> {
  const { x, y } = tileOf(lat, lng);
  const r = await fetchWithTimeout(`https://tiles.mapillary.com/maps/vtp/mly1_public/2/${Z}/${x}/${y}?access_token=${encodeURIComponent(token)}`, signal);
  if (r.status === 401 || r.status === 403) throw new MapillaryTokenError('Mapillary rejected this token — reconnect it.');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  if (!buf.length) throw new Error('empty');
  const layer = new VectorTile(new PbfReader(buf)).layers.image;
  if (!layer?.length) throw new Error('empty');

  // Prefer decent-quality images; 360° when asked.
  const picks: number[] = [];
  for (let i = 0; i < layer.length; i++) {
    const p = layer.feature(i).properties as { is_pano?: boolean; quality_score?: number };
    if (wantPano && !p.is_pano) continue;
    if ((p.quality_score ?? 1) < 0.35) continue;
    picks.push(i);
  }
  if (!picks.length) throw new Error('empty');
  for (let tries = 0; tries < 6; tries++) {
    const f = layer.feature(picks[Math.floor(Math.random() * picks.length)]);
    const [lngF, latF] = (f.toGeoJSON(x, y, Z).geometry as GeoJSON.Point).coordinates;
    const c = countryAt(latF, lngF);
    if (!c || avoid.includes(c)) continue; // at sea, or over a border into a country already played
    return { provider: 'mapillary', id: String(f.properties.id), lat: latF, lng: lngF, pano: !!f.properties.is_pano };
  }
  throw new Error('empty');
}

/**
 * Random playable spot: a random country (weighted by coverage), a town in it jittered up to
 * ~8 km, then an image from the coverage tile there. Four countries in parallel; 360° first.
 * `avoid`: countries already used this game — the spot is never in one of them.
 */
export async function findMapillarySpot(token: string, signal?: AbortSignal, avoid: string[] = []): Promise<MapillarySpot> {
  const tried = new Set(avoid);
  for (let batch = 0; batch < 6; batch++) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const pano = batch < 4;
    const tries = Array.from({ length: 4 }, () => {
      const c = pickCountry(tried);
      tried.add(c); // four different countries per batch
      const p = randomTown(c);
      const j = () => (Math.random() - 0.5) * 0.14;
      return spotNear(token, p.lat + j(), p.lng + j(), pano, signal, avoid);
    });
    let spot: MapillarySpot;
    try {
      spot = await Promise.any(tries);
    } catch (err) {
      const errs = ((err as AggregateError).errors ?? []) as Error[];
      const tokenErr = errs.find((e) => e instanceof MapillaryTokenError);
      if (tokenErr) throw tokenErr;
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      continue;
    }
    try {
      await assertReadable(token, spot.id, signal);
    } catch (err) {
      if (err instanceof MapillaryTokenError || signal?.aborted) throw err;
      continue; // that photo is gone — find another
    }
    return spot;
  }
  throw new Error('Couldn’t find street imagery right now — check your connection and try again.');
}
