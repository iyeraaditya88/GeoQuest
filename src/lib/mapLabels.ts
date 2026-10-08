// Collision-aware country + city labels drawn as a DOM overlay on the globe.
// Runs in its own rAF loop and only recomputes when the camera moves, touching the
// DOM imperatively (no React renders) so dragging stays at full frame rate.
import type { GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import { COUNTRIES, MAPPABLE } from './data';
import { insideTest, rangeSpots, riverTier, type Nature } from './nature';
import type { AdminData } from './globeOverlays';
import { displayName } from './features';
import citiesRaw from '../data/cities.json';
import { escapeHtml } from './html';

type City = [name: string, lat: number, lng: number, pop: number, rank: number, capital: 0 | 1, iso3: string];

interface Label {
  kind: 'country' | 'city' | 'state' | 'river' | 'lake' | 'range' | 'peak';
  iso?: string; // countries: own code; cities: country code
  text: string;
  lat: number;
  lng: number;
  v: [number, number, number]; // unit vector on the sphere
  w: number;
  h: number;
  cls: string;
  priority: number; // lower = placed first
  extentDeg?: number; // countries & states: approx size in degrees
  rank?: number; // cities: Natural Earth scalerank (0 = most important)
  capital?: boolean;
  ghost?: boolean; // reserves space only (something else draws it, e.g. the capital pin)
  left?: boolean; // city name drawn left of its dot
  // Physical features
  b?: [lat: number, lng: number]; // a point along the feature, for the label's angle
  len?: number; // rivers & ranges: length in degrees
  w0?: number; // ranges: unspaced text width
  spacing?: number; // ranges: current letter-spacing (px)
  inSel?: boolean; // inside the selected (raised) country
  angle?: number;
  group?: string; // alternatives for one feature: only the first that fits is shown
  feature?: { kind: 'river' | 'range' | 'peak' | 'lake'; name: string }; // clickable physical feature
  detail?: boolean; // part of the selected country's interior set
  bv?: [number, number, number]; // unit vector of `b`
  el?: HTMLDivElement;
  on: boolean;
}

const measureCtx = document.createElement('canvas').getContext('2d')!;
function measure(text: string, font: string, letterSpacing = 0) {
  measureCtx.font = font;
  return measureCtx.measureText(text).width + letterSpacing * text.length;
}

const _vp = new THREE.Matrix4();
const _p = { x: 0, y: 0 }, _q = { x: 0, y: 0 };

function unit(lat: number, lng: number): [number, number, number] {
  // Same convention as three-globe's polar2Cartesian.
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((90 - lng) * Math.PI) / 180;
  return [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
}

function buildLabels(): Label[] {
  const labels: Label[] = [];
  for (const c of COUNTRIES) {
    if (!MAPPABLE.has(c.cca3) || !c.independent && c.area < 20000) continue;
    const size = c.area > 3e6 ? 'xl' : c.area > 6e5 ? 'lg' : c.area > 6e4 ? 'md' : 'sm';
    const px = { xl: 15, lg: 13, md: 11.5, sm: 10.5 }[size];
    const text = c.name.length > 22 ? c.name.replace(/ and /g, ' & ') : c.name;
    labels.push({
      kind: 'country', iso: c.cca3, text, lat: c.latlng[0], lng: c.latlng[1], v: unit(c.latlng[0], c.latlng[1]),
      w: measure(text.toUpperCase(), `600 ${px}px "Space Grotesk"`, px * 0.14) + 4, h: px + 4,
      cls: `ml ml-country s-${size}`, priority: -c.area, extentDeg: Math.sqrt(c.area) / 111, on: false,
    });
  }
  for (const [name, lat, lng, pop, rank, cap, iso] of citiesRaw as City[]) {
    const effRank = cap ? Math.min(rank, 2) : rank;
    const font = cap ? '600 11.5px Inter' : '500 11px Inter';
    labels.push({
      kind: 'city', iso, text: name, lat, lng, v: unit(lat, lng), w: measure(name, font) + 12, h: 15,
      cls: `ml ml-city${cap ? ' cap' : ''}`, priority: 1e9 + effRank * 1e9 - pop, rank: effRank, capital: !!cap, on: false,
    });
  }
  return labels.sort((a, b) => a.priority - b.priority);
}

const esc = escapeHtml;

/**
 * Labels for the selected country's interior: states/provinces and its main cities.
 * Priorities sit between country labels (negative) and world cities (≥ 1e9), and
 * interleave so the capital and biggest cities claim space before region names.
 */
function buildDetail(d: AdminData): Label[] {
  const out: Label[] = [];
  d.cities.forEach(([name, lat, lng, , cap], i) => {
    const font = cap === 2 ? '600 11.5px Inter' : cap === 1 ? '600 11px Inter' : '500 11px Inter';
    out.push({
      kind: 'city', text: name, lat, lng, v: unit(lat, lng), w: measure(name, font) + 12, h: 15,
      cls: `ml ml-city detail${cap === 2 ? ' cap' : cap === 1 ? ' adm' : ''}`, detail: true,
      priority: cap === 2 ? 1 : i < 8 ? 2 + i : 1000 + i, rank: i, capital: cap === 2, on: false,
      ghost: cap === 2, // where the globe shows its capital pin, just reserve the pin's space
    });
  });
  d.states.forEach(([name, lat, lng, area], i) => {
    const text = name.toUpperCase();
    out.push({
      kind: 'state', text: name, lat, lng, v: unit(lat, lng),
      w: measure(text, '500 10px "Space Grotesk"', 10 * 0.16) + 4, h: 14, cls: 'ml ml-state', detail: true,
      priority: 100 + i, extentDeg: Math.sqrt(area * Math.cos((lat * Math.PI) / 180)), on: false,
    });
  });
  return out;
}

/** Labels for rivers, lakes, ranges and peaks — they slot in after the important cities. */
function buildNature(d: Nature): Label[] {
  const out: Label[] = [];
  const seen = new Set<string>();
  const once = (k: string) => (seen.has(k) ? false : (seen.add(k), true));
  for (const r of d.ranges) {
    const rid = r.id ?? r.n; // same-named ranges in different places have their own ids
    if (!once(`r:${rid}`)) continue;
    const text = r.n.toUpperCase();
    const w0 = measure(text, 'italic 600 10px Inter', 1.5);
    rangeSpots(r).forEach(([a, b], i) => out.push({
      kind: 'range', text, lat: a[1], lng: a[0], v: unit(a[1], a[0]), b: [b[1], b[0]], len: r.len, group: `r:${rid}`,
      w: w0, w0, h: 14, cls: 'ml ml-range clickable', feature: { kind: 'range', name: rid }, priority: (r.r <= 1 ? 0.95e9 : (r.r + 1) * 1e9 + 5e8) - r.len * 1e6 + i, rank: r.r, on: false, // great ranges before minor cities
    }));
  }
  for (const p of d.peaks) {
    if (!once(`p:${p.n}`)) continue;
    const elev = `${p.e.toLocaleString()} m`;
    out.push({
      kind: 'peak', text: p.n, lat: p.a[1], lng: p.a[0], v: unit(p.a[1], p.a[0]),
      w: measure(p.n, 'italic 600 10.5px Inter') + measure(elev, '500 9.5px Inter') + 22, h: 15,
      cls: 'ml ml-peak clickable', feature: { kind: 'peak', name: p.n }, // Notable peaks (≥ 3,000 m) are placed before range names, which have other spots to go to.
      priority: (p.r <= 3 ? 1.5 + p.r * 0.4 : p.r + 1.2) * 1e9 - p.e * 1e3, rank: p.r, on: false,
      extentDeg: p.e, // elevation, for the markup
    });
  }
  for (const l of d.lakes) {
    if (!l.n || !once(`l:${l.n}`)) continue;
    out.push({
      kind: 'lake', text: l.n, lat: l.l[1], lng: l.l[0], v: unit(l.l[1], l.l[0]),
      w: measure(l.n, 'italic 500 10.5px Inter') + 4, h: 14, cls: 'ml ml-lake clickable', feature: { kind: 'lake', name: l.n },
      priority: 2.2e9 - l.area * 1e8, extentDeg: Math.sqrt(l.area), on: false,
    });
  }
  for (const r of d.rivers) {
    if (!r.n || !once(`v:${r.id}`)) continue;
    const w = measure(r.n, 'italic 500 10.5px Inter') + 4;
    // Several candidate spots along the river; the first that fits wins.
    r.as.forEach(([a, b], i) => out.push({
      kind: 'river', text: r.n, lat: a[1], lng: a[0], v: unit(a[1], a[0]), b: [b[1], b[0]], len: r.len, group: `v:${r.id}`,
      w, h: 14, cls: 'ml ml-river clickable', feature: { kind: 'river', name: r.id }, priority: (r.r + 1.6) * 1e9 - r.len * 1e6 + i, rank: riverTier(r.r), on: false,
    }));
  }
  return out;
}
// Camera altitude below which each kind/rank appears (index = rank / tier).
const RANGE_ALT = [9, 2.6, 1.5, 0.9, 0.5, 0.32, 0.2];
const PEAK_ALT = [9, 1.2, 0.75, 0.48, 0.3, 0.2];
const RIVER_ALT = [2.2, 1.05, 0.5];

// Which city ranks are allowed at a given camera altitude (in globe radii).
function maxCityRank(alt: number) {
  if (alt > 2.1) return -1;
  if (alt > 1.5) return 0;
  if (alt > 1.0) return 1;
  if (alt > 0.6) return 2;
  if (alt > 0.4) return 3;
  if (alt > 0.25) return 4;
  return 6;
}

export function createLabelLayer(layer: HTMLDivElement, getGlobe: () => GlobeMethods | undefined, onFeature?: (f: { kind: 'river' | 'range' | 'peak' | 'lake'; name: string }) => void) {
  // River / range / peak / lake names are clickable (the layer itself ignores the pointer).
  const onClick = (e: MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.ml.clickable');
    if (el?.dataset.kind && el.dataset.name) onFeature?.({ kind: el.dataset.kind as 'river', name: el.dataset.name });
  };
  layer.addEventListener('click', onClick);
  let picked = '';
  const base = buildLabels();
  const capitalOf = new Map(base.filter((l) => l.kind === 'city' && l.capital).map((l) => [l.iso!, l] as const));
  let labels = base;
  let detail: { id: string; labels: Label[]; extentDeg: number } | null = null;
  let nature: Label[] = [];
  let natureOn = false;
  let enabled = false; // world labels (political style only)
  let visible = true; // the whole layer (off while the globe is hidden)
  let raf = 0;
  let lastKey = '';
  // Collision boxes in a coarse screen grid: each lookup only scans its own cells.
  const CELL = 64;
  let cols = 1, rows = 1;
  let grid: number[][] = [[]];
  const resetGrid = (W: number, H: number) => {
    const c = Math.ceil(W / CELL) + 1, r = Math.ceil(H / CELL) + 1;
    if (c !== cols || r !== rows) { cols = c; rows = r; grid = Array.from({ length: c * r }, () => []); }
    else for (const cell of grid) cell.length = 0;
  };
  const cellRange = (x0: number, y0: number, x1: number, y1: number) => [
    Math.max(0, Math.floor(x0 / CELL)), Math.max(0, Math.floor(y0 / CELL)),
    Math.min(cols - 1, Math.floor(x1 / CELL)), Math.min(rows - 1, Math.floor(y1 / CELL)),
  ];
  const place = (x0: number, y0: number, x1: number, y1: number) => {
    const [c0, r0, c1, r1] = cellRange(x0, y0, x1, y1);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) grid[r * cols + c].push(x0, y0, x1, y1);
  };

  const hit = (x0: number, y0: number, x1: number, y1: number) => {
    const [c0, r0, c1, r1] = cellRange(x0, y0, x1, y1);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const b = grid[r * cols + c];
      for (let i = 0; i < b.length; i += 4) if (x0 < b[i + 2] && x1 > b[i] && y0 < b[i + 3] && y1 > b[i + 1]) return true;
    }
    return false;
  };

  let selectedId: string | null = null;
  // Physical labels inside the raised country must sit on its cap, not the ground.
  function markSelected(id: string | null) {
    selectedId = id;
    const test = id && nature.length ? insideTest(id) : null; // bbox-prefiltered, cheap
    for (const l of nature) l.inSel = !!test && test.inside([l.lng, l.lat]);
  }
  function rebuild() {
    // The selected country's capital outranks everything — it must never lose to a label.
    const rank = (l: Label) => (l.kind === 'city' && l.capital && !l.detail && l.iso === selectedId ? -1e12 : l.priority);
    labels = [...base, ...(detail?.labels ?? []), ...nature].sort((a, b) => rank(a) - rank(b));
    lastKey = '';
  }

  function hideAll() {
    for (const l of labels) if (l.on && l.el) { l.on = false; l.el.classList.remove('on'); }
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    const g = getGlobe();
    if (!g || !visible || (!enabled && !detail && !natureOn)) return;
    const cam = g.camera().position;
    const W = layer.clientWidth, H = layer.clientHeight;
    const key = `${cam.x.toFixed(2)},${cam.y.toFixed(2)},${cam.z.toFixed(2)},${W},${H},${layer.dataset.offset ?? ''},${layer.dataset.panel ?? ''}`;
    if (key === lastKey) return;
    lastKey = key;

    const R = g.getGlobeRadius();
    const dist = cam.length();
    const alt = dist / R - 1;
    const cx = cam.x / dist, cy = cam.y / dist, cz = cam.z / dist;
    const horizon = R / dist + 0.04; // keep clear of the limb where labels squash
    const pov = g.pointOfView();
    const a = g.getScreenCoords(pov.lat, pov.lng);
    const b = g.getScreenCoords(Math.min(89, pov.lat + 1), pov.lng);
    const pxPerDeg = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const cityMax = maxCityRank(alt);
    // Visible disc of the globe on screen, so labels never spill past the rim.
    const camObj = g.camera() as unknown as { fov: number };
    const focal = H / 2 / Math.tan((camObj.fov * Math.PI) / 360);
    const discR = focal * Math.tan(Math.asin(Math.min(1, R / dist))) * 0.97;
    const inDisc = (px: number, py: number) => (px - a.x) ** 2 + (py - a.y) ** 2 < discR * discR;
    // Zoomed in on the selected country: reveal its states and main cities (more as you zoom).
    const detailPx = detail ? detail.extentDeg * pxPerDeg : 0;
    const detailOn = detailPx > 280;
    const detailCities = detailOn ? Math.min(60, Math.round((detailPx * detailPx) / 14000)) : 0;

    resetGrid(W, H);
    // World → screen with one matrix per frame (three-globe's getScreenCoords allocates per call).
    const camera = g.camera() as THREE.PerspectiveCamera;
    camera.updateMatrixWorld();
    const m = _vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
    const project = (l: { v: [number, number, number] }, lift: number, out: { x: number; y: number }) => {
      const r = R * (1 + lift), px = l.v[0] * r, py = l.v[1] * r, pz = l.v[2] * r;
      const w = m[3] * px + m[7] * py + m[11] * pz + m[15];
      out.x = ((m[0] * px + m[4] * py + m[8] * pz + m[12]) / w + 1) * W / 2;
      out.y = (1 - (m[1] * px + m[5] * py + m[9] * pz + m[13]) / w) * H / 2;
    };
    const groups = new Set<string>();
    // Keep labels out from under the info panel.
    const panelW = Number(layer.dataset.panel ?? 0);
    if (panelW) place(W - panelW - 4, -1e4, 1e5, 1e5);
    for (const l of labels) {
      let show = false;
      let x = 0, y = 0;
      const facing = l.v[0] * cx + l.v[1] * cy + l.v[2] * cz;
      const taken = !!l.group && groups.has(l.group);
      const isDetail = !!l.detail;
      let eligible: boolean;
      if (isDetail) {
        eligible = detailOn && facing > horizon && (l.kind === 'state'
          ? l.extentDeg! * pxPerDeg >= l.w * 0.75
          : l.capital || l.rank! < detailCities);
      } else if (l.kind !== 'country' && l.kind !== 'city') {
        // Physical features: reveal by importance as you zoom, and only where they fit.
        const k = l.kind;
        eligible = natureOn && facing > horizon && (
          k === 'range' ? alt < RANGE_ALT[l.rank!] && l.len! * pxPerDeg >= l.w0! * 0.9
          : k === 'peak' ? alt < PEAK_ALT[l.rank!]
          : k === 'lake' ? alt < 1.6 && l.extentDeg! * pxPerDeg >= l.w * 0.55
          : alt < RIVER_ALT[l.rank!] && l.len! * pxPerDeg >= l.w * 1.4);
      } else if (!enabled) eligible = false;
      // The detail set replaces the selected country's own name and its world-city labels.
      else if (detailOn && l.iso === detail!.id) eligible = false;
      else {
        eligible = facing > horizon && (l.kind === 'country'
          ? l.extentDeg! * pxPerDeg >= Math.max(26, l.w * 0.45)
          : l.rank! <= cityMax);
      }
      const lift = isDetail || l.inSel ? 0.045 : 0.008; // the selected country is raised
      if (eligible && !taken) {
        project(l, lift, _p);
        x = _p.x; y = _p.y;
      }
      if (eligible && !taken && x > -300 && x < W + 300 && y > -300 && y < H + 300) {
        let ang = 0;
        if (l.b) {
          // Angle along the river / range axis, kept upright.
          l.bv ??= unit(l.b[0], l.b[1]);
          project({ v: l.bv }, lift, _q);
          const t = _q;
          ang = (Math.atan2(t.y - y, t.x - x) * 180) / Math.PI;
          if (ang > 90) ang -= 180; else if (ang < -90) ang += 180;
        }
        // Ranges: classic atlas lettering spreads the name along the range as it grows on
        // screen; if the wide version collides, fall back to tighter spacing.
        let spacings = [0];
        if (l.kind === 'range') {
          const chars = l.text.length;
          const target = Math.min(l.len! * pxPerDeg * 0.6, l.w0! + chars * 14);
          const sp = Math.max(1.5, Math.round((target - l.w0!) / chars + 1.5));
          spacings = [...new Set([sp, Math.round((sp + 1.5) / 2), 1.5])];
        }
        const rad = (ang * Math.PI) / 180;
        l.angle = ang;
        for (const sp of spacings) {
          if (sp) l.w = l.w0! + (sp - 1.5) * l.text.length;
          // Axis-aligned footprint of the rotated label, for collisions.
          const fw = Math.abs(l.w * Math.cos(rad)) + Math.abs(l.h * Math.sin(rad));
          const fh = Math.abs(l.w * Math.sin(rad)) + Math.abs(l.h * Math.cos(rad));
          const pad = l.kind === 'country' ? 6 : l.kind === 'state' || l.kind === 'range' ? 4 : 3;
          const fits = (x0: number, y0: number, x1: number, y1: number) =>
            x0 > 0 && y0 > 0 && x1 < W && y1 < H && inDisc(x0, y0) && inDisc(x1, y0) && inDisc(x0, y1) && inDisc(x1, y1) && !hit(x0 - pad, y0 - pad, x1 + pad, y1 + pad);
          const y0 = y - l.h / 2, y1 = y + l.h / 2;
          let box: number[] | null = null;
          if (l.kind === 'peak') { if (fits(x - 6, y0, x + l.w, y1)) box = [x - 6, y0, x + l.w, y1]; }
          else if (l.kind !== 'city' && Math.abs(ang) > 6) {
            // Tilted text: a chain of small squares along it, not its (much bigger) bounding box.
            const n = Math.ceil(l.w / l.h), cos = Math.cos(rad), sin = Math.sin(rad), r = l.h / 2;
            const chain: number[] = [];
            for (let i = 0; i < n; i++) {
              const d = -l.w / 2 + r + (i * (l.w - l.h)) / Math.max(1, n - 1);
              const cx2 = x + d * cos, cy2 = y + d * sin;
              if (!fits(cx2 - r, cy2 - r, cx2 + r, cy2 + r)) { chain.length = 0; break; }
              chain.push(cx2 - r, cy2 - r, cx2 + r, cy2 + r);
            }
            if (chain.length) {
              for (let i = 0; i < chain.length; i += 4) place(chain[i] - pad, chain[i + 1] - pad, chain[i + 2] + pad, chain[i + 3] + pad);
              box = [];
            }
          }
          else if (l.kind !== 'city') {
            // Country names keep clear of their own capital (if it's showing at this zoom),
            // shifting a little off-centre so both fit.
            let capBox: number[] | null = null;
            const cap = l.kind === 'country' ? capitalOf.get(l.iso!) : undefined;
            if (cap && cap.rank! <= cityMax) {
              project(cap, 0.008, _q);
              capBox = [_q.x - 4, _q.y - cap.h / 2, _q.x + cap.w, _q.y + cap.h / 2];
            }
            for (const dy of l.kind === 'country' ? [0, -l.h * 1.1, l.h * 1.1] : [0]) {
              const bx = [x - fw / 2, y + dy - fh / 2, x + fw / 2, y + dy + fh / 2];
              if (capBox && bx[0] < capBox[2] && bx[2] > capBox[0] && bx[1] < capBox[3] && bx[3] > capBox[1]) continue;
              if (fits(bx[0], bx[1], bx[2], bx[3])) { box = bx; y += dy; break; }
            }
          }
          // The globe draws its own capital pin only on the non-political styles.
          else if (l.ghost && !enabled) box = [x - l.w / 2 - 8, y - 22, x + l.w / 2 + 8, y + 6];
          else if (fits(x - 4, y0, x + l.w, y1)) { box = [x - 4, y0, x + l.w, y1]; l.left = false; }
          // Right side taken (e.g. a neighbouring city): try the left of the dot.
          else if (fits(x - l.w, y0, x + 4, y1)) { box = [x - l.w, y0, x + 4, y1]; l.left = true; }
          if (box) {
            if (box.length) place(box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad);
            show = !(l.ghost && !enabled);
            if (l.group) groups.add(l.group);
            if (sp && sp !== l.spacing) { l.spacing = sp; if (l.el) l.el.style.letterSpacing = `${sp}px`; }
            break;
          }
        }
      }
      if (show) {
        if (!l.el) {
          const el = document.createElement('div');
          el.className = l.cls;
          el.innerHTML = l.kind === 'city' ? `<i></i><span>${esc(l.text)}</span>`
            : l.kind === 'peak' ? `<i></i><span>${esc(l.text)}</span><em>${l.extentDeg!.toLocaleString()} m</em>`
            : esc(l.text);
          if (l.spacing) el.style.letterSpacing = `${l.spacing}px`;
          if (l.feature) {
            el.dataset.kind = l.feature.kind; el.dataset.name = l.feature.name;
            el.title = `${displayName(l.feature)} — click for details`;
            if (`${l.feature.kind}:${l.feature.name}` === picked) el.classList.add('is-picked');
          }
          layer.appendChild(el);
          l.el = el;
        }
        if (l.kind === 'city') l.el.classList.toggle('left', !!l.left);
        l.el.style.transform = l.kind === 'peak' ? `translate3d(${x}px, ${y}px, 0) translate(-5px, -50%)`
          : l.kind !== 'city'
          ? `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)${l.angle ? ` rotate(${l.angle.toFixed(1)}deg)` : ''}`
          : l.left ? `translate3d(${x}px, ${y}px, 0) translate(calc(4px - 100%), -50%)` : `translate3d(${x}px, ${y}px, 0) translate(-4px, -50%)`;
        if (!l.on) { l.on = true; l.el.classList.add('on'); }
      } else if (l.on && l.el) {
        l.on = false;
        l.el.classList.remove('on');
      }
    }
  }

  raf = requestAnimationFrame(frame);
  return {
    /** `world`: country + world-city labels; `show`: the layer at all. */
    setEnabled(world: boolean, show = true) {
      enabled = world;
      visible = show;
      lastKey = '';
      if (!show || (!world && !detail)) hideAll();
    },
    /** Interior labels for the selected country (null clears them). */
    setDetail(id: string | null, data: AdminData | null) {
      if (detail?.id === id && (data ? detail.labels.length : true)) return;
      if (detail) for (const l of detail.labels) if (l.el) {
        const el = l.el;
        el.classList.remove('on');
        window.setTimeout(() => el.remove(), 400);
      }
      const c = id ? COUNTRIES.find((x) => x.cca3 === id) : undefined;
      detail = id && data && c ? { id, labels: buildDetail(data), extentDeg: Math.sqrt(c.area) / 111 } : null;
      markSelected(id);
      rebuild();
      if (!detail && !enabled) hideAll();
    },
    /** Rivers, lakes, ranges & peaks (pass the data once; toggle with `on`). */
    setNature(d: Nature | null, on: boolean) {
      if (d && !nature.length) { nature = buildNature(d); markSelected(selectedId); rebuild(); }
      natureOn = on && nature.length > 0;
      lastKey = '';
      if (!natureOn) for (const l of nature) if (l.on && l.el) { l.on = false; l.el.classList.remove('on'); }
    },
    /** Mark the selected feature's label (or none). */
    setPicked(f: { kind: string; name: string } | null) {
      picked = f ? `${f.kind}:${f.name}` : '';
      for (const l of nature) l.el?.classList.toggle('is-picked', !!l.feature && `${l.feature.kind}:${l.feature.name}` === picked);
    },
    destroy() {
      layer.removeEventListener('click', onClick);
      cancelAnimationFrame(raf);
      layer.innerHTML = '';
    },
  };
}
