// Geometry for the cinema map (the tilted, History Mapped Out-style view of wars and battles):
// filled arrows that bend and grow, curved "spines" for big spaced-out labels, and the camera's zoom.
// Points are [lat, lng] like the rest of the app; what goes to the map is GeoJSON [lng, lat].
import type { LL } from '../battles';

const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LNG = 111_320;
const EARTH_M = 40_075_016;

/** A flat, local frame in metres around a point: good enough for one arrow or one country. */
function frame(lat0: number, lng0: number) {
  const k = Math.cos((lat0 * Math.PI) / 180) || 1e-6;
  return {
    to: (lat: number, lng: number): [number, number] => [(lng - lng0) * M_PER_DEG_LNG * k, (lat - lat0) * M_PER_DEG_LAT],
    from: (x: number, y: number): [number, number] => [lng0 + x / (M_PER_DEG_LNG * k), lat0 + y / M_PER_DEG_LAT], // → [lng, lat]
  };
}
/** The same longitude, moved within 180° of `ref` (an arrow across the date line stays short). */
const near = (lng: number, ref: number) => lng + 360 * Math.round((ref - lng) / 360);

// ── Arrows ──

export interface ArrowSpec { from: LL; to: LL; width: number /* metres */; bend?: number; progress?: number }

/**
 * A bold arrow as one polygon ([lng, lat] ring): a body that bends to one side and thickens
 * towards a broad head. `progress` (0–1) draws it partway, head first at the leading end, so
 * an arrow can grow across the map.
 */
export function arrowPolygon({ from, to, width: W, bend = 0.16, progress = 1 }: ArrowSpec): [number, number][] {
  const p = Math.max(0.001, Math.min(1, progress));
  const toLng = near(to[1], from[1]);
  const f = frame((from[0] + to[0]) / 2, (from[1] + toLng) / 2);
  const [x0, y0] = f.to(from[0], from[1]), [x2, y2] = f.to(to[0], toLng);
  const dx = x2 - x0, dy = y2 - y0, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const cx = (x0 + x2) / 2 + nx * bend * len, cy = (y0 + y2) / 2 + ny * bend * len;
  const N = 40;
  // The centre line (a quadratic curve), up to how far it has grown, with distance along it.
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * p, u = 1 - t;
    pts.push([u * u * x0 + 2 * u * t * cx + t * t * x2, u * u * y0 + 2 * u * t * cy + t * t * y2]);
  }
  const dist = [0];
  for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = dist[dist.length - 1] || 1;
  // The head: long and broad, but never more than a third of what's drawn so far.
  const head = Math.min(total * 0.36, W * 2.6);
  const headW = W * 1.25;
  const base = total - head;
  const left: [number, number][] = [], right: [number, number][] = [];
  let bx = pts[0][0], by = pts[0][1], tx = 1, ty = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = Math.min(pts.length - 1, i + 1), h = Math.max(0, i - 1);
    let ux = pts[j][0] - pts[h][0], uy = pts[j][1] - pts[h][1];
    const ul = Math.hypot(ux, uy) || 1;
    ux /= ul; uy /= ul;
    if (dist[i] > base) break;
    const w = (W / 2) * (0.42 + 0.58 * (dist[i] / Math.max(base, 1))); // tapers from the tail
    left.push([pts[i][0] - uy * w, pts[i][1] + ux * w]);
    right.push([pts[i][0] + uy * w, pts[i][1] - ux * w]);
    bx = pts[i][0]; by = pts[i][1]; tx = ux; ty = uy;
  }
  const tip = pts[pts.length - 1];
  const ring: [number, number][] = [
    ...left,
    [bx - ty * (W / 2), by + tx * (W / 2)],
    [bx - ty * headW, by + tx * headW],
    tip,
    [bx + ty * headW, by - tx * headW],
    [bx + ty * (W / 2), by - tx * (W / 2)],
    ...right.reverse(),
  ];
  ring.push(ring[0]);
  return ring.map(([x, y]) => f.from(x, y));
}

// ── Label spines ──

/**
 * Where a big name goes: a gentle arc along a shape's long axis (its principal axis), about
 * three-quarters of the way across. `ring` is [lng, lat]; the spine comes back as [lng, lat] too.
 */
export function spineFor(ring: GeoJSON.Position[], reach = 0.9): [number, number][] {
  let lat0 = 0, lng0 = 0;
  for (const [x, y] of ring) { lng0 += x; lat0 += y; }
  lng0 /= ring.length; lat0 /= ring.length;
  const f = frame(lat0, lng0);
  const xy = ring.map(([x, y]) => f.to(y, x));
  let mx = 0, my = 0;
  for (const [x, y] of xy) { mx += x; my += y; }
  mx /= xy.length; my /= xy.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of xy) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
  // The long axis, kept within 50° of horizontal so text never stands on end.
  let ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const lim = (50 * Math.PI) / 180;
  ang = Math.max(-lim, Math.min(lim, ang));
  const ux = Math.cos(ang), uy = Math.sin(ang);
  let lo = Infinity, hi = -Infinity;
  for (const [x, y] of xy) { const s = (x - mx) * ux + (y - my) * uy; if (s < lo) lo = s; if (s > hi) hi = s; }
  const half = ((hi - lo) / 2) * reach, mid = (hi + lo) / 2;
  const ox = mx + ux * mid, oy = my + uy * mid;
  const sag = half * 0.12; // a slight upward arc, like a hand-lettered map
  const out: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const s = -half + (2 * half * i) / 12;
    const bow = sag * (1 - (s / half) ** 2);
    out.push(f.from(ox + ux * s - uy * bow, oy + uy * s + ux * bow));
  }
  return out;
}

/** Length of a [lng, lat] line in metres. */
export function lineMetres(line: [number, number][]) {
  let m = 0;
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1], [x1, y1] = line[i];
    const k = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
    m += Math.hypot((x1 - x0) * M_PER_DEG_LNG * k, (y1 - y0) * M_PER_DEG_LAT);
  }
  return m;
}

/**
 * Text size for a label laid along a spine, as a size at zoom 0 (it doubles with each zoom level):
 * the letters, widely spaced, fill about two-thirds of the spine.
 */
export function labelSizeAtZoom0(spine: [number, number][], chars: number, spacing = 0.32) {
  const lat = spine[Math.floor(spine.length / 2)][1];
  const px0 = (lineMetres(spine) * 512) / (EARTH_M * Math.cos((lat * Math.PI) / 180));
  return (0.62 * px0) / (Math.max(3, chars) * (0.8 + spacing)); // (with room to spare: a name that overruns its path isn’t drawn at all)
}

/** Metres across one screen pixel at a zoom (and latitude). */
export const metresPerPixel = (zoom: number, lat: number) => (EARTH_M * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);

/** The globe's camera height (in Earth radii) as a map zoom: similar framing, a little closer for the tilt. */
export const zoomForAltitude = (alt: number, narrow: boolean) => Math.max(1.4, Math.min(9, 5.15 - 1.85 * Math.log2(Math.max(0.05, alt)) - (narrow ? 0.7 : 0)));
