// Physical geography: rivers, lakes, mountain ranges and peaks (Natural Earth).
//
// Restraint is the whole design: features reveal themselves progressively with zoom
// (only the great rivers at world scale, tributaries as you dive in), lines are hairline
// and colour-matched to the water, and every label goes through the same collision
// pass as the political labels — so the map gains texture, never clutter.
import * as THREE from 'three';
import ConicPolygonGeometry from 'three-conic-polygon-geometry';
import GeoJsonGeometry from 'three-geojson-geometry';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { FEATURES, FEATURES_110 } from './data';
import { rgba } from './countryMesh';

type LngLat = [number, number];
/** r = importance (1 = great river); len = longest reach in degrees; as = candidate label spots [anchor, a point further along]. */
export interface River { n: string; r: number; len: number; as: [LngLat, LngLat][]; c: LngLat[][] }
export interface Lake { n: string; area: number; l: LngLat; p: LngLat[][][] }
/** a = centre, b = one degree along the range's main axis, len = axis length in degrees */
export interface Range { n: string; r: number; a: LngLat; b: LngLat; len: number }
export interface Peak { n: string; r: number; e: number; a: LngLat }
export interface Nature { rivers: River[]; lakes: Lake[]; ranges: Range[]; peaks: Peak[] }

let naturePromise: Promise<Nature | null> | null = null;
export function loadNature() {
  naturePromise ??= fetch('/nature.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return naturePromise;
}

/** Label spots for a range: its centre, then a quarter of the way along its axis each side. */
export function rangeSpots(r: Range): [LngLat, LngLat][] {
  const dx = r.b[0] - r.a[0], dy = r.b[1] - r.a[1];
  const at = (t: number): LngLat => [r.a[0] + dx * t, r.a[1] + dy * t];
  const q = r.len * 0.25;
  return r.len >= 6 ? [[r.a, r.b], [at(-q), at(-q + 1)], [at(q), at(q + 1)]] : [[r.a, r.b]];
}

type BBox = [number, number, number, number];
function bboxOf(rings: LngLat[][]): BBox {
  const b: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings) for (const [x, y] of r) {
    if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
  }
  return b;
}
const overlaps = (a: BBox, b: BBox) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const riverBox = new WeakMap<River, BBox>();
const lakeBox = new WeakMap<Lake, BBox>();

/**
 * Fast point-in-country test: per-polygon bbox, then planar even-odd ray casting
 * (holes included). Natural Earth splits shapes at the antimeridian, so planar is exact
 * enough here — and ~100× faster than d3's spherical geoContains.
 */
export function insideTest(cca3: string) {
  const polys: { box: BBox; rings: LngLat[][] }[] = [];
  // The 1:110m outline is plenty for "is this river/label inside" — and 5× lighter.
  const coarse = FEATURES_110.some((f) => f.properties.cca3 === cca3);
  for (const f of coarse ? FEATURES_110 : FEATURES) {
    if (f.properties.cca3 !== cca3) continue;
    const g = f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
    for (const rings of (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as LngLat[][][]) polys.push({ box: bboxOf(rings), rings });
  }
  const box = polys.length ? bboxOf(polys.map((p) => [[p.box[0], p.box[1]], [p.box[2], p.box[3]]] as LngLat[])) : ([0, 0, -1, -1] as BBox);
  const inside = ([x0, y]: LngLat) => {
    const x = box[2] > 180 && x0 < box[0] ? x0 + 360 : x0; // shapes unwrapped past 180° (see data.ts)
    if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) return false;
    for (const p of polys) {
      if (x < p.box[0] || x > p.box[2] || y < p.box[1] || y > p.box[3]) continue;
      let c = false;
      for (const r of p.rings) {
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
          const [xi, yi] = r[i], [xj, yj] = r[j];
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
        }
      }
      if (c) return true;
    }
    return false;
  };
  return { box, inside };
}

/** Rivers come in three tiers: the great rivers, major rivers, and tributaries. */
export const riverTier = (rank: number) => (rank <= 2 ? 0 : rank <= 4 ? 1 : 2);

export type NatureStyle = 'political' | 'satellite' | 'daynight';
const PALETTE: Record<NatureStyle, { river: string; glow: string; lake: string | null; lakeEdge: string }> = {
  political: { river: 'rgba(37,99,180,0.9)', glow: 'rgba(147,197,253,0.3)', lake: '#6f9fcb', lakeEdge: 'rgba(52,118,196,0.6)' },
  satellite: { river: 'rgba(150,212,255,0.75)', glow: 'rgba(56,189,248,0.1)', lake: null, lakeEdge: 'rgba(147,210,255,0.45)' },
  daynight: { river: 'rgba(150,212,255,0.7)', glow: 'rgba(56,189,248,0.1)', lake: null, lakeEdge: 'rgba(125,170,255,0.3)' },
};
// Screen widths (px) per river tier — great rivers bold, tributaries fine — and their glow.
const RIVER_W = [1.6, 1.15, 0.85];
const GLOW_W = 2.6; // × the core width
// Camera altitude (globe radii) below which each river tier appears.
const TIER_ALT = [Infinity, 1.25, 0.6];

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Rivers and lakes on the 3D globe: one merged line set per river tier, one merged
 * lake mesh. Tiers fade in/out with altitude; the selected (raised) country gets a
 * lifted copy of its own rivers & lakes so they ride on top of it.
 */
export function createNatureLayer(scene: THREE.Scene, R: number, camera: THREE.Camera) {
  const group = new THREE.Group();
  scene.add(group);
  let data: Nature | null = null;
  let style: NatureStyle = 'political';
  let visible = true;
  const tiers: { core: LineSegments2; glow: LineSegments2 }[] = [];
  const fatMats = new Set<LineMaterial>(); // need the viewport size to size lines in pixels
  let lakeFill: THREE.Mesh | null = null;
  let lakeEdge: THREE.LineSegments | null = null;
  let lifted: { id: string; group: THREE.Group } | null = null;
  let wanted: string | null = null; // latest lift request (older async ones bail out)
  const tierAlpha = [0, 0, 0];
  let raf = 0;

  const lineMat = () => new THREE.LineBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  /** Screen-space line set (real pixel widths; WebGL's own lines are always 1px). */
  const fat = (geo: THREE.BufferGeometry, width: number, order: number) => {
    const g = new LineSegmentsGeometry().setPositions(geo.getAttribute('position').array as Float32Array);
    geo.dispose();
    const m = new LineMaterial({ linewidth: width, transparent: true, opacity: 0, depthWrite: false, worldUnits: false });
    m.resolution.set(window.innerWidth, window.innerHeight);
    fatMats.add(m);
    const l = new LineSegments2(g, m);
    l.renderOrder = order;
    l.userData.width = width;
    return l;
  };
  const onResize = () => fatMats.forEach((m) => m.resolution.set(window.innerWidth, window.innerHeight));
  window.addEventListener('resize', onResize);

  function riverGeo(rivers: River[], radius: number) {
    if (!rivers.length) return null;
    const parts = rivers.map((r) => new GeoJsonGeometry({ type: 'MultiLineString', coordinates: r.c } as never, radius, 3))
      .map((g) => (g.index ? g.toNonIndexed() : g));
    const geo = mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    return geo;
  }
  function lakeGeos(lakes: Lake[], bottom: number, top: number) {
    const fills: THREE.BufferGeometry[] = [], edges: THREE.BufferGeometry[] = [];
    for (const l of lakes) for (const poly of l.p) {
      fills.push(new ConicPolygonGeometry(poly as number[][][], bottom, top, false, true, false, 4).toNonIndexed());
      edges.push(new GeoJsonGeometry({ type: 'Polygon', coordinates: poly } as never, top * 1.0002, 4));
    }
    if (!fills.length) return null;
    fills.forEach((g) => g.clearGroups());
    const fill = mergeGeometries(fills, false)!, edge = mergeGeometries(edges.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
    fills.forEach((g) => g.dispose()); edges.forEach((g) => g.dispose());
    return { fill, edge };
  }

  function applyColors() {
    const pal = PALETTE[style];
    const [r, g, b] = rgba(pal.river), gl = rgba(pal.glow);
    for (const t of tiers) { t.core.material.color.setRGB(r, g, b); t.glow.material.color.setRGB(gl[0], gl[1], gl[2]); }
    if (lakeFill) {
      lakeFill.visible = !!pal.lake;
      if (pal.lake) { const c = rgba(pal.lake); (lakeFill.material as THREE.MeshLambertMaterial).color.setRGB(c[0], c[1], c[2]); }
    }
    if (lakeEdge) { const c = rgba(pal.lakeEdge); const m = lakeEdge.material as THREE.LineBasicMaterial; m.color.setRGB(c[0], c[1], c[2]); m.opacity = c[3]; }
    if (lifted) lifted.group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material & { color?: THREE.Color; opacity: number } | undefined;
      if (!m?.color) return;
      const kind = o.userData.kind as string;
      const c = rgba(kind === 'river' ? pal.river : kind === 'riverGlow' ? pal.glow : kind === 'lake' ? pal.lake ?? '#000' : pal.lakeEdge);
      m.color.setRGB(c[0], c[1], c[2]);
      if (kind === 'lake') o.visible = !!pal.lake;
      o.userData.target = c[3];
    });
  }

  function tick() {
    raf = requestAnimationFrame(tick);
    if (!data) return;
    const alt = camera.position.length() / R - 1;
    const base = rgba(PALETTE[style].river)[3], glowA = rgba(PALETTE[style].glow)[3];
    // Lines thicken a little as you dive in, so rivers read as rivers at every scale.
    const grow = 1 + 0.35 * Math.max(0, Math.min(1, (1.3 - alt) / 1.1));
    tiers.forEach((t, i) => {
      const want = visible && alt < TIER_ALT[i] ? 1 : 0;
      tierAlpha[i] += (want - tierAlpha[i]) * 0.12;
      if (Math.abs(want - tierAlpha[i]) < 0.005) tierAlpha[i] = want;
      const zoomBoost = Math.min(1, 0.6 + (2.2 - Math.min(2.2, alt)) * 0.3);
      t.core.material.opacity = base * tierAlpha[i] * zoomBoost;
      t.glow.material.opacity = glowA * tierAlpha[i] * zoomBoost;
      t.core.material.linewidth = RIVER_W[i] * grow;
      t.glow.material.linewidth = RIVER_W[i] * grow * GLOW_W;
      t.core.visible = t.glow.visible = tierAlpha[i] > 0.002;
    });
    group.visible = visible;
  }

  return {
    async init() {
      data = await loadNature();
      if (!data) return;
      const byTier: River[][] = [[], [], []];
      for (const r of data.rivers) byTier[riverTier(r.r)].push(r);
      byTier.forEach((rs, i) => {
        const geo = riverGeo(rs, R * 1.0056);
        const geo2 = riverGeo(rs, R * 1.0055);
        if (!geo || !geo2) return;
        const t = { glow: fat(geo2, RIVER_W[i] * GLOW_W, 3), core: fat(geo, RIVER_W[i], 3.1) };
        tiers.push(t); group.add(t.glow, t.core);
      });
      const lk = lakeGeos(data.lakes, R * 1.0046, R * 1.0053);
      if (lk) {
        lakeFill = new THREE.Mesh(lk.fill, new THREE.MeshLambertMaterial({ transparent: true, opacity: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        lakeFill.renderOrder = 2;
        lakeEdge = new THREE.LineSegments(lk.edge, new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
        lakeEdge.renderOrder = 3;
        group.add(lakeFill, lakeEdge);
      }
      applyColors();
      raf = requestAnimationFrame(tick);
    },
    setStyle(s: NatureStyle) { style = s; applyColors(); },
    setVisible(v: boolean) { visible = v; if (lifted) lifted.group.visible = v; },
    /** Lift the selected country's own rivers & lakes onto its raised cap (null clears). */
    async lift(cca3: string | null, lift: number) {
      wanted = cca3;
      if (lifted && lifted.id !== cca3) {
        const old = lifted.group; lifted = null;
        fadeGroup(old, 0, 180, 0, () => {
          scene.remove(old);
          old.traverse((o) => {
            (o as THREE.Mesh).geometry?.dispose();
            const m = (o as THREE.Mesh).material;
            if (m instanceof LineMaterial) { fatMats.delete(m); m.dispose(); }
          });
        });
      }
      if (!cca3 || lifted) return;
      const d = data ?? (await loadNature());
      // Let the selection's first frame (panel, highlight, camera start) paint before this work.
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      if (!d || wanted !== cca3) return;
      const { box, inside } = insideTest(cca3);
      const riv: River[] = [];
      for (const r of d.rivers) {
        let rb = riverBox.get(r);
        if (!rb) riverBox.set(r, (rb = bboxOf(r.c)));
        if (!overlaps(rb, box)) continue;
        // Keep the reaches that run through the country (segment midpoints inside).
        const segs: LngLat[][] = [];
        for (const part of r.c) {
          let cur: LngLat[] = [];
          for (let i = 1; i < part.length; i++) {
            const m: LngLat = [(part[i - 1][0] + part[i][0]) / 2, (part[i - 1][1] + part[i][1]) / 2];
            if (inside(m)) { if (!cur.length) cur.push(part[i - 1]); cur.push(part[i]); }
            else if (cur.length) { segs.push(cur); cur = []; }
          }
          if (cur.length) segs.push(cur);
        }
        if (segs.length) riv.push({ ...r, c: segs });
      }
      const lakes = d.lakes.filter((l) => {
        let lb = lakeBox.get(l);
        if (!lb) lakeBox.set(l, (lb = bboxOf(l.p.map((poly) => poly[0]))));
        return overlaps(lb, box) && inside(l.l);
      });
      const top = R * (1 + lift);
      const g = new THREE.Group();
      const rg = riverGeo(riv, top * 1.0009), rg2 = riverGeo(riv, top * 1.0008);
      if (rg && rg2) {
        const glow = fat(rg2, RIVER_W[1] * GLOW_W * 1.3, 7); glow.userData.kind = 'riverGlow';
        const core = fat(rg, RIVER_W[1] * 1.3, 7.1); core.userData.kind = 'river';
        g.add(glow, core);
      }
      const lk = lakeGeos(lakes, top * 1.0001, top * 1.0006);
      if (lk) {
        const f = new THREE.Mesh(lk.fill, new THREE.MeshLambertMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        f.userData.kind = 'lake'; f.renderOrder = 6;
        const e = new THREE.LineSegments(lk.edge, lineMat()); e.userData.kind = 'edge'; e.renderOrder = 7;
        g.add(f, e);
      }
      if (lifted || wanted !== cca3 || !g.children.length) return; // superseded while loading
      g.visible = visible;
      scene.add(g);
      lifted = { id: cca3, group: g };
      applyColors();
      // Draw in once the country has risen (same beat as the province lines).
      fadeGroup(g, 1, 400, 250);
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      scene.remove(group);
      group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      if (lifted) scene.remove(lifted.group);
    },
  };
}

/** Fade every material in a group toward `to` × its own target opacity. */
function fadeGroup(g: THREE.Object3D, to: number, ms: number, delay = 0, done?: () => void) {
  const mats: { m: THREE.Material & { opacity: number }; from: number; target: number }[] = [];
  g.traverse((o) => {
    const m = (o as THREE.Mesh).material as (THREE.Material & { opacity: number }) | undefined;
    if (m) mats.push({ m, from: m.opacity, target: to * ((o.userData.target as number | undefined) ?? 1) });
  });
  const t0 = performance.now() + delay;
  const step = (now: number) => {
    const t = Math.max(0, Math.min(1, (now - t0) / ms));
    for (const x of mats) x.m.opacity = x.from + (x.target - x.from) * ease(t);
    if (t < 1) requestAnimationFrame(step); else done?.();
  };
  requestAnimationFrame(step);
}
