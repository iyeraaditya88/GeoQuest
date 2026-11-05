// Routes on the globe (famous voyages, the great routes of each era). Each route's line is built once
// and kept; changing which route is highlighted only touches its material (colour, width, opacity),
// so hovering through a list never rebuilds geometry. The highlighted route's dashes flow along it.
import * as THREE from 'three';
import { geoDistance, geoInterpolate } from 'd3-geo';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

export type RouteMode = 'active' | 'faint' | 'normal' | 'arrow' | 'front';
export interface Route {
  id: string; points: [number, number][]; color: string; mode: RouteMode;
  /** Finish with an arrowhead, and draw the line along its length when it first appears (after `delay` ms). */
  arrow?: boolean; delay?: number;
}
type ToXYZ = (lat: number, lng: number, alt: number) => { x: number; y: number; z: number };

const STYLE: Record<RouteMode, { width: number; opacity: number; dashed: boolean }> = {
  active: { width: 2.6, opacity: 1, dashed: true },
  normal: { width: 1.2, opacity: 0.85, dashed: false },
  faint: { width: 1.1, opacity: 0.28, dashed: false },
  arrow: { width: 3, opacity: 1, dashed: false },
  front: { width: 3.4, opacity: 0.9, dashed: true },
};

interface Entry { line: LineSegments2; mat: LineMaterial; key: string; mode: RouteMode | null; segs: number; drawAt: number | null }
const DRAW_MS = 1000;
const calmMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createRouteLayer(scene: THREE.Scene, toXYZ: ToXYZ) {
  const group = new THREE.Group();
  group.renderOrder = 8;
  scene.add(group);
  const lines = new Map<string, Entry>();
  let raf = 0, last = 0;
  // Materials are recycled, never disposed: disposing the last one makes three.js delete the compiled
  // shader, and the next route would recompile it — a visible stall each time a panel opens.
  const pool: LineMaterial[] = [];
  const release = (e: { line: LineSegments2; mat: LineMaterial }) => { group.remove(e.line); e.line.geometry.dispose(); pool.push(e.mat); };

  const build = (r: Route) => {
    // Densify along great circles (~1°), then pairs of points for the segments.
    const pts: number[] = [];
    let prev: { x: number; y: number; z: number } | null = null;
    for (let i = 1; i < r.points.length; i++) {
      const a: [number, number] = [r.points[i - 1][1], r.points[i - 1][0]], b: [number, number] = [r.points[i][1], r.points[i][0]];
      // (A short march still gets enough points to draw smoothly.)
      const n = Math.max(r.arrow ? 16 : 1, Math.ceil((geoDistance(a, b) * 180) / Math.PI));
      const f = geoInterpolate(a, b);
      for (let k = i === 1 ? 0 : 1; k <= n; k++) {
        const [lo, la] = f(k / n);
        const p = toXYZ(la, lo, 0.004);
        if (prev) pts.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
        prev = p;
      }
    }
    const segs = pts.length / 6;
    if (r.arrow && r.points.length > 1) {
      // The arrowhead: two short strokes back from the tip, sized to the arrow (a short march, a small head).
      const [la0, lo0] = r.points[r.points.length - 2], [la1, lo1] = r.points[r.points.length - 1];
      const deg = (geoDistance([lo0, la0], [lo1, la1]) * 180) / Math.PI;
      const size = Math.min(2.4, Math.max(0.12, deg * 0.2));
      const k = Math.cos((la1 * Math.PI) / 180) || 1;
      const dy = la1 - la0, dx = (lo1 - lo0) * k, len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const tip = toXYZ(la1, lo1, 0.004);
      for (const side of [-1, 1]) {
        const bx = -ux * size + side * -uy * size * 0.55, by = -uy * size + side * ux * size * 0.55;
        const q = toXYZ(la1 + by, lo1 + bx / k, 0.004);
        pts.push(tip.x, tip.y, tip.z, q.x, q.y, q.z);
      }
    }
    const geo = new LineSegmentsGeometry().setPositions(pts);
    const mat = pool.pop() ?? new LineMaterial({ linewidth: 1.2, transparent: true, opacity: 0.85, depthWrite: false, worldUnits: false, dashSize: 2.2, gapSize: 1.1 });
    mat.color.set(r.color);
    mat.dashOffset = 0;
    mat.resolution.set(window.innerWidth, window.innerHeight);
    const line = new LineSegments2(geo, mat);
    line.computeLineDistances();
    line.renderOrder = 8;
    return { line, mat, segs };
  };

  const style = (e: { mat: LineMaterial; mode: RouteMode | null }, mode: RouteMode) => {
    if (e.mode === mode) return;
    const s = STYLE[mode];
    e.mat.linewidth = s.width;
    e.mat.opacity = s.opacity;
    if (e.mat.dashed !== s.dashed) { e.mat.dashed = s.dashed; e.mat.needsUpdate = true; }
    e.mode = mode;
  };

  // Flowing dashes on the highlighted routes (only runs while one is highlighted).
  const tick = (now: number) => {
    const dt = last ? Math.min(64, now - last) : 16;
    last = now;
    let any = false;
    for (const e of lines.values()) {
      if (e.mode === 'active' || e.mode === 'front') { e.mat.dashOffset -= dt * 0.004; any = true; }
      if (e.drawAt !== null) {
        const t = (now - e.drawAt) / DRAW_MS;
        const g = e.line.geometry as LineSegmentsGeometry;
        // Eased along the line; the arrowhead (the last two segments) appears as it arrives.
        if (t >= 1) { g.instanceCount = Infinity; e.drawAt = null; }
        else { g.instanceCount = t <= 0 ? 0 : Math.max(1, Math.round(e.segs * (1 - (1 - t) ** 2))); any = true; }
      }
    }
    raf = any ? requestAnimationFrame(tick) : 0;
    if (!any) last = 0;
  };

  const onResize = () => lines.forEach((e) => e.mat.resolution.set(window.innerWidth, window.innerHeight));
  window.addEventListener('resize', onResize);

  return {
    set(routes: Route[]) {
      const keep = new Set<string>();
      for (const r of routes) {
        const key = `${r.points.length}|${r.points[0]}|${r.points[r.points.length - 1]}|${!!r.arrow}`;
        let e = lines.get(r.id);
        if (e && e.key !== key) { release(e); lines.delete(r.id); e = undefined; }
        if (!e) {
          const b = build(r);
          e = { ...b, key, mode: null, drawAt: null };
          if (r.arrow && !calmMotion()) { (b.line.geometry as LineSegmentsGeometry).instanceCount = 0; e.drawAt = performance.now() + (r.delay ?? 0); }
          lines.set(r.id, e);
          group.add(b.line);
        }
        e.mat.color.set(r.color);
        style(e, r.mode);
        keep.add(r.id);
      }
      for (const [id, e] of lines) if (!keep.has(id)) { release(e); lines.delete(id); }
      if (!raf && [...lines.values()].some((e) => e.mode === 'active' || e.mode === 'front' || e.drawAt !== null)) raf = requestAnimationFrame(tick);
    },
    /** Compile the line shaders (solid and dashed) in the background, so the first route never stalls. */
    prewarm(renderer: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene) {
      const tmp = (['normal', 'active'] as RouteMode[]).map((mode, i) => {
        const b = build({ id: `__warm${i}`, points: [[0, 0], [0, 1]], color: '#000000', mode });
        b.mat.dashed = STYLE[mode].dashed;
        b.mat.opacity = 0; // never seen
        b.line.visible = true;
        group.add(b.line);
        return b;
      });
      const done = () => tmp.forEach((b) => release(b));
      renderer.compileAsync(group, camera, scene).then(done, done);
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      for (const e of lines.values()) { e.line.geometry.dispose(); e.mat.dispose(); }
      for (const m of pool) m.dispose();
      lines.clear();
      scene.remove(group);
    },
  };
}
