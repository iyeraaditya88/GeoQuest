// Walking a voyage's route: where the ship is after sailing a distance, which way it's heading,
// and the line it has drawn so far. Shared by the globe and the cinema map. Points are [lat, lng];
// distances are in radians of the Earth (× 6371 for km).
import { geoDistance, geoInterpolate } from 'd3-geo';
import type { LL } from './battles';

export interface Route {
  ll: [number, number][];  // the route as [lng, lat], longitudes unwrapped (no jump at the date line)
  cum: number[];           // distance to each point
  total: number;
  at: number[];            // distance to each stop
}

const near = (lng: number, ref: number) => lng + 360 * Math.round((ref - lng) / 360);
export const KM = 6371;

export function makeRoute(points: LL[], stopAt: number[]): Route {
  const ll: [number, number][] = [];
  for (const [la, lo] of points) ll.push([ll.length ? near(lo, ll[ll.length - 1][0]) : lo, la]);
  const cum = [0];
  for (let i = 1; i < ll.length; i++) cum.push(cum[i - 1] + geoDistance(ll[i - 1], ll[i]));
  return { ll, cum, total: cum[cum.length - 1], at: stopAt.map((i) => cum[Math.min(i, cum.length - 1)]) };
}

function seg(r: Route, d: number) {
  let j = 0;
  while (j < r.cum.length - 2 && r.cum[j + 1] < d) j++;
  return j;
}

/** Where the ship is after sailing `d`: [lat, lng] (lng unwrapped, like the route). */
export function routeAt(r: Route, d: number): LL {
  if (r.ll.length < 2) return [r.ll[0]?.[1] ?? 0, r.ll[0]?.[0] ?? 0];
  const j = seg(r, d);
  const len = r.cum[j + 1] - r.cum[j];
  const [lo, la] = len > 0 ? geoInterpolate(r.ll[j], r.ll[j + 1])(Math.min(1, Math.max(0, (d - r.cum[j]) / len))) : r.ll[j];
  return [la, near(lo, r.ll[j][0])];
}

/** Which way the ship is heading at `d`, in degrees clockwise from north. */
export function routeHeading(r: Route, d: number): number {
  const a = routeAt(r, Math.max(0, Math.min(r.total - 0.003, d)));
  const b = routeAt(r, Math.max(0.003, Math.min(r.total, d + 0.003)));
  const φ1 = (a[0] * Math.PI) / 180, φ2 = (b[0] * Math.PI) / 180, Δλ = ((b[1] - a[1]) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2), x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * The route from `d0` to `d1` as a [lng, lat] line for the map, following the great circle
 * (a point at least every `step` radians, ~1.1° by default, so long crossings curve properly).
 */
export function routeLine(r: Route, d0: number, d1: number, step = 0.02): [number, number][] {
  const out: [number, number][] = [];
  if (d1 <= d0 || r.ll.length < 2) return out;
  const push = (p: LL) => out.push([p[1], p[0]]);
  push(routeAt(r, d0));
  for (let j = seg(r, d0); j < r.ll.length - 1 && r.cum[j] < d1; j++) {
    const a = Math.max(d0, r.cum[j]), b = Math.min(d1, r.cum[j + 1]);
    for (let d = a + step; d < b; d += step) push(routeAt(r, d));
    if (r.cum[j + 1] <= d1) push([r.ll[j + 1][1], r.ll[j + 1][0]]);
  }
  push(routeAt(r, d1));
  return out;
}

/** The ship (a voyage) and the plane (the mystery's flights), drawn over the map and turned to their heading. */
export const SHIP_SVG = `<div class="ss-turn"><div class="ss-bob"><svg viewBox="0 0 48 56" aria-hidden="true">
  <path class="ss-wake" d="M20 42 C 17 48, 13 52, 9 55 M28 42 C 31 48, 35 52, 39 55"/>
  <path class="ss-hull" d="M24 4 C 32 13, 33 29, 29 44 L19 44 C 15 29, 16 13, 24 4 Z"/>
  <path class="ss-deck" d="M24 10 C 28 17, 29 28, 27 40 L21 40 C 19 28, 20 17, 24 10 Z"/>
  <path class="ss-sail" d="M11 19 Q 24 27 37 19"/><path class="ss-sail" d="M14 31 Q 24 37 34 31"/>
  <circle class="ss-mast" cx="24" cy="22" r="1.8"/><circle class="ss-mast" cx="24" cy="33" r="1.6"/>
</svg></div></div>`;
export const PLANE_SVG = `<div class="ss-turn"><div class="sp-body"><svg viewBox="0 0 48 56" aria-hidden="true">
  <path class="sp-trail" d="M24 44 L24 56"/>
  <path class="sp-wing" d="M24 16 L45 31 L45 35 L24 28 L3 35 L3 31 Z"/>
  <path class="sp-wing" d="M24 40 L33 46 L33 48 L24 45 L15 48 L15 46 Z"/>
  <path class="sp-hull" d="M24 3 C 27 3, 28 8, 28 14 L28 40 C 28 44, 26 47, 24 47 C 22 47, 20 44, 20 40 L20 14 C 20 8, 21 3, 24 3 Z"/>
  <circle class="sp-glass" cx="24" cy="9" r="2"/>
</svg></div></div>`;
