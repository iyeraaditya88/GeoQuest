import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  geoAzimuthalEquidistantRaw, geoGraticule10, geoNaturalEarth1, geoNaturalEarth1Raw, geoOrthographicRaw,
  geoPath, geoProjection, type GeoProjection, type GeoRawProjection,
} from 'd3-geo';
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { easeCubicInOut } from 'd3-ease';
import { BY_CCA3, COUNTRIES, FEATURES, FEATURES_110, MAPPABLE, POLITICAL_COLOR, countryAt, fmtCompact, shade } from '../lib/data';
import citiesRaw from '../data/cities.json';
import { cursor } from '../lib/cursor';
import { loadAdmin, prefetchCountry, type AdminCity, type AdminState } from '../lib/globeOverlays';
import { loadNature, rangeSpots, riverTier, type Nature } from '../lib/nature';
import { displayName, riverNear, type FeatureInfo, type FeatureRef } from '../lib/features';
import type { Feedback, GlobeView2D } from './GlobeView';

export interface AtlasHandle {
  morphOut: (to: GlobeView2D) => Promise<void>;
  centerGeo: () => { lat: number; lng: number };
  focus: (cca3: string) => void;
  fit: (codes: string[]) => void;
  /** Frame a [w, s, e, n] box (a river, range…), beside the side panel. */
  fitGeo: (bbox: [number, number, number, number]) => void;
  reset: () => void;
}

interface Props {
  from: GlobeView2D;
  fadeIn: boolean;
  selected: string | null;
  highlighted: string[];
  feedback: Feedback;
  quiz: boolean;
  panelOpen: boolean;
  leftInset: number;
  /** rivers, lakes, mountain ranges & peaks */
  nature?: boolean;
  /** The selected river/range/peak/lake (highlighted). */
  feature?: FeatureInfo | null;
  onFeature?: (f: FeatureRef) => void;
  onSelect: (cca3: string | null) => void;
  onInteract: () => void;
  onReady: () => void;
}

type City = [string, number, number, number, number, 0 | 1, string];
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpLog = (a: number, b: number, t: number) => Math.exp(lerp(Math.log(a), Math.log(b), t));
const R2D = 180 / Math.PI;

/**
 * One projection that continuously deforms globe → disc → atlas.
 *   m ∈ [0,1]: orthographic → azimuthal equidistant (the far side unfolds outward)
 *   m ∈ [1,2]: azimuthal equidistant → Natural Earth
 * Both first-stage projections are azimuthal with the same bearing, so blending only
 * changes the radial distance; the clip angle grows exactly as fast as that radial
 * function stays monotonic, so the map never folds over itself.
 */
function morphProjection() {
  let m = 0;
  const raw = ((λ: number, φ: number) => {
    if (m <= 1) {
      const a = geoOrthographicRaw(λ, φ), b = geoAzimuthalEquidistantRaw(λ, φ);
      return [lerp(a[0], b[0], m), lerp(a[1], b[1], m)];
    }
    // Points near the far side (large angular distance c) settle into place sooner,
    // so the disc's rim retracts smoothly instead of lingering as bulges.
    const c = Math.acos(Math.max(-1, Math.min(1, Math.cos(φ) * Math.cos(λ)))) / Math.PI;
    const u = 1 - Math.pow(1 - (m - 1), 1 + 3.5 * c ** 3);
    const a = geoAzimuthalEquidistantRaw(λ, φ), b = geoNaturalEarth1Raw(λ, φ);
    return [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
  }) as GeoRawProjection;
  const p = geoProjection(raw).precision(1.2) as GeoProjection & { morph: (v: number) => GeoProjection; m: () => number; rawAt: (λ: number, φ: number) => [number, number] };
  p.m = () => m;
  p.rawAt = (λ, φ) => raw(λ, φ) as [number, number];
  p.morph = (v: number) => {
    m = v;
    if (m < 1) {
      // largest non-folding angle for r(c) = (1-m)·sin c + m·c
      const c = m >= 0.5 ? Math.PI : Math.acos(Math.max(-1, -m / (1 - m)));
      p.clipAngle(Math.min(179.5, c * R2D - 0.5));
    } else {
      p.clipAngle(null as unknown as number);
    }
    return p;
  };
  return p;
}

const SPHERE = { type: 'Sphere' } as const;
type MorphProj = ReturnType<typeof morphProjection>;

/** Exact outline of the map mid-morph (d3's Sphere outline misbehaves on a blended projection). */
function traceOutline(ctx: CanvasRenderingContext2D, proj: MorphProj) {
  const m = proj.m(), k = proj.scale(), [tx, ty] = proj.translate();
  ctx.beginPath();
  if (m < 1) {
    const c = ((proj.clipAngle() ?? 180) * Math.PI) / 180;
    ctx.arc(tx, ty, k * ((1 - m) * Math.sin(c) + m * c), 0, Math.PI * 2);
    return;
  }
  // Walk the boundary of the cut sphere in rotated coordinates. Near the antipode the
  // azimuthal stage blows up into the rim of the disc, so detour around it on a tiny
  // semicircle; in Natural Earth the same path becomes the familiar rounded outline.
  const D = Math.PI / 180, e = 1e-4, rho = 0.6 * D, pts: [number, number][] = [];
  const add = (λ: number, φ: number) => pts.push(proj.rawAt(λ, φ));
  for (let d = -89.9; d <= -0.6; d += 1.5) add(Math.PI - e, d * D);
  for (let a = -90; a <= 90; a += 2) add(Math.PI - rho * Math.cos(a * D), rho * Math.sin(a * D));
  for (let d = 0.6; d <= 89.9; d += 1.5) add(Math.PI - e, d * D);
  for (let l = 180; l >= -180; l -= 3) add(Math.max(-Math.PI + e, Math.min(Math.PI - e, l * D)), 89.9 * D);
  for (let d = 89.9; d >= 0.6; d -= 1.5) add(-Math.PI + e, d * D);
  for (let a = 90; a >= -90; a -= 2) add(-Math.PI + rho * Math.cos(a * D), rho * Math.sin(a * D));
  for (let d = -0.6; d >= -89.9; d -= 1.5) add(-Math.PI + e, d * D);
  for (let l = -180; l <= 180; l += 3) add(Math.max(-Math.PI + e, Math.min(Math.PI - e, l * D)), -89.9 * D);
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(tx + x * k, ty - y * k) : ctx.moveTo(tx + x * k, ty - y * k)));
  ctx.closePath();
}
const GRATICULE = geoGraticule10();
const CITIES = citiesRaw as City[];

/**
 * Everything the flat atlas draws, projected ONCE at zoom 1 into Path2D objects.
 * Zooming/panning is then a pure canvas transform — no re-projection per frame.
 */
interface FlatCache {
  countries: [string, Path2D, [number, number, number, number]][];
  other: Path2D;
  borders: Path2D;
  sphere: Path2D;
  graticule: Path2D;
  ocean: CanvasGradient;
  countryLabels: { id: string; text: string; px: number; w: number; x: number; y: number; bw: number; bh: number }[];
  cityLabels: { name: string; key: string; iso: string; x: number; y: number; w: number; cap: boolean; rank: number }[];
  capitalOf: Map<string, FlatCache['cityLabels'][number]>;
}

interface NatCache {
  key: string;
  rivers: Path2D[]; // per tier
  lakes: Path2D;
  labels: { kind: 'river' | 'lake' | 'range' | 'peak'; key: string; group?: string; text: string; x: number; y: number; ang: number; w: number; size: number; rank: number; elev?: string; ew?: number }[];
}
// Zoom at which each river tier's lines appear, and at which labels of each rank do.
const RIVER_LINE_K = [0, 2.2, 5];
const RIVER_LABEL_K = [1.6, 3.2, 6.5];
const RANGE_K = [0, 1, 1.7, 3, 5.5, 9, 15];
const PEAK_K = [0, 2.6, 4.5, 7.5, 12, 18];
const ramp = (k: number, k0: number) => (k0 <= 0 ? 1 : Math.max(0, Math.min(1, (k - k0 * 0.8) / (k0 * 0.35))));

function cityMaxRank(k: number) {
  if (k < 1.5) return 0;
  if (k < 2.6) return 1;
  if (k < 4.5) return 2;
  if (k < 8) return 3;
  if (k < 14) return 4;
  return 6;
}

export const FlatAtlas = forwardRef<AtlasHandle, Props>(function FlatAtlas(props, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  live.current = props;

  const st = useRef({
    W: window.innerWidth, H: window.innerHeight, dpr: Math.min(window.devicePixelRatio || 1, 2),
    phase: 'morph' as 'morph' | 'flat',
    lambda0: props.from.lng,
    S1: 1, T1: [0, 0] as [number, number],
    transform: zoomIdentity as ZoomTransform,
    hover: null as string | null,
    labelAlpha: new Map<string, number>(),
    baseBounds: new Map<string, [number, number, number, number]>(),
    raf: 0,
    zoomB: null as ZoomBehavior<HTMLCanvasElement, unknown> | null,
    cache: null as FlatCache | null,
    pending: null as (() => void) | null,
    /** clickable physical labels drawn this frame (screen boxes) */
    natHits: [] as { box: [number, number, number, number]; kind: FeatureRef['kind']; name: string }[],
    /** province lines per country for the zoom-in view, projected at zoom 1 */
    zoomAdmin: new Map<string, { path: Path2D | null; key: string; lines: number[][][] | null; loading: boolean }>(),
    /** the selected river, projected at zoom 1 */
    pickedRiver: null as { name: string; key: string; path: Path2D } | null,
    nature: null as Nature | null,
    /** nature projected at zoom 1 (rebuilt when the projection changes) */
    nat: null as NatCache | null,
    natAlpha: 0,
    admin: null as {
      id: string; lines: number[][][]; states: AdminState[]; cities: AdminCity[];
      path: Path2D | null; key: string;
      /** projected at zoom 1, with measured text widths */
      pts: { states: { text: string; x: number; y: number; w: number; size: number }[]; cities: { name: string; x: number; y: number; w: number; cap: number }[] } | null;
    } | null,
    interacting: false,
    idle: 0,
  });

  const morph = useRef(morphProjection());
  const flatProj = useRef(geoNaturalEarth1());

  // ── Layout ────────────────────────────────────────────────
  /** Just the projection fit (cheap) — all the morph-in needs to start animating. */
  function fitBase() {
    const s = st.current;
    const top = s.W < 700 ? 70 : 80;
    const left = live.current.leftInset + 16;
    const fitted = geoNaturalEarth1().rotate([-s.lambda0, 0]).fitExtent([[left, top], [s.W - 24, s.H - 40]], SPHERE).precision(0.3);
    s.S1 = fitted.scale();
    s.T1 = fitted.translate() as [number, number];
    return fitted;
  }

  /** Fit + per-country bounds + the zoom-1 path cache (~200 ms: never on a click's first frame). */
  function computeBase() {
    const s = st.current;
    const fitted = fitBase();
    // Per-country size at k=1, for label eligibility and fitting.
    const p = geoPath(fitted);
    s.baseBounds.clear();
    for (const f of FEATURES) {
      const id = f.properties.cca3;
      if (!id) continue;
      const [[x0, y0], [x1, y1]] = p.bounds(f as unknown as GeoJSON.Feature);
      const prev = s.baseBounds.get(id);
      s.baseBounds.set(id, prev ? [Math.min(prev[0], x0), Math.min(prev[1], y0), Math.max(prev[2], x1), Math.max(prev[3], y1)] : [x0, y0, x1, y1]);
    }
    buildCache(fitted);
  }

  function buildCache(fitted: GeoProjection) {
    const s = st.current;
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const svg = geoPath(fitted);
    const byId = new Map<string, Path2D>();
    const other = new Path2D();
    const borders = new Path2D();
    for (const f of FEATURES) {
      const d = svg(f as unknown as GeoJSON.Feature);
      if (!d) continue;
      const p2 = new Path2D(d);
      borders.addPath(p2);
      const id = f.properties.cca3;
      if (!id) { other.addPath(p2); continue; }
      const existing = byId.get(id);
      if (existing) existing.addPath(p2); else byId.set(id, p2);
    }
    const [tx, ty] = s.T1, sc = s.S1;
    const ocean = ctx.createRadialGradient(tx - sc * 0.3, ty - sc * 0.4, sc * 0.1, tx, ty, sc * 3);
    ocean.addColorStop(0, '#c4def2');
    ocean.addColorStop(1, '#8dbbe0');

    // Label metrics measured once.
    const supportsLS = 'letterSpacing' in ctx;
    const countryLabels: FlatCache['countryLabels'] = [];
    for (const c of COUNTRIES.filter((x) => MAPPABLE.has(x.cca3)).sort((a, b) => b.area - a.area)) {
      const bb = s.baseBounds.get(c.cca3);
      const pt = fitted([c.latlng[1], c.latlng[0]]);
      if (!bb || !pt) continue;
      const px = c.area > 3e6 ? 14 : c.area > 6e5 ? 12.5 : c.area > 6e4 ? 11 : 10;
      const text = c.name.toUpperCase();
      ctx.font = `600 ${px}px "Space Grotesk", Inter, sans-serif`;
      if (supportsLS) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px * 0.14}px`;
      countryLabels.push({ id: c.cca3, text, px, w: ctx.measureText(text).width, x: pt[0], y: pt[1], bw: bb[2] - bb[0], bh: bb[3] - bb[1] });
    }
    if (supportsLS) (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
    const cityLabels: FlatCache['cityLabels'] = [];
    for (const [name, lat, lng, , rank, cap, iso] of CITIES) {
      const pt = fitted([lng, lat]);
      if (!pt) continue;
      ctx.font = cap ? '600 11.5px Inter, sans-serif' : '500 11px Inter, sans-serif';
      cityLabels.push({ name, key: `c:${name}:${lat}`, iso, x: pt[0], y: pt[1], w: ctx.measureText(name).width, cap: !!cap, rank: cap ? Math.min(rank, 1) : rank });
    }

    const capitalOf = new Map(cityLabels.filter((c) => c.cap).map((c) => [c.iso, c] as const));
    s.cache = {
      countries: [...byId].map(([id, p2]) => [id, p2, s.baseBounds.get(id) ?? [0, 0, 0, 0]]),
      other, borders,
      sphere: new Path2D(svg(SPHERE) ?? ''),
      graticule: new Path2D(svg(GRATICULE) ?? ''),
      ocean, countryLabels, cityLabels, capitalOf,
    };
  }

  // Fast path for the interactive atlas: cached paths under a canvas transform.
  function drawFlat() {
    const s = st.current, c = canvas.current, C = s.cache;
    if (!c || !C) return false;
    const ctx = c.getContext('2d')!;
    const { k, x, y } = s.transform;
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    ctx.clearRect(0, 0, s.W, s.H);
    ctx.setTransform(s.dpr * k, 0, 0, s.dpr * k, s.dpr * x, s.dpr * y);

    ctx.save();
    if (!s.interacting) { ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18; }
    ctx.fillStyle = C.ocean;
    ctx.fill(C.sphere);
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.38)'; ctx.lineWidth = 0.6 / k; ctx.stroke(C.graticule);

    // Only fill countries that are on screen.
    const vx0 = -x / k, vy0 = -y / k, vx1 = (s.W - x) / k, vy1 = (s.H - y) / k;
    for (const [id, p2, b] of C.countries) {
      if (b[2] < vx0 || b[0] > vx1 || b[3] < vy0 || b[1] > vy1) continue;
      ctx.fillStyle = colorFor(id);
      ctx.fill(p2);
    }
    ctx.fillStyle = '#e7e5e4'; ctx.fill(C.other);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(71,85,105,0.5)'; ctx.lineWidth = 0.6 / k; ctx.stroke(C.borders);

    // Rivers & lakes: hairline, water-coloured, more of them as you zoom in.
    const natWant = live.current.nature !== false && s.nature ? 1 : 0;
    s.natAlpha += (natWant - s.natAlpha) * 0.2;
    if (Math.abs(natWant - s.natAlpha) < 0.01) s.natAlpha = natWant;
    const natAnimating = s.natAlpha !== natWant;
    if (s.nature && s.natAlpha > 0) {
      const key = `${s.S1}|${s.lambda0}`;
      if (s.nat?.key !== key) s.nat = projectNature(s.nature, ctx, key);
      const N = s.nat;
      ctx.globalAlpha = s.natAlpha;
      ctx.fillStyle = '#a9cbe8'; ctx.fill(N.lakes);
      ctx.strokeStyle = 'rgba(52,118,196,0.45)'; ctx.lineWidth = 0.6 / k; ctx.stroke(N.lakes);
      const grow = 1 + 0.18 * Math.log2(Math.max(1, k));
      [1.15, 0.85, 0.65].forEach((w, i) => {
        const a = ramp(k, RIVER_LINE_K[i]);
        if (a <= 0) return;
        ctx.globalAlpha = s.natAlpha * a * 0.85;
        ctx.strokeStyle = '#3a7cc4'; ctx.lineWidth = (w * grow) / k; ctx.stroke(N.rivers[i]);
      });
      ctx.globalAlpha = 1;
    }

    // Province borders for every country in view once zoomed in (the selected one is drawn below).
    if (k >= 3 && !live.current.quiz) {
      const key = `${s.S1}|${s.lambda0}`;
      ctx.save();
      ctx.setLineDash([2.5 / k, 2 / k]);
      ctx.strokeStyle = 'rgba(71,85,105,0.42)'; ctx.lineWidth = 0.6 / k;
      ctx.globalAlpha = Math.min(1, (k - 3) / 1.5);
      for (const [id, , b] of C.countries) {
        if (!id || id === live.current.selected || b[2] < vx0 || b[0] > vx1 || b[3] < vy0 || b[1] > vy1) continue;
        if (Math.max(b[2] - b[0], b[3] - b[1]) * k < 140) continue; // too small on screen to need it
        let z = s.zoomAdmin.get(id);
        if (!z) {
          z = { path: null, key: '', lines: null, loading: true };
          s.zoomAdmin.set(id, z);
          const entry = z;
          void loadAdmin(id).then((d) => { entry.lines = d?.lines ?? []; entry.loading = false; scheduleDraw(); });
        }
        if (z.lines?.length && z.key !== key) {
          const proj = geoNaturalEarth1().rotate([-s.lambda0, 0]).scale(s.S1).translate(s.T1).precision(0.3);
          const dPath = geoPath(proj)({ type: 'MultiLineString', coordinates: z.lines } as GeoJSON.MultiLineString);
          z.path = dPath ? new Path2D(dPath) : null; z.key = key;
        }
        if (z.path) ctx.stroke(z.path);
      }
      ctx.restore();
    }
    // The selected river, in gold.
    const pf = live.current.feature;
    if (pf?.kind === 'river' && pf.river) {
      const key = `${pf.name}|${s.S1}|${s.lambda0}`;
      if (s.pickedRiver?.key !== key) {
        const proj = geoNaturalEarth1().rotate([-s.lambda0, 0]).scale(s.S1).translate(s.T1).precision(0.3);
        const dPath = geoPath(proj)({ type: 'MultiLineString', coordinates: pf.river.c } as GeoJSON.MultiLineString);
        s.pickedRiver = dPath ? { name: pf.name, key, path: new Path2D(dPath) } : null;
      }
      if (s.pickedRiver) {
        ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(251,191,36,0.35)'; ctx.lineWidth = 8 / k; ctx.stroke(s.pickedRiver.path);
        ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2.6 / k; ctx.stroke(s.pickedRiver.path);
        ctx.restore();
      }
    }

    const sel = live.current.selected;
    if (sel && !live.current.quiz) {
      const hit = C.countries.find(([id]) => id === sel);
      if (hit) {
        const A = s.admin;
        const key = `${s.S1}|${s.lambda0}`;
        if (A && A.id === sel && A.key !== key) {
          // Map re-centred or resized: re-project the province lines once.
          const proj = geoNaturalEarth1().rotate([-s.lambda0, 0]).scale(s.S1).translate(s.T1).precision(0.3);
          const d = geoPath(proj)({ type: 'MultiLineString', coordinates: A.lines } as GeoJSON.MultiLineString);
          A.path = d ? new Path2D(d) : null;
          A.key = key;
          A.pts = projectDetail(proj, ctx, A.states, A.cities);
        }
        if (A && A.id === sel && A.path) {
          ctx.save();
          ctx.clip(hit[1]); // keep province lines inside the country
          ctx.strokeStyle = 'rgba(120,53,15,0.7)'; ctx.lineWidth = 1 / k; ctx.setLineDash([4 / k, 2.5 / k]);
          ctx.stroke(A.path);
          ctx.restore();
        }
        ctx.strokeStyle = 'rgba(146,64,14,0.95)'; ctx.lineWidth = 1.4 / k; ctx.stroke(hit[1]);
      }
    }
    ctx.strokeStyle = 'rgba(30,58,95,0.55)'; ctx.lineWidth = 1.2 / k; ctx.stroke(C.sphere);

    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    const labelsAnimating = live.current.quiz ? false : drawLabelsFast(ctx, C);
    return labelsAnimating || natAnimating;
  }

  /** Project rivers, lakes and the physical labels once at zoom 1 (like the countries). */
  function projectNature(d: Nature, ctx: CanvasRenderingContext2D, key: string): NatCache {
    const s = st.current;
    const proj = geoNaturalEarth1().rotate([-s.lambda0, 0]).scale(s.S1).translate(s.T1).precision(0.3);
    const path = geoPath(proj);
    const pxPerDeg = (s.S1 * Math.PI) / 180;
    const tiers: string[][] = [[], [], []];
    for (const r of d.rivers) {
      const p = path({ type: 'MultiLineString', coordinates: r.c } as GeoJSON.MultiLineString);
      if (p) tiers[riverTier(r.r)].push(p);
    }
    const lakeD: string[] = [];
    for (const l of d.lakes) {
      const p = path({ type: 'MultiPolygon', coordinates: l.p } as GeoJSON.MultiPolygon);
      if (p) lakeD.push(p);
    }
    const supportsLS = 'letterSpacing' in ctx;
    const setLS = (v: string) => { if (supportsLS) (ctx as unknown as { letterSpacing: string }).letterSpacing = v; };
    const labels: NatCache['labels'] = [];
    const seen = new Set<string>();
    const angleOf = (a: [number, number], b: [number, number]) => {
      const p = proj(a), q = proj(b);
      if (!p || !q) return 0;
      let ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
      if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
      return ang;
    };
    ctx.save();
    for (const r of d.ranges) {
      if (seen.has(`r${r.n}`)) continue;
      seen.add(`r${r.n}`);
      const text = r.n.toUpperCase();
      ctx.font = 'italic 600 10px Inter, sans-serif'; setLS('1.5px');
      const w = ctx.measureText(text).width;
      rangeSpots(r).forEach(([a, b], i) => {
        const p = proj(a);
        if (p) labels.push({ kind: 'range', key: `nr:${r.n}:${i}`, group: `r${r.n}`, text, x: p[0], y: p[1], ang: angleOf(a, b), w, size: r.len * pxPerDeg, rank: r.r });
      });
    }
    setLS('0px');
    for (const pk of d.peaks) {
      const p = proj(pk.a);
      if (!p || seen.has(`p${pk.n}`)) continue;
      seen.add(`p${pk.n}`);
      const elev = `${pk.e.toLocaleString()} m`;
      ctx.font = 'italic 600 10.5px Inter, sans-serif';
      const w = ctx.measureText(pk.n).width;
      ctx.font = '500 9.5px Inter, sans-serif';
      labels.push({ kind: 'peak', key: `np:${pk.n}`, text: pk.n, x: p[0], y: p[1], ang: 0, w, size: 0, rank: pk.r, elev, ew: ctx.measureText(elev).width });
    }
    ctx.font = 'italic 500 10.5px Inter, sans-serif';
    for (const l of d.lakes) {
      const p = proj(l.l);
      if (!p || !l.n || seen.has(`l${l.n}`)) continue;
      seen.add(`l${l.n}`);
      labels.push({ kind: 'lake', key: `nl:${l.n}`, text: l.n, x: p[0], y: p[1], ang: 0, w: ctx.measureText(l.n).width, size: Math.sqrt(l.area) * pxPerDeg, rank: 0 });
    }
    for (const r of d.rivers) {
      if (!r.n || seen.has(`v${r.id}`)) continue;
      seen.add(`v${r.id}`);
      const w = ctx.measureText(r.n).width;
      // Several candidate spots along the river; the first that fits wins.
      r.as.forEach(([a, b], i) => {
        const p = proj(a);
        if (p) labels.push({ kind: 'river', key: `nv:${r.id}:${i}`, group: `v${r.id}`, text: r.n, x: p[0], y: p[1], ang: angleOf(a, b), w, size: r.len * pxPerDeg, rank: riverTier(r.r) });
      });
    }
    ctx.restore();
    return { key, rivers: tiers.map((t) => new Path2D(t.join(''))), lakes: new Path2D(lakeD.join('')), labels };
  }

  /** Project the selected country's state label points and cities once (zoom 1). */
  function projectDetail(proj: GeoProjection, ctx: CanvasRenderingContext2D, states: AdminState[], cities: AdminCity[]) {
    const supportsLS = 'letterSpacing' in ctx;
    const pxPerDeg = (st.current.S1 * Math.PI) / 180;
    ctx.save();
    ctx.font = '500 10px "Space Grotesk", Inter, sans-serif';
    if (supportsLS) (ctx as unknown as { letterSpacing: string }).letterSpacing = '1.6px';
    const outS = [];
    for (const [name, lat, lng, area] of states) {
      const p = proj([lng, lat]);
      if (!p) continue;
      const text = name.toUpperCase();
      outS.push({ text, x: p[0], y: p[1], w: ctx.measureText(text).width, size: Math.sqrt(area * Math.cos((lat * Math.PI) / 180)) * pxPerDeg });
    }
    if (supportsLS) (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
    const outC = [];
    for (const [name, lat, lng, , cap] of cities) {
      const p = proj([lng, lat]);
      if (!p) continue;
      ctx.font = cap ? '600 11.5px Inter, sans-serif' : '500 11px Inter, sans-serif';
      outC.push({ name, x: p[0], y: p[1], w: ctx.measureText(name).width, cap });
    }
    ctx.restore();
    return { states: outS, cities: outC };
  }

  function drawLabelsFast(ctx: CanvasRenderingContext2D, C: FlatCache) {
    const s = st.current, { k, x: tx, y: ty } = s.transform;
    // Reserve the strip under the sidebar so no label hides behind it.
    const placed: number[] = live.current.leftInset ? [-1e4, -1e4, live.current.leftInset + 4, 1e5] : [];
    // …and the info panel on the right.
    if (live.current.panelOpen && s.W > 900) placed.push(s.W - 424, -1e4, 1e5, 1e5);
    const hit = (x0: number, y0: number, x1: number, y1: number) => {
      for (let i = 0; i < placed.length; i += 4) if (x0 < placed[i + 2] && x1 > placed[i] && y0 < placed[i + 3] && y1 > placed[i + 1]) return true;
      return false;
    };
    const items: { key: string; draw: (a: number) => void }[] = [];
    const want = new Set<string>();
    const supportsLS = 'letterSpacing' in ctx;

    // Zoomed in on the selected country: its states and main cities take over from
    // its name label and world-city labels, revealing more as you zoom.
    const sel = live.current.quiz ? null : live.current.selected;
    const A = s.admin && s.admin.id === sel ? s.admin.pts : null;
    const sb = sel ? s.baseBounds.get(sel) : undefined;
    const detailPx = A && sb ? Math.max(sb[2] - sb[0], sb[3] - sb[1]) * k : 0;
    const detailOn = detailPx > 280;
    const detailCities = detailOn ? Math.min(60, Math.round((detailPx * detailPx) / 14000)) : 0;

    const drawCity = (key: string, name: string, x: number, y: number, w: number, cap: number) => {
      if (x < 0 || x > s.W || y < 0 || y > s.H) return;
      const right = [x - 5, y - 8, x + 9 + w, y + 8] as const, leftBox = [x - 9 - w, y - 8, x + 5, y + 8] as const;
      // Prefer the name to the right of the dot; fall back to the left when that's taken.
      const left = right[2] > s.W || hit(...right);
      if (left && (leftBox[0] < 0 || hit(...leftBox))) return;
      placed.push(...(left ? leftBox : right));
      want.add(key);
      items.push({
        key, draw: (a) => {
          ctx.globalAlpha = a;
          ctx.beginPath(); ctx.arc(x, y, cap === 2 ? 3.5 : 2.6, 0, Math.PI * 2);
          ctx.fillStyle = cap ? '#fff' : '#334155'; ctx.fill();
          ctx.lineWidth = cap === 2 ? 2 : 1.5; ctx.strokeStyle = cap === 2 ? '#b45309' : cap ? '#475569' : '#fff'; ctx.stroke();
          if (supportsLS) (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
          ctx.font = cap === 2 ? '600 11.5px Inter, sans-serif' : cap ? '600 11px Inter, sans-serif' : '500 11px Inter, sans-serif';
          ctx.textAlign = left ? 'right' : 'left'; ctx.textBaseline = 'middle';
          const tx2 = left ? x - 7 : x + 7;
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.strokeText(name, tx2, y);
          ctx.fillStyle = cap === 2 ? '#0f172a' : '#1e293b'; ctx.fillText(name, tx2, y);
        },
      });
    };
    const drawState = (key: string, text: string, x: number, y: number, w: number) => {
      const box = [x - w / 2 - 4, y - 9, x + w / 2 + 4, y + 9] as const;
      if (box[0] < 0 || box[2] > s.W || box[1] < 0 || box[3] > s.H || hit(...box)) return;
      placed.push(...box);
      want.add(key);
      items.push({
        key, draw: (a) => {
          ctx.globalAlpha = a;
          ctx.font = '500 10px "Space Grotesk", Inter, sans-serif';
          if (supportsLS) (ctx as unknown as { letterSpacing: string }).letterSpacing = '1.6px';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,248,238,0.85)'; ctx.strokeText(text, x, y);
          ctx.fillStyle = 'rgba(120,53,15,0.85)'; ctx.fillText(text, x, y);
        },
      });
    };

    // The selected country's capital claims its spot first; other country names keep
    // clear of their own capital (shifting off-centre) so both can be shown.
    const maxRank = cityMaxRank(k);
    for (const L of C.cityLabels) if (L.cap && L.iso === sel) placeBaseCity(L);

    const capitalOf = C.capitalOf;
    for (const L of C.countryLabels) {
      if (detailOn && L.id === sel) continue;
      const bw = L.bw * k, bh = L.bh * k;
      if (Math.min(bw, bh) < 14 || bw < L.w * 0.6) continue;
      const x = L.x * k + tx;
      let y = L.y * k + ty, box: readonly [number, number, number, number] | null = null;
      // Shift a little off-centre if that's what it takes (e.g. to clear the capital).
      const cap = capitalOf.get(L.id);
      const cx = cap ? cap.x * k + tx : 0, cy = cap ? cap.y * k + ty : 0;
      const capBox = cap && cap.rank <= maxRank ? [cx - 5, cy - 8, cx + 9 + cap.w, cy + 8] : null;
      for (const dy of [0, -L.px * 1.3, L.px * 1.3]) {
        const b = [x - L.w / 2 - 5, y + dy - L.px / 2 - 4, x + L.w / 2 + 5, y + dy + L.px / 2 + 4] as const;
        if (b[0] < 0 || b[2] > s.W || b[1] < 0 || b[3] > s.H || hit(...b)) continue;
        if (capBox && b[0] < capBox[2] && b[2] > capBox[0] && b[1] < capBox[3] && b[3] > capBox[1]) continue;
        box = b; y += dy; break;
      }
      if (!box) continue;
      placed.push(...box);
      want.add(L.id);
      items.push({
        key: L.id, draw: (a) => {
          ctx.font = `600 ${L.px}px "Space Grotesk", Inter, sans-serif`;
          if (supportsLS) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${L.px * 0.14}px`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = a;
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,250,240,0.85)'; ctx.strokeText(L.text, x, y);
          ctx.fillStyle = '#3b2f2a'; ctx.fillText(L.text, x, y);
        },
      });
    }
    if (detailOn && A) {
      // Capital and biggest cities first, then region names, then the rest of the cities.
      const city = (i: number) => {
        const c = A.cities[i];
        if (c && (c.cap === 2 || i < detailCities)) drawCity(`d:${sel}:${c.name}:${i}`, c.name, c.x * k + tx, c.y * k + ty, c.w, c.cap);
      };
      A.cities.forEach((c, i) => { if (c.cap === 2 || i < 8) city(i); });
      A.states.forEach((t, i) => { if (t.size * k >= t.w * 0.75) drawState(`s:${sel}:${i}`, t.text, t.x * k + tx, t.y * k + ty, t.w); });
      A.cities.forEach((c, i) => { if (c.cap !== 2 && i >= 8) city(i); });
    }
    s.natHits = [];
    // Physical features: the great ranges claim space before minor cities, the rest after.
    const N = s.natAlpha > 0.5 ? s.nat : null;
    const setLS = (v: string) => { if (supportsLS) (ctx as unknown as { letterSpacing: string }).letterSpacing = v; };
    const great = (L: NatCache['labels'][number]) => L.kind === 'range' && L.rank <= 1;
    const groups = new Set<string>();
    if (N) for (const L of N.labels) if (great(L)) placeNature(L);

    for (const L of C.cityLabels) if (!(L.cap && L.iso === sel)) placeBaseCity(L);

    function placeBaseCity(L: FlatCache['cityLabels'][number]) {
      if (L.rank > maxRank || (detailOn && L.iso === sel)) return;
      const x = L.x * k + tx, y = L.y * k + ty;
      if (x < 0 || x > s.W || y < 0 || y > s.H) return;
      const box = [x - 5, y - 8, x + 9 + L.w, y + 8] as const;
      if (box[2] > s.W || hit(...box)) return;
      placed.push(...box);
      want.add(L.key);
      items.push({
        key: L.key, draw: (a) => {
          ctx.globalAlpha = a;
          ctx.beginPath(); ctx.arc(x, y, L.cap ? 3.5 : 2.6, 0, Math.PI * 2);
          ctx.fillStyle = L.cap ? '#fff' : '#334155'; ctx.fill();
          ctx.lineWidth = L.cap ? 2 : 1.5; ctx.strokeStyle = L.cap ? '#b45309' : '#fff'; ctx.stroke();
          if (supportsLS) (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
          ctx.font = L.cap ? '600 11.5px Inter, sans-serif' : '500 11px Inter, sans-serif';
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.strokeText(L.name, x + 7, y);
          ctx.fillStyle = L.cap ? '#0f172a' : '#1e293b'; ctx.fillText(L.name, x + 7, y);
        },
      });
    }

    if (N) for (const L of N.labels) if (!great(L)) placeNature(L);

    function placeNature(L: NatCache['labels'][number]) {
      {
        if (L.group && groups.has(L.group)) return;
        const x = L.x * k + tx, y = L.y * k + ty;
        if (x < -200 || x > s.W + 200 || y < -200 || y > s.H + 200) return;
        let w = L.w, h = 14, sp = 0;
        if (L.kind === 'range') {
          if (k < (RANGE_K[L.rank] ?? Infinity) || L.size * k < L.w * 0.9) return;
          // Classic atlas lettering: spread the name along the range as it grows on screen.
          const chars = L.text.length;
          sp = Math.max(1.5, Math.round((Math.min(L.size * k * 0.6, L.w + chars * 14) - L.w) / chars + 1.5));
        } else if (L.kind === 'peak') {
          if (k < (PEAK_K[L.rank] ?? Infinity)) return;
          w = L.w + (L.ew ?? 0) + 18;
        } else if (L.kind === 'lake') {
          if (k < 1.5 || L.size * k < L.w * 0.55) return;
        } else if (k < RIVER_LABEL_K[L.rank] || L.size * k < L.w * 1.4) return;
        // Footprint: one box, or for tilted text a chain of small squares along it.
        // Ranges retry with tighter letter-spacing when the spread-out name collides.
        const tries = L.kind === 'range' ? [...new Set([sp, Math.round((sp + 1.5) / 2), 1.5])] : [sp];
        let boxes: (readonly [number, number, number, number])[] = [];
        for (const t of tries) {
          if (L.kind === 'range') { sp = t; w = L.w + (sp - 1.5) * L.text.length; }
          boxes = [];
          if (L.kind === 'peak') boxes.push([x - 6, y - 8, x + w, y + 8]);
          else if (Math.abs(L.ang) > 0.1) {
            const n = Math.ceil(w / h), r = h / 2 + 2, cos = Math.cos(L.ang), sin = Math.sin(L.ang);
            for (let i = 0; i < n; i++) {
              const d = -w / 2 + h / 2 + (i * (w - h)) / Math.max(1, n - 1);
              boxes.push([x + d * cos - r, y + d * sin - r, x + d * cos + r, y + d * sin + r]);
            }
          } else boxes.push([x - w / 2 - 3, y - h / 2 - 3, x + w / 2 + 3, y + h / 2 + 3]);
          if (!boxes.some((b) => b[0] < 0 || b[2] > s.W || b[1] < 0 || b[3] > s.H || hit(...b))) break;
          boxes = [];
        }
        if (!boxes.length) return;
        for (const b of boxes) placed.push(...b);
        if (L.group) groups.add(L.group);
        {
          const [pre, ...rest] = L.key.split(':');
          const kind = ({ nv: 'river', nr: 'range', np: 'peak', nl: 'lake' } as const)[pre as 'nv'];
          const name = (pre === 'nv' || pre === 'nr' ? rest.slice(0, -1) : rest).join(':');
          if (kind) s.natHits.push({ box: [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))], kind, name });
        }
        want.add(L.key);
        items.push({
          key: L.key, draw: (a) => {
            ctx.globalAlpha = a;
            ctx.save();
            ctx.translate(x, y);
            if (L.kind === 'peak') {
              ctx.beginPath(); ctx.moveTo(0, -4.5); ctx.lineTo(4.5, 3); ctx.lineTo(-4.5, 3); ctx.closePath();
              ctx.fillStyle = '#6b4f36'; ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke(); ctx.fill();
              ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
              ctx.font = 'italic 600 10.5px Inter, sans-serif';
              ctx.lineWidth = 3; ctx.strokeText(L.text, 8, 0); ctx.fillStyle = '#5b4632'; ctx.fillText(L.text, 8, 0);
              ctx.font = '500 9.5px Inter, sans-serif';
              ctx.strokeText(L.elev!, 12 + L.w, 0.5); ctx.fillStyle = 'rgba(91,70,50,0.7)'; ctx.fillText(L.elev!, 12 + L.w, 0.5);
            } else {
              ctx.rotate(L.ang);
              ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              if (L.kind === 'range') { ctx.font = 'italic 600 10px Inter, sans-serif'; setLS(`${sp}px`); }
              else ctx.font = 'italic 500 10.5px Inter, sans-serif';
              ctx.lineWidth = 3; ctx.strokeStyle = L.kind === 'range' ? 'rgba(255,248,238,0.85)' : 'rgba(255,255,255,0.85)';
              ctx.strokeText(L.text, 0, 0);
              ctx.fillStyle = L.kind === 'range' ? 'rgba(110,76,44,0.8)' : L.kind === 'lake' ? '#1f5f9e' : '#2563a8';
              ctx.fillText(L.text, 0, 0);
              setLS('0px');
            }
            ctx.restore();
          },
        });
      }
    }

    let animating = false;
    for (const it of items) {
      const a = Math.min(1, (s.labelAlpha.get(it.key) ?? 0) + 0.18);
      s.labelAlpha.set(it.key, a);
      if (a < 1) animating = true;
      it.draw(a);
    }
    for (const [key, a] of s.labelAlpha) if (!want.has(key)) {
      const na = a - 0.3;
      if (na <= 0) s.labelAlpha.delete(key); else { s.labelAlpha.set(key, na); animating = true; }
    }
    ctx.globalAlpha = 1;
    if (supportsLS) (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
    return animating;
  }

  function flatProjection() {
    const s = st.current, t = s.transform;
    return flatProj.current.rotate([-s.lambda0, 0]).scale(s.S1 * t.k).translate([s.T1[0] * t.k + t.x, s.T1[1] * t.k + t.y]).precision(0.5);
  }

  // ── Drawing ───────────────────────────────────────────────
  function colorFor(id: string | null) {
    const p = live.current, s = st.current;
    if (p.feedback && id === p.feedback.cca3) return p.feedback.kind === 'good' ? '#34d399' : p.feedback.kind === 'bad' ? '#f87171' : '#fbbf24';
    if (!p.quiz && id && id === p.selected) return '#fbbf24';
    if (id && p.highlighted.includes(id)) return '#60a5fa';
    const base = (id && POLITICAL_COLOR.get(id)) || '#e7e5e4';
    return id && id === s.hover ? shade(base, -0.12) : base;
  }

  function draw(proj: GeoProjection, detailed: boolean, labels: boolean, morphing?: MorphProj) {
    const s = st.current, c = canvas.current;
    if (!c) return false;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    ctx.clearRect(0, 0, s.W, s.H);
    const path = geoPath(proj, ctx);

    // Ocean with soft drop shadow
    const [tx, ty] = proj.translate();
    const sc = proj.scale();
    const g = ctx.createRadialGradient(tx - sc * 0.3, ty - sc * 0.4, sc * 0.1, tx, ty, sc * 3);
    g.addColorStop(0, '#c4def2');
    g.addColorStop(1, '#8dbbe0');
    const outline = () => { if (morphing) traceOutline(ctx, morphing); else { ctx.beginPath(); path(SPHERE); } };
    ctx.save();
    outline();
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18;
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();

    ctx.beginPath(); path(GRATICULE);
    ctx.strokeStyle = 'rgba(255,255,255,0.38)'; ctx.lineWidth = 0.6; ctx.stroke();

    const feats = detailed ? FEATURES : FEATURES_110;
    ctx.lineJoin = 'round';
    for (const f of feats) {
      ctx.beginPath(); path(f as unknown as GeoJSON.Feature);
      ctx.fillStyle = colorFor(f.properties.cca3); ctx.fill();
    }
    ctx.beginPath();
    for (const f of feats) path(f as unknown as GeoJSON.Feature);
    ctx.strokeStyle = 'rgba(71,85,105,0.5)'; ctx.lineWidth = 0.6; ctx.stroke();

    const sel = live.current.selected;
    if (sel && !live.current.quiz) {
      ctx.beginPath();
      for (const f of feats) if (f.properties.cca3 === sel) path(f as unknown as GeoJSON.Feature);
      ctx.strokeStyle = 'rgba(146,64,14,0.95)'; ctx.lineWidth = 1.4; ctx.stroke();
    }

    outline();
    ctx.strokeStyle = 'rgba(30,58,95,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();

    return labels && !live.current.quiz ? drawLabels(ctx, proj) : false;
  }

  // Collision-aware labels with per-label fade. Returns true while fades are running.
  function drawLabels(ctx: CanvasRenderingContext2D, proj: GeoProjection) {
    const s = st.current, k = s.transform.k;
    const placed: number[] = [];
    const hit = (x0: number, y0: number, x1: number, y1: number) => {
      for (let i = 0; i < placed.length; i += 4) if (x0 < placed[i + 2] && x1 > placed[i] && y0 < placed[i + 3] && y1 > placed[i + 1]) return true;
      return false;
    };
    const items: { key: string; x: number; y: number; draw: (a: number) => void }[] = [];
    const want = new Set<string>();
    const supportsLS = 'letterSpacing' in ctx;

    const countries = COUNTRIES.filter((c) => MAPPABLE.has(c.cca3)).sort((a, b) => b.area - a.area);
    for (const c of countries) {
      const bb = s.baseBounds.get(c.cca3);
      if (!bb) continue;
      const bw = (bb[2] - bb[0]) * k, bh = (bb[3] - bb[1]) * k;
      const px = c.area > 3e6 ? 14 : c.area > 6e5 ? 12.5 : c.area > 6e4 ? 11 : 10;
      const text = c.name.toUpperCase();
      ctx.font = `600 ${px}px "Space Grotesk", Inter, sans-serif`;
      if (supportsLS) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px * 0.14}px`;
      const w = ctx.measureText(text).width;
      if (Math.min(bw, bh) < 14 || bw < w * 0.6) continue;
      const pt = proj([c.latlng[1], c.latlng[0]]);
      if (!pt) continue;
      const [x, y] = pt;
      const box = [x - w / 2 - 5, y - px / 2 - 4, x + w / 2 + 5, y + px / 2 + 4] as const;
      if (box[0] < 0 || box[2] > s.W || box[1] < 0 || box[3] > s.H || hit(...box)) continue;
      placed.push(...box);
      want.add(c.cca3);
      items.push({
        key: c.cca3, x, y, draw: (a) => {
          ctx.font = `600 ${px}px "Space Grotesk", Inter, sans-serif`;
          if (supportsLS) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px * 0.14}px`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.globalAlpha = a;
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,250,240,0.85)'; ctx.strokeText(text, x, y);
          ctx.fillStyle = '#3b2f2a'; ctx.fillText(text, x, y);
        },
      });
    }
    if (supportsLS) (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';

    const maxRank = cityMaxRank(k);
    for (const [name, lat, lng, , rank, cap] of CITIES) {
      const r = cap ? Math.min(rank, 1) : rank;
      if (r > maxRank) continue;
      const pt = proj([lng, lat]);
      if (!pt) continue;
      const [x, y] = pt;
      ctx.font = cap ? '600 11.5px Inter, sans-serif' : '500 11px Inter, sans-serif';
      const w = ctx.measureText(name).width;
      const box = [x - 5, y - 8, x + 9 + w, y + 8] as const;
      if (box[0] < 0 || box[2] > s.W || box[1] < 0 || box[3] > s.H || hit(...box)) continue;
      placed.push(...box);
      const key = `c:${name}:${lat}`;
      want.add(key);
      items.push({
        key, x, y, draw: (a) => {
          ctx.globalAlpha = a;
          ctx.beginPath(); ctx.arc(x, y, cap ? 3.5 : 2.6, 0, Math.PI * 2);
          ctx.fillStyle = cap ? '#fff' : '#334155'; ctx.fill();
          ctx.lineWidth = cap ? 2 : 1.5; ctx.strokeStyle = cap ? '#b45309' : '#fff'; ctx.stroke();
          ctx.font = cap ? '600 11.5px Inter, sans-serif' : '500 11px Inter, sans-serif';
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.strokeText(name, x + 7, y);
          ctx.fillStyle = cap ? '#0f172a' : '#1e293b'; ctx.fillText(name, x + 7, y);
        },
      });
    }

    let animating = false;
    for (const it of items) {
      const a = Math.min(1, (s.labelAlpha.get(it.key) ?? 0) + 0.14);
      s.labelAlpha.set(it.key, a);
      if (a < 1) animating = true;
      it.draw(a);
    }
    for (const [key, a] of s.labelAlpha) if (!want.has(key)) {
      const na = a - 0.25;
      if (na <= 0) s.labelAlpha.delete(key); else { s.labelAlpha.set(key, na); animating = true; }
    }
    ctx.globalAlpha = 1;
    return animating;
  }

  function scheduleDraw() {
    const s = st.current;
    if (s.phase !== 'flat' || s.raf) return;
    s.raf = requestAnimationFrame(() => {
      s.raf = 0;
      if (drawFlat()) scheduleDraw();
    });
  }

  // ── Morph timeline ────────────────────────────────────────
  // Interpolates globe-shaped params (ortho) ↔ atlas params (Natural Earth).
  function runMorph(opts: {
    fromM: number; toM: number; duration: number;
    rot0: [number, number]; rot1: [number, number];
    s0: number; s1: number; t0: [number, number]; t1: [number, number];
  }) {
    return new Promise<void>((resolve) => {
      const s = st.current, p = morph.current;
      s.phase = 'morph';
      const start = performance.now();
      const dRot = ((((opts.rot1[0] - opts.rot0[0]) % 360) + 540) % 360) - 180;
      const step = (now: number) => {
        const T = Math.min(1, (now - start) / opts.duration);
        const e = easeInOut(T);
        p.morph(lerp(opts.fromM, opts.toM, e))
          .rotate([opts.rot0[0] + dRot * e, lerp(opts.rot0[1], opts.rot1[1], e)])
          .scale(lerpLog(opts.s0, opts.s1, e))
          .translate([lerp(opts.t0[0], opts.t1[0], e), lerp(opts.t0[1], opts.t1[1], e)]);
        draw(p, false, false, p);
        if (T < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  // ── Setup: canvas, morph-in, zoom ─────────────────────────
  useEffect(() => {
    const s = st.current, c = canvas.current!;
    const size = () => {
      s.W = window.innerWidth; s.H = window.innerHeight;
      c.width = s.W * s.dpr; c.height = s.H * s.dpr;
      c.style.width = `${s.W}px`; c.style.height = `${s.H}px`;
    };
    size();
    // Only the fit now, so the morph's first frame paints right after the click; the
    // heavy caches are built once the morph has landed (a pause on a still frame is invisible).
    fitBase();

    const f = live.current.from;
    let cancelled = false;
    runMorph({
      fromM: 0, toM: 2, duration: 1900,
      rot0: [-f.lng, -f.lat], rot1: [-s.lambda0, 0],
      s0: f.r, s1: s.S1, t0: [f.cx, f.cy], t1: s.T1,
    }).then(() => {
      if (cancelled) return;
      computeBase();
      s.phase = 'flat';
      scheduleDraw();
      const p = s.pending; s.pending = null; p?.(); // a focus/fit requested mid-morph
      live.current.onReady();
    });

    // Pan/zoom
    const sel = select(c);
    const zb = d3zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([1, 60])
      .translateExtent([[-s.W * 0.25, -s.H * 0.25], [s.W * 1.25, s.H * 1.25]])
      .filter((e: Event) => st.current.phase === 'flat' && e.type !== 'wheel' && !(e as MouseEvent).button)
      .on('start', (e) => {
        if (e.sourceEvent) { live.current.onInteract(); cursor.set({ dragging: e.sourceEvent.type !== 'dblclick' }); }
      })
      .on('zoom', (e) => {
        s.transform = e.transform;
        // Skip the expensive drop shadow while moving; restore it once idle.
        s.interacting = true;
        window.clearTimeout(s.idle);
        s.idle = window.setTimeout(() => { s.interacting = false; scheduleDraw(); }, 140);
        scheduleDraw();
      })
      .on('end', () => cursor.set({ dragging: false }));
    s.zoomB = zb;
    sel.call(zb).on('dblclick.zoom', null);

    // Smooth wheel / pinch zoom toward the pointer: ease the scale every frame
    // (continuous, like the globe) instead of chaining 280ms transitions.
    let targetK: number | null = null;
    let anchor: [number, number] = [0, 0];
    let wraf = 0;
    const stepZoom = () => {
      if (targetK === null) { wraf = 0; return; }
      const k = s.transform.k;
      const next = k * Math.pow(targetK / k, 0.22);
      zb.scaleTo(sel, next, anchor);
      if (Math.abs(Math.log(targetK / next)) < 0.002) { zb.scaleTo(sel, targetK, anchor); targetK = null; wraf = 0; return; }
      wraf = requestAnimationFrame(stepZoom);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (s.phase !== 'flat') return;
      live.current.onInteract();
      sel.interrupt('focus');
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const base = targetK ?? s.transform.k;
      targetK = Math.min(60, Math.max(1, base * Math.exp(-delta * (e.ctrlKey ? 0.012 : 0.0022))));
      anchor = [e.offsetX, e.offsetY];
      if (!wraf) wraf = requestAnimationFrame(stepZoom);
    };
    c.addEventListener('wheel', onWheel, { passive: false });

    const onResize = () => { size(); computeBase(); if (s.phase === 'flat') scheduleDraw(); };
    window.addEventListener('resize', onResize);
    return () => {
      cancelled = true;
      c.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(wraf);
      window.clearTimeout(s.idle);
      window.removeEventListener('resize', onResize);
      sel.on('.zoom', null);
      cancelAnimationFrame(s.raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sidebar collapsed/expanded: refit the map to the new free space.
  useEffect(() => {
    const s = st.current;
    if (s.phase !== 'flat') return;
    computeBase();
    scheduleDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.leftInset]);

  // Rivers, lakes, ranges & peaks: fetched once, faded in/out with the toggle.
  useEffect(() => {
    if (props.nature === false) { scheduleDraw(); return; }
    let live2 = true;
    void loadNature().then((d) => { if (live2 && d) { st.current.nature = d; scheduleDraw(); } });
    return () => { live2 = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.nature]);

  // State / province lines for the selected country (projected once, like the rest).
  useEffect(() => {
    const id = props.quiz ? null : props.selected;
    const s = st.current;
    if (!id) { s.admin = null; return; }
    let cancelled = false;
    void loadAdmin(id).then((d) => {
      if (cancelled || !d) return;
      s.admin = { id, lines: d.lines, states: d.states, cities: d.cities, path: null, pts: null, key: '' }; // projected lazily in drawFlat
      scheduleDraw();
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.selected, props.quiz]);

  // Redraw on state changes (selection, highlights, quiz feedback)
  useEffect(() => { scheduleDraw(); });

  // ── Hover / click ─────────────────────────────────────────
  function geoAt(x: number, y: number) {
    const proj = flatProjection();
    const g = proj.invert?.([x, y]);
    if (!g || !isFinite(g[0]) || !isFinite(g[1])) return null;
    const back = proj(g);
    if (!back || Math.hypot(back[0] - x, back[1] - y) > 1) return null; // outside the map outline
    return { lng: g[0], lat: g[1] };
  }

  const press = useRef<{ x: number; y: number; t: number } | null>(null);
  const prefetchT = useRef(0);
  const onPointerMove = (e: React.PointerEvent) => {
    const s = st.current;
    if (s.phase !== 'flat' || e.buttons) return;
    const g = geoAt(e.clientX, e.clientY);
    const id = g ? countryAt(g.lat, g.lng) : null;
    if (id !== s.hover) {
      s.hover = id;
      window.clearTimeout(prefetchT.current);
      if (id && !live.current.quiz) prefetchT.current = window.setTimeout(() => prefetchCountry(id, BY_CCA3.get(id)?.cca2), 120); // warm the click
      const c = id ? BY_CCA3.get(id) : undefined;
      cursor.set({ country: c ? { name: c.name, cca2: c.cca2, sub: `${c.capital[0] ?? '—'} · ${fmtCompact(c.population)}` } : null });
      scheduleDraw();
    }
    // Over a feature name or right on a river line: say what a click will open.
    if (live.current.quiz || live.current.nature === false) return;
    const label = s.natHits.find((h) => e.clientX >= h.box[0] && e.clientX <= h.box[2] && e.clientY >= h.box[1] && e.clientY <= h.box[3]);
    const kindText = { river: 'River', range: 'Mountain range', peak: 'Peak', lake: 'Lake' } as const;
    const glyph = { river: '〰', range: '⛰', peak: '▲', lake: '〰' } as const;
    if (label) { cursor.set({ country: { name: displayName(label), cca2: '', glyph: glyph[label.kind], sub: `${kindText[label.kind]} · click for details` } }); s.hover = null; return; }
    if (g) {
      const perDeg = (s.S1 * s.transform.k * Math.PI) / 180;
      void riverNear(g.lat, g.lng, 7 / perDeg).then((r) => {
        if (r) { cursor.set({ country: { name: displayName({ kind: 'river', name: r.n }), cca2: '', glyph: '〰', sub: 'River · click for details' } }); s.hover = null; }
      });
    }
  };
  const onPointerLeave = () => { st.current.hover = null; cursor.set({ country: null }); scheduleDraw(); };
  const onPointerDown = (e: React.PointerEvent) => { press.current = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  const onPointerUp = (e: React.PointerEvent) => {
    const p = press.current;
    press.current = null;
    if (!p || st.current.phase !== 'flat') return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6 || performance.now() - p.t > 600) return;
    const g = geoAt(e.clientX, e.clientY);
    const id = g ? countryAt(g.lat, g.lng) : null;
    live.current.onInteract();
    const choose = () => { if (id) live.current.onSelect(id); else if (!live.current.quiz) live.current.onSelect(null); };
    const L = live.current, s = st.current;
    if (!L.quiz && L.onFeature && L.nature !== false) {
      // A river / range / peak / lake name?
      const hit = s.natHits.find((h) => e.clientX >= h.box[0] && e.clientX <= h.box[2] && e.clientY >= h.box[1] && e.clientY <= h.box[3]);
      if (hit) { L.onFeature({ kind: hit.kind, name: hit.name }); return; }
      // Right on a river line?
      if (g) {
        const perDeg = (s.S1 * s.transform.k * Math.PI) / 180;
        void riverNear(g.lat, g.lng, 7 / perDeg).then((r) => (r ? L.onFeature!({ kind: 'river', name: r.id }) : choose()));
        return;
      }
    }
    choose();
  };

  // ── Camera helpers ────────────────────────────────────────
  /** Screen area not covered by chrome. `withPanel` frames for the info panel that is about to open. */
  function visibleBox(withPanel = false) {
    const s = st.current, wide = s.W > 900, panel = withPanel || live.current.panelOpen;
    const li = live.current.leftInset;
    if (panel && wide) return { x0: li + 30, y0: 40, x1: s.W - 420 - 30, y1: s.H - 30 };
    if (panel && !wide) return { x0: 10, y0: 60, x1: s.W - 10, y1: s.H * 0.44 };
    return { x0: li + 30, y0: 40, x1: s.W - 30, y1: s.H - 30 };
  }

  function zoomToBounds(b: [number, number, number, number], maxK = 10, withPanel = false) {
    const s = st.current;
    if (!s.zoomB || !canvas.current) return;
    const v = visibleBox(withPanel);
    const vw = v.x1 - v.x0, vh = v.y1 - v.y0;
    const k = Math.max(1, Math.min(maxK, 0.6 / Math.max((b[2] - b[0]) / vw, (b[3] - b[1]) / vh)));
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    const t = zoomIdentity.translate((v.x0 + v.x1) / 2 - k * cx, (v.y0 + v.y1) / 2 - k * cy).scale(k);
    select(canvas.current).transition('focus').duration(800).ease(easeCubicInOut).call(s.zoomB.transform, t);
  }

  useImperativeHandle(ref, () => ({
    focus(cca3) {
      const s = st.current;
      if (s.phase !== 'flat') { s.pending = () => this.focus(cca3); return; } // still morphing in
      const c = BY_CCA3.get(cca3);
      // A country near the map's edge is split in two by the seam: re-centre the
      // atlas on it first (fresh projection), then zoom in.
      if (c && Math.abs(((c.latlng[1] - s.lambda0 + 540) % 360) - 180) > 120 && canvas.current && s.zoomB) {
        s.lambda0 = c.latlng[1];
        computeBase();
        s.labelAlpha.clear();
        select(canvas.current).interrupt('focus').call(s.zoomB.transform, zoomIdentity);
      }
      const b = s.baseBounds.get(cca3);
      // Focusing selects the country, so its panel is opening: frame beside it.
      if (b) zoomToBounds(b, 10, !live.current.quiz);
    },
    fitGeo(bbox) {
      const s = st.current;
      if (s.phase !== 'flat') { s.pending = () => this.fitGeo(bbox); return; }
      const [w, so, e, n] = bbox;
      const proj = geoNaturalEarth1().rotate([-s.lambda0, 0]).scale(s.S1).translate(s.T1);
      const ring: [number, number][] = [];
      for (let i = 0; i <= 8; i++) ring.push([w + ((e - w) * i) / 8, so], [w + ((e - w) * i) / 8, n]);
      const pts = ring.map((p) => proj(p)).filter(Boolean) as [number, number][];
      if (!pts.length) return;
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      zoomToBounds([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], 12, true);
    },
    fit(codes) {
      if (st.current.phase !== 'flat') { st.current.pending = () => this.fit(codes); return; }
      const bs = codes.map((c) => st.current.baseBounds.get(c)).filter(Boolean) as [number, number, number, number][];
      if (!bs.length) return;
      zoomToBounds([Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))], 8);
    },
    reset() {
      const s = st.current;
      if (s.zoomB && canvas.current) select(canvas.current).transition('focus').duration(900).ease(easeCubicInOut).call(s.zoomB.transform, zoomIdentity);
    },
    centerGeo() {
      const s = st.current, v = visibleBox();
      const g = flatProjection().invert?.([(v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2]) ?? [s.lambda0, 0];
      return { lng: g[0], lat: g[1] };
    },
    async morphOut(to) {
      const s = st.current, t = s.transform;
      if (canvas.current) select(canvas.current).interrupt('focus').interrupt('wheel');
      s.labelAlpha.clear();
      cursor.set({ country: null });
      await runMorph({
        fromM: 2, toM: 0, duration: 1700,
        rot0: [-s.lambda0, 0], rot1: [-to.lng, -to.lat],
        s0: s.S1 * t.k, s1: to.r,
        t0: [s.T1[0] * t.k + t.x, s.T1[1] * t.k + t.y], t1: [to.cx, to.cy],
      });
    },
  }));

  return (
    <div className={`atlas ${props.fadeIn ? 'fade-in' : ''}`}>
      <canvas
        ref={canvas}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      />
    </div>
  );
});

