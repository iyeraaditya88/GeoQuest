// The cinema map: wars and battles played on a tilted, shaded map in the style of an animated history
// documentary. Countries in each side's colour with glowing edges, areas of the past (occupied zones),
// bold arrows that grow across the land, names in wide capitals that curve along each country, flags
// planted where countries join, and a camera that swoops between events and drifts while you read.
// It draws whatever scene the Battles panel hands the globe (see WarScene), so the panel is unchanged.
import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { mesh } from 'topojson-client';
import { BY_CCA3, FEATURES, TOPO_50, flagUrl, topoCca3 } from '../../lib/data';
import { arrowPolygon, labelSizeAtZoom0, metresPerPixel, spineFor, zoomForAltitude } from '../../lib/cinema/geo';
import type { WarScene } from '../BattlesPanel';
import { cull, track } from './cull';
import { VOYAGE_LAYERS, VOYAGE_SOURCES, createVoyage, type CinemaSail, type VoyageScene } from './voyage';

maplibregl.setWorkerUrl(mapWorkerUrl);

export interface CinemaCamera { lat: number; lng: number; alt: number; n: number }
interface Props {
  scene: WarScene;
  camera: CinemaCamera | null;
  /** Room taken by the panel: the camera frames the map in what's left. */
  padding: { left: number; bottom: number };
  narrow: boolean;
  onPin?: (id: string) => void;
  /** A voyage instead of a war: its route, ports and ship (and `sailRef` to set it sailing). */
  voyage?: VoyageScene | null;
  sailRef?: { current: CinemaSail | null };
  onReady: () => void;
  onFail: () => void;
}

const LAND = '#8f8d84';
const OCEAN = '#1b3a5c';
const TERRAIN = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const calmMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const k3 = (k: string | null, id: string) => k ?? `x${id}`;

const hex = (c: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return [143, 141, 132];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const BASE = hex(LAND);
/** A side's colour laid over the land: vivid, but with a little of the ground showing through. */
const tint = (c: string): [number, number, number] => { const s = hex(c); return [0, 1, 2].map((i) => Math.round(s[i] * 0.86 + BASE[i] * 0.14)) as [number, number, number]; };
const css = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;

// Countries as map features, keyed by cca3 (feature-state carries each one's colour). The app's shapes
// run past 180° where they cross the date line (Russia's Chukotka, Fiji), which suits the globe; a map
// tiler reads such a ring as spanning the world and fills tile-sized squares of open sea. So each
// such shape is cut at 180°, and the far part moved back by 360°.
let countriesFC: GeoJSON.FeatureCollection | null = null;
const countries = () => countriesFC ??= {
  type: 'FeatureCollection',
  features: FEATURES.map((f) => ({ type: 'Feature', geometry: cutAtDateLine(f.geometry), properties: { k: k3(f.properties.cca3, f.id) } })),
};
/** The part of a ring on one side of a meridian (Sutherland–Hodgman against one edge). */
function clipX(ring: GeoJSON.Position[], x0: number, keepEast: boolean): GeoJSON.Position[] {
  const inside = (p: GeoJSON.Position) => (keepEast ? p[0] >= x0 : p[0] <= x0);
  const out: GeoJSON.Position[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) { const t = (x0 - a[0]) / (b[0] - a[0]); out.push([x0, a[1] + t * (b[1] - a[1])]); }
  }
  if (out.length) out.push(out[0]);
  return out;
}
function cutAtDateLine(g: GeoJSON.Geometry): GeoJSON.Geometry {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null;
  if (!polys || !polys.some((p) => p[0].some((q) => q[0] > 180))) return g;
  const out: GeoJSON.Position[][][] = [];
  for (const p of polys) {
    if (!p[0].some((q) => q[0] > 180)) { out.push(p); continue; }
    const west = clipX(p[0], 180, false), east = clipX(p[0], 180, true).map(([x, y]) => [x - 360, y]);
    if (west.length > 3) out.push([west]);
    if (east.length > 3) out.push([east]);
  }
  return { type: 'MultiPolygon', coordinates: out };
}
/** A longitude back within ±180°. */
const wrapLng = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;
/** Each country's biggest piece (its mainland), for placing its name. */
const mainland = new Map<string, GeoJSON.Position[]>();
function mainlandOf(cca3: string) {
  if (mainland.has(cca3)) return mainland.get(cca3)!;
  const f = FEATURES.find((x) => x.properties.cca3 === cca3);
  let best: GeoJSON.Position[] = [];
  const rings = !f ? [] : f.geometry.type === 'Polygon' ? [f.geometry.coordinates[0]] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.map((p) => p[0]) : [];
  let bestA = 0;
  for (const r of rings) {
    let a = 0;
    for (let i = 1; i < r.length; i++) a += r[i - 1][0] * r[i][1] - r[i][0] * r[i - 1][1];
    a = Math.abs(a) * Math.cos(((r[0][1] ?? 0) * Math.PI) / 180);
    if (a > bestA) { bestA = a; best = r; }
  }
  mainland.set(cca3, best);
  return best;
}

// The seas, named in pale italic capitals (hand-placed paths, [lat, lng]).
const SEAS: [string, [number, number][]][] = [
  ['ATLANTIC OCEAN', [[24, -56], [31, -42], [33, -27]]], ['PACIFIC OCEAN', [[12, -172], [19, -152], [21, -132]]], ['PACIFIC OCEAN', [[12, 150], [17, 165], [18, 178]]],
  ['INDIAN OCEAN', [[-16, 64], [-13, 79], [-15, 94]]], ['ARCTIC OCEAN', [[80, -30], [83, 20], [81, 70]]], ['SOUTHERN OCEAN', [[-58, -40], [-60, 0], [-58, 40]]],
  ['MEDITERRANEAN SEA', [[37.6, 4], [35.4, 15], [34.2, 23]]], ['BLACK SEA', [[43.6, 31], [43.4, 34.5], [42.8, 38.5]]], ['NORTH SEA', [[55.0, 1.6], [56.6, 5.0]]],
  ['BALTIC SEA', [[55.3, 16.3], [57.6, 19.4]]], ['ARABIAN SEA', [[16, 59], [13.5, 66]]], ['BAY OF BENGAL', [[16, 85], [13.5, 90]]], ['SOUTH CHINA SEA', [[16, 112], [11, 116]]],
  ['SEA OF JAPAN', [[39.5, 132.5], [43, 137]]], ['CORAL SEA', [[-17, 151], [-15, 158]]], ['GULF OF MEXICO', [[25, -94], [25.5, -86]]], ['CARIBBEAN SEA', [[15.5, -79], [15, -69]]],
];
const flip = (pts: [number, number][]) => pts.map(([la, lo]) => [lo, la] as [number, number]);
let seasFC: GeoJSON.FeatureCollection | null = null;
const seas = () => seasFC ??= {
  type: 'FeatureCollection',
  features: SEAS.map(([t, pts]) => { const line = flip(pts); const k = labelSizeAtZoom0(line, t.length, 0.5) * 0.8; return { type: 'Feature', geometry: { type: 'LineString', coordinates: line }, properties: { t, k, zmin: Math.log2(8 / k), zmax: Math.log2(22 / k) } }; }),
};

/** A label feature: text along a spine, sized to fill it, shown only while it's a readable size. */
function labelFeature(text: string, spine: [number, number][], rank: number): GeoJSON.Feature {
  const k = labelSizeAtZoom0(spine, text.length);
  return { type: 'Feature', geometry: { type: 'LineString', coordinates: spine }, properties: { t: text.toUpperCase(), k, zmin: Math.log2(9 / k), zmax: Math.log2(40 / k), r: rank } };
}

/**
 * Text that grows with the map: k × 2^zoom, set as a plain size and updated every quarter zoom level.
 * (A zoom function would make MapLibre check each name's fit at its next-level size, and drop
 * most of them.)
 */
const sizeAt = (prop: string, z = 3): maplibregl.ExpressionSpecification => ['*', ['get', prop], 2 ** z];
/** Only the names that are a readable size at this zoom (set from code: a ["zoom"] filter against data doesn't work). */
const inZoom = (z = 3): maplibregl.FilterSpecification => ['all', ['<=', ['get', 'zmin'], z], ['>', ['get', 'zmax'], z]];

function style(): maplibregl.StyleSpecification {
  return {
    version: 8,
    projection: { type: 'globe' },
    glyphs: GLYPHS,
    // A soft haze toward the horizon (kept dark: a bright one washes out the far side of the map).
    sky: { 'sky-color': '#060c1c', 'horizon-color': '#1b3152', 'fog-color': '#122340', 'sky-horizon-blend': 0.5, 'horizon-fog-blend': 0.35, 'fog-ground-blend': 0.55, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.75, 5, 0.45, 8, 0] },
    sources: {
      dem: { type: 'raster-dem', tiles: [TERRAIN], tileSize: 256, encoding: 'terrarium', maxzoom: 10, attribution: 'Terrain: Mapzen, AWS Open Data' },
      countries: { type: 'geojson', data: countries(), promoteId: 'k', tolerance: 0.6 },
      edges: { type: 'geojson', data: EMPTY },
      shapes: { type: 'geojson', data: EMPTY },
      fronts: { type: 'geojson', data: EMPTY },
      arrows: { type: 'geojson', data: EMPTY, tolerance: 0.2 },
      labels: { type: 'geojson', data: EMPTY, buffer: 256 },
      seas: { type: 'geojson', data: seas(), buffer: 256 },
      ...VOYAGE_SOURCES,
    },
    layers: [
      { id: 'ocean', type: 'background', paint: { 'background-color': OCEAN } },
      { id: 'land', type: 'fill', source: 'countries', paint: { 'fill-color': ['to-color', ['coalesce', ['feature-state', 'c'], LAND]] } },
      { id: 'shapes', type: 'fill', source: 'shapes', paint: { 'fill-color': ['get', 'c'], 'fill-opacity': 0, 'fill-opacity-transition': { duration: 700 } } },
      // Relief over everything coloured, so the mountains show through the sides' colours.
      // (Shadows only: a highlight would wash out the sea, whose floor has relief too.)
      { id: 'relief', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': 0.6, 'hillshade-shadow-color': 'rgba(6,10,24,0.7)', 'hillshade-highlight-color': 'rgba(0,0,0,0)', 'hillshade-accent-color': 'rgba(6,10,24,0.2)', 'hillshade-illumination-direction': 315 } },
      { id: 'borders', type: 'line', source: 'countries', paint: { 'line-color': 'rgba(20,22,30,0.38)', 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.4, 6, 1.1] } },
      { id: 'edge-glow', type: 'line', source: 'edges', layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'c'], 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 5, 6, 11], 'line-blur': ['interpolate', ['linear'], ['zoom'], 2, 4, 6, 9], 'line-opacity': 0.8 } },
      { id: 'edge-core', type: 'line', source: 'edges', layout: { 'line-join': 'round' }, paint: { 'line-color': 'rgba(255,248,232,0.85)', 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.7, 6, 1.5] } },
      { id: 'shape-glow', type: 'line', source: 'shapes', layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'c'], 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 5, 6, 11], 'line-blur': ['interpolate', ['linear'], ['zoom'], 2, 4, 6, 9], 'line-opacity': 0, 'line-opacity-transition': { duration: 700 } } },
      { id: 'shape-core', type: 'line', source: 'shapes', layout: { 'line-join': 'round' }, paint: { 'line-color': 'rgba(255,248,232,0.85)', 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.7, 6, 1.5], 'line-dasharray': [3, 2], 'line-opacity': 0, 'line-opacity-transition': { duration: 700 } } },
      { id: 'front-glow', type: 'line', source: 'fronts', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#fde68a', 'line-width': 10, 'line-blur': 8, 'line-opacity': 0.55 } },
      { id: 'front', type: 'line', source: 'fronts', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#fff3c4', 'line-width': 2.4, 'line-dasharray': [2, 1.4] } },
      { id: 'sea-names', type: 'symbol', source: 'seas', filter: inZoom(), layout: { 'symbol-placement': 'line-center', 'text-field': ['get', 't'], 'text-font': ['Noto Sans Italic'], 'text-size': sizeAt('k'), 'text-letter-spacing': 0.5, 'text-max-angle': 40, 'text-pitch-alignment': 'map', 'text-rotation-alignment': 'map', 'text-keep-upright': true }, paint: { 'text-color': 'rgba(196,224,255,0.5)', 'text-opacity-transition': { duration: 500 } } },
      { id: 'arrow-glow', type: 'line', source: 'arrows', layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'c'], 'line-width': 10, 'line-blur': 8, 'line-opacity': 0.75 } },
      { id: 'arrow-fill', type: 'fill', source: 'arrows', paint: { 'fill-color': ['get', 'c'] } },
      { id: 'arrow-edge', type: 'line', source: 'arrows', layout: { 'line-join': 'round' }, paint: { 'line-color': 'rgba(255,255,255,0.9)', 'line-width': 1.3 } },
      ...VOYAGE_LAYERS,
      { id: 'names', type: 'symbol', source: 'labels', filter: inZoom(), layout: { 'symbol-placement': 'line-center', 'symbol-sort-key': ['get', 'r'], 'text-field': ['get', 't'], 'text-font': ['Noto Sans Bold'], 'text-size': sizeAt('k'), 'text-letter-spacing': 0.32, 'text-max-angle': 36, 'text-pitch-alignment': 'map', 'text-rotation-alignment': 'map', 'text-keep-upright': true, 'text-padding': 4 }, paint: { 'text-color': 'rgba(255,255,255,0.93)', 'text-halo-color': 'rgba(12,16,32,0.55)', 'text-halo-width': 1.4, 'text-halo-blur': 1, 'text-opacity-transition': { duration: 600 } } },
    ],
  };
}

const ARROW_MS = 1150;
const ease = (t: number) => 1 - (1 - t) ** 3;

export function CinemaMap({ scene, camera, padding, narrow, onPin, voyage = null, sailRef, onReady, onFail }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const sceneRef = useRef(scene), camRef = useRef(camera), padRef = useRef(padding), pinRef = useRef(onPin);
  sceneRef.current = scene; camRef.current = camera; padRef.current = padding; pinRef.current = onPin;
  const voyRef = useRef(voyage);
  voyRef.current = voyage;
  const voy = useRef<ReturnType<typeof createVoyage> | null>(null);
  const drawn = useRef<{ scene: WarScene | null; cam: number }>({ scene: null, cam: -1 });
  const painted = useRef(new Map<string, [number, number, number]>());
  const markers = useRef<maplibregl.Marker[]>([]);
  const flags = useRef(new Map<string, maplibregl.Marker>());
  const raf = useRef(0);
  const userMoved = useRef(false);
  const targetZoom = useRef(4);

  // ── The map ──
  useEffect(() => {
    let m: maplibregl.Map;
    const cam = camRef.current;
    try {
      m = new maplibregl.Map({
        container: host.current!, style: style(), attributionControl: false,
        center: cam ? [cam.lng, cam.lat] : voyRef.current ? [voyRef.current.points[0][1], voyRef.current.points[0][0]] : [10, 45], zoom: cam ? zoomForAltitude(cam.alt, narrow) - 1.2 : 2, pitch: 0,
        pixelRatio: Math.min(2, window.devicePixelRatio || 1), maxPitch: 70, fadeDuration: 250, renderWorldCopies: false,
      });
    } catch { onFail(); return; }
    map.current = m;
    // Start framed like the globe it replaces (the same room left for the panel), then swoop in.
    m.setPadding({ ...padRef.current, top: 0, right: 0 });
    if (import.meta.env.DEV) (window as unknown as { __cine?: maplibregl.Map }).__cine = m; // (for checking it from the console)
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');
    // The terrain's credit is required, but it needn't fill the corner: a small "i", tap for the text.
    // (MapLibre opens the compact credit at first; close it once the sources have reported theirs.)
    const fold = () => host.current?.querySelector('.maplibregl-ctrl-attrib.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');
    m.once('load', fold);
    m.once('idle', fold);
    let failed = false;
    m.on('error', (e) => { if (!ready.current && !failed && /webgl|context/i.test(String(e.error?.message))) { failed = true; onFail(); } });
    m.once('load', () => {
      ready.current = true;
      host.current?.classList.add('ready');
      voy.current = createVoyage(m, { narrow, calm: calmMotion, padding: () => padRef.current, onPin: (id) => pinRef.current?.(id) });
      if (sailRef) sailRef.current = { sail: (o) => voy.current?.sail(o) ?? (() => {}) };
      voy.current.show(voyRef.current);
      onReady();
      draw(true);
    });
    // Names are sized for the zoom whenever the camera comes to rest (they fade out while it flies).
    m.on('moveend', fitNames);
    // Markers on the far side of the globe fade away (checked once a frame while the map moves).
    let culling = 0;
    m.on('move', () => { if (!culling) culling = requestAnimationFrame(() => { culling = 0; cull(m); }); });
    m.on('moveend', () => cull(m));
    m.once('load', fitNames);
    // You took the camera: no more drifting until the next event.
    const mine = (e: { originalEvent?: unknown }) => { if (e.originalEvent) { userMoved.current = true; } };
    m.on('dragstart', mine); m.on('zoomstart', mine); m.on('rotatestart', mine); m.on('pitchstart', mine);
    return () => {
      cancelAnimationFrame(raf.current);
      voy.current?.clear();
      voy.current = null;
      if (sailRef) sailRef.current = null;
      ready.current = false;
      m.remove(); // (its markers go with it)
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const band = useRef(-1);
  function fitNames() {
    const m = map.current;
    if (!m) return;
    const z = Math.max(0, Math.round(m.getZoom() * 4) / 4);
    if (z !== band.current) {
      band.current = z;
      for (const id of ['names', 'sea-names']) { m.setLayoutProperty(id, 'text-size', sizeAt('k', z)); m.setFilter(id, inZoom(z)); }
    }
    showNames(true);
  }
  function showNames(on: boolean) {
    for (const id of ['names', 'sea-names']) map.current?.setPaintProperty(id, 'text-opacity', on ? 1 : 0);
  }

  // ── Drawing a scene ──
  function draw(first = false) {
    const m = map.current;
    if (!m || !ready.current) return;
    const sc = sceneRef.current, cam = camRef.current;
    if (cam && drawn.current.cam !== cam.n) { drawn.current.cam = cam.n; fly(cam, first); }
    if (drawn.current.scene === sc) return;
    const prev = drawn.current.scene;
    drawn.current.scene = sc;
    if (!prev || prev.paint !== sc.paint) paintCountries(sc.paint ?? {});
    if (!prev || prev.shapes !== sc.shapes) drawShapes();
    if (!prev || prev.paths !== sc.paths) drawPaths();
    drawLabels();
    drawMarkers();
    cull(m);
  }

  function paintCountries(paint: Record<string, string>) {
    const m = map.current!;
    // Glowing edges: around each side's lands, where they meet another side or the sea.
    const sideOf = (g: { id?: string | number; properties?: { name?: string } | null }) => paint[topoCca3(g.id, g.properties?.name ?? '') ?? ''] ?? null;
    const colours = [...new Set(Object.values(paint))];
    const features: GeoJSON.Feature[] = colours.map((c) => {
      const ml = mesh(TOPO_50, TOPO_50.objects.countries as never, (a, b) => (sideOf(a as never) === c) !== (sideOf(b as never) === c) || (a === b && sideOf(a as never) === c)) as GeoJSON.MultiLineString;
      // The date line cuts Russia: that cut is not a border, and a jump from 180° to −180° isn't a line.
      const lines: GeoJSON.Position[][] = [];
      for (const l of ml.coordinates) {
        if (l.every((p) => Math.abs(p[0]) > 179.9)) continue;
        let run: GeoJSON.Position[] = [l[0]];
        for (let i = 1; i < l.length; i++) {
          if (Math.abs(l[i][0] - l[i - 1][0]) > 180) { if (run.length > 1) lines.push(run); run = []; }
          run.push(l[i]);
        }
        if (run.length > 1) lines.push(run);
      }
      return { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: lines }, properties: { c } };
    });
    (m.getSource('edges') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features });

    // Fills: each change fades in, one country after another, with a brief flare.
    const want = new Map(Object.entries(paint).map(([k, c]) => [k, tint(c)]));
    const moving: { k: string; from: [number, number, number]; to: [number, number, number] | null }[] = [];
    for (const [k, to] of want) { const from = painted.current.get(k); if (!from || from.join() !== to.join()) moving.push({ k, from: from ?? BASE, to }); }
    for (const [k, from] of painted.current) if (!want.has(k)) moving.push({ k, from, to: null });
    painted.current = want;
    if (!moving.length) return;
    if (calmMotion()) { for (const mv of moving) set(mv.k, mv.to); return; }
    const t0 = performance.now(), STEP = Math.min(24, 900 / moving.length), FADE = 700;
    const tick = (now: number) => {
      if (map.current !== m) return; // (the map closed mid-fade)
      let busy = false;
      moving.forEach((mv, i) => {
        const t = Math.min(1, Math.max(0, (now - t0 - i * STEP) / FADE));
        if (t < 1) busy = true;
        if (t <= 0) return;
        const to = mv.to ?? BASE, e = t * t * (3 - 2 * t), flare = mv.to ? Math.sin(Math.PI * t) * 0.18 : 0;
        const c = [0, 1, 2].map((j) => Math.min(255, Math.round(mv.from[j] + (to[j] - mv.from[j]) * e + 255 * flare * 0.5))) as [number, number, number];
        if (t === 1) set(mv.k, mv.to); else m.setFeatureState({ source: 'countries', id: mv.k }, { c: css(c) });
      });
      if (busy) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    function set(k: string, c: [number, number, number] | null) {
      if (c) m.setFeatureState({ source: 'countries', id: k }, { c: css(c) }); else m.removeFeatureState({ source: 'countries', id: k });
    }
  }

  function drawShapes() {
    const m = map.current!;
    const shapes = sceneRef.current.shapes ?? [];
    const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: shapes.map((s) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...flip(s.ring), flip(s.ring)[0]]] }, properties: { c: css(tint(s.color)) } })) };
    (m.getSource('shapes') as maplibregl.GeoJSONSource).setData(fc);
    // Fade in afresh: from nothing to the shape.
    for (const [layer, prop, to] of [['shapes', 'fill-opacity', 0.9], ['shape-glow', 'line-opacity', 0.8], ['shape-core', 'line-opacity', 0.75]] as const) {
      m.setPaintProperty(layer, prop, 0);
      requestAnimationFrame(() => map.current?.setPaintProperty(layer, prop, shapes.length ? to : 0));
    }
  }

  function drawPaths() {
    const m = map.current!;
    const paths = sceneRef.current.paths;
    const fronts = paths.filter((p) => p.mode === 'front');
    (m.getSource('fronts') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: fronts.map((p) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: p.points.map(([la, lo]) => [lo, la]) }, properties: {} })) });
    const arrows = paths.filter((p) => p.mode === 'arrow' && p.points.length >= 2);
    cancelAnimationFrame(raf.current);
    const lat = camRef.current?.lat ?? 45;
    const W = (narrow ? 12 : 15) * metresPerPixel(targetZoom.current, lat);
    const t0 = performance.now(), calm = calmMotion();
    const build = (now: number) => {
      let busy = false;
      const features: GeoJSON.Feature[] = [];
      arrows.forEach((p, k) => {
        const t = calm ? 1 : Math.min(1, Math.max(0, (now - t0 - (p.delay ?? 0)) / ARROW_MS));
        if (t < 1) busy = true;
        if (t <= 0) return;
        const ring = arrowPolygon({ from: p.points[0], to: p.points[p.points.length - 1], width: W, bend: k % 2 ? -0.14 : 0.16, progress: ease(t) });
        features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { c: p.color } });
      });
      (map.current?.getSource('arrows') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
      if (busy) raf.current = requestAnimationFrame(build);
    };
    raf.current = requestAnimationFrame(build);
  }

  function drawLabels() {
    const m = map.current!;
    const sc = sceneRef.current;
    const feats: GeoJSON.Feature[] = [];
    // Each side's countries, biggest first (smaller names give way when they'd collide).
    const ids = Object.keys(sc.paint ?? {}).map((id) => ({ id, c: BY_CCA3.get(id) })).filter((x) => x.c).sort((a, b) => b.c!.area - a.c!.area);
    ids.forEach(({ id, c }, i) => {
      const ring = mainlandOf(id);
      if (ring.length < 4) return;
      const spine = spineFor(ring).map(([x, y]) => [wrapLng(x), y] as [number, number]);
      if (spine.some((p, j) => j && Math.abs(p[0] - spine[j - 1][0]) > 180)) return; // (a name never straddles the date line)
      feats.push(labelFeature(c!.name, spine, i + 10));
    });
    for (const s of sc.shapes ?? []) {
      if (!s.name) continue;
      const spine = s.spine ? flip(s.spine) : spineFor(flip(s.ring), 0.8);
      feats.push(labelFeature(s.name, spine, 0));
    }
    (m.getSource('labels') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: feats });
  }

  function drawMarkers() {
    const m = map.current!;
    const sc = sceneRef.current;
    for (const mk of markers.current) mk.remove();
    markers.current = sc.pins.filter((p) => p.active).map((p) => {
      const el = document.createElement('div');
      el.className = 'clash-pin on cine-clash';
      el.style.setProperty('--c', p.tone);
      el.innerHTML = '<button type="button"><i><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M14.5 6.5 18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2"/></svg></i></button>';
      el.querySelector('button')!.setAttribute('aria-label', p.name);
      el.querySelector('button')!.addEventListener('click', () => pinRef.current?.(p.id));
      return track(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(m));
    });
    // Flags rise where countries change sides; they stay planted until the next event.
    const want = new Set(sc.flags ?? []);
    for (const [id, mk] of flags.current) if (!want.has(id)) { mk.getElement().classList.add('gone'); window.setTimeout(() => mk.remove(), 300); flags.current.delete(id); }
    [...want].forEach((id, i) => {
      if (flags.current.has(id)) return;
      const c = BY_CCA3.get(id);
      const at = c?.capLatLng ?? c?.latlng;
      if (!c || !at) return;
      const el = document.createElement('div');
      el.className = 'cine-flag';
      el.style.animationDelay = `${0.5 + i * 0.12}s`;
      el.innerHTML = `<span><img alt="" src="${flagUrl(c.cca2, 80)}"></span><i></i>`;
      flags.current.set(id, track(new maplibregl.Marker({ element: el, anchor: 'bottom-left' }).setLngLat([at[1], at[0]]).addTo(m)));
    });
  }

  // ── The camera: a swoop to each event, then a slow drift while you read ──
  function fly(cam: CinemaCamera, first: boolean) {
    const m = map.current!;
    const zoom = zoomForAltitude(cam.alt, narrow);
    targetZoom.current = zoom;
    userMoved.current = false;
    const bearing = ((cam.n * 37) % 28) - 14;
    const pitch = narrow ? 46 : 54;
    const pad = { left: padRef.current.left, bottom: padRef.current.bottom, top: 0, right: 0 };
    const calm = calmMotion();
    m.stop();
    if (!calm) showNames(false);
    // A journey you can follow: out, across, and in, taking longer the further it goes (Hawaii to
    // Singapore is a long, high arc; the next valley over, a short glide).
    const here = m.getCenter();
    const km = 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(Math.sin(((cam.lat - here.lat) * Math.PI) / 360) ** 2
      + Math.cos((cam.lat * Math.PI) / 180) * Math.cos((here.lat * Math.PI) / 180) * Math.sin(((cam.lng - here.lng) * Math.PI) / 360) ** 2)));
    const duration = calm ? 0 : Math.round(Math.min(5600, Math.max(first ? 2600 : 1600, 1300 + km * 0.45)));
    m.flyTo({ center: [cam.lng, cam.lat], zoom, pitch, bearing, padding: pad, duration, curve: km > 1500 ? 1.75 : 1.4, easing: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2), essential: true });
    if (calm) return;
    m.once('moveend', () => {
      if (userMoved.current || drawn.current.cam !== cam.n) return;
      m.easeTo({ bearing: bearing + 7, zoom: zoom + 0.22, duration: 16000, easing: (t) => t, padding: pad, essential: true });
    });
  }

  // The panel grew or shrank (the details opened, the phone turned): re-centre on what's left.
  const padKey = `${padding.left},${padding.bottom}`;
  const lastPad = useRef(padKey);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current || lastPad.current === padKey) return;
    lastPad.current = padKey;
    // (A bare padding change would cut short a flight under way: frame the same thing again.)
    if (voy.current?.reframe()) return;
    const cam = camRef.current;
    if (cam && m.isMoving()) { fly(cam, false); return; }
    m.easeTo({ padding: { ...padRef.current, top: 0, right: 0 }, duration: calmMotion() ? 0 : 500, essential: true });
  }, [padKey]);

  // A voyage opened, changed, or a port was picked.
  useEffect(() => { voy.current?.show(voyage); }, [voyage]);

  // Redraw whenever the panel hands over a new scene or camera.
  useEffect(() => { draw(); }); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="cine-layer">
      <div className="cine-map" ref={host} />
      <div className="cine-vignette" aria-hidden />
    </div>
  );
}
