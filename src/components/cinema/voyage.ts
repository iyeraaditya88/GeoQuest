// Voyages on the cinema map: the route as a glowing line that grows behind the ship (the road ahead
// a faint dash), numbered ports that light up as the ship arrives, and a camera that follows it,
// pulling back over open ocean and leaning in near a port.
import * as maplibregl from 'maplibre-gl';
import { KM, SHIP_SVG, makeRoute, routeAt, routeHeading, routeLine, type Route } from '../../lib/sail';
import { escapeHtml } from '../../lib/html';
import { track } from './cull';
import type { LL } from '../../lib/battles';

export interface VoyageScene {
  id: string;
  color: string;
  points: LL[];        // the route, [lat, lng]
  stopAt: number[];    // each stop's index in `points`
  stops: { at: LL; name: string; dead?: boolean }[];
  active: number | null;
}
export interface CinemaSailOptions {
  from: number;
  seconds: number;     // sailing time for the whole route (pauses not included)
  pauseMs: number;     // time at each port (unless `hold` decides)
  /** Wait at a port until this settles (e.g. the narrator finishing the stop). */
  hold?: (i: number) => Promise<unknown>;
  onStop: (i: number) => void;
  onDone: () => void;
}
export interface CinemaSail { sail: (o: CinemaSailOptions) => () => void }

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
export const VOYAGE_SOURCES: Record<string, maplibregl.SourceSpecification> = {
  'vy-ahead': { type: 'geojson', data: EMPTY },
  'vy-done': { type: 'geojson', data: EMPTY, tolerance: 0.15 },
};
export const VOYAGE_LAYERS: maplibregl.LayerSpecification[] = [
  { id: 'vy-ahead', type: 'line', source: 'vy-ahead', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['get', 'c'], 'line-width': 2, 'line-dasharray': [1.2, 2.2], 'line-opacity': 0.55 } },
  { id: 'vy-glow', type: 'line', source: 'vy-done', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['get', 'c'], 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 7, 6, 14], 'line-blur': ['interpolate', ['linear'], ['zoom'], 2, 5, 6, 10], 'line-opacity': 0.55 } },
  { id: 'vy-line', type: 'line', source: 'vy-done', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['get', 'c'], 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 2.4, 6, 4] } },
];

const line = (coords: [number, number][], c: string): GeoJSON.FeatureCollection =>
  coords.length > 1 ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { c } }] } : EMPTY;
const near = (lng: number, ref: number) => lng + 360 * Math.round((ref - lng) / 360);
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const turn = (from: number, to: number) => ((to - from + 540) % 360) - 180; // the short way round, in degrees

export function createVoyage(m: maplibregl.Map, opts: { narrow: boolean; calm: () => boolean; padding: () => { left: number; bottom: number }; onPin: (id: string) => void }) {
  let scene: VoyageScene | null = null;
  let route: Route | null = null;
  let pins: { mk: maplibregl.Marker; stops: number[] }[] = [];
  let sailing: (() => void) | null = null;
  const pad = () => ({ ...opts.padding(), top: 0, right: 0 });
  const pitch = opts.narrow ? 44 : 52;
  const src = (id: string) => m.getSource(id) as maplibregl.GeoJSONSource | undefined;

  // A stop's position, its longitude kept beside the route's (no jump across the date line).
  const stopLL = (i: number): [number, number] => {
    const s = scene!.stops[i], p = route!.ll[scene!.stopAt[i]] ?? [s.at[1], s.at[0]];
    return [near(s.at[1], p[0]), s.at[0]];
  };

  function clear() {
    sailing?.();
    for (const p of pins) p.mk.remove();
    pins = [];
    src('vy-ahead')?.setData(EMPTY);
    src('vy-done')?.setData(EMPTY);
    scene = null; route = null;
  }

  function drawPins() {
    for (const p of pins) p.mk.remove();
    const v = scene!;
    const byPlace = new Map<string, number[]>(); // a voyage ending where it began: one pin
    v.stops.forEach((s, i) => { const k = s.at.join(','); byPlace.set(k, [...(byPlace.get(k) ?? []), i]); });
    pins = [...byPlace.values()].map((stops) => {
      const i = stops[0], s = v.stops[i];
      const el = document.createElement('div');
      el.className = `stop-pin cine-stop ${s.dead ? 'dead' : ''}`;
      el.style.setProperty('--c', v.color);
      el.innerHTML = `<button type="button" aria-label="${escapeHtml(s.name)}"><i>${s.dead ? '†' : i + 1}</i><span>${escapeHtml(s.name)}</span></button>`;
      el.querySelector('button')!.addEventListener('click', (e) => { e.stopPropagation(); opts.onPin(`stop:${i}`); });
      return { mk: track(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(stopLL(i)).addTo(m)), stops };
    });
  }
  function light(active: number | null) {
    for (const p of pins) p.mk.getElement().classList.toggle('on', active !== null && p.stops.includes(active));
  }

  /** The whole route at a glance, tilted a little. */
  function overview() {
    const r = route!;
    const lngs = r.ll.map((p) => p[0]), lats = r.ll.map((p) => p[1]);
    const w = Math.min(...lngs), e = Math.max(...lngs), s = Math.min(...lats), n = Math.max(...lats);
    const calm = opts.calm();
    if (e - w > 200) { // round the world: the globe itself
      m.flyTo({ center: [(w + e) / 2, clamp((s + n) / 2, -20, 30)], zoom: opts.narrow ? 1.05 : 1.45, pitch: 0, bearing: 0, padding: pad(), duration: calm ? 0 : 2400, essential: true });
      return;
    }
    const p = pad();
    // Even padding (the same room as the panel leaves, split both ways) gives the route's true centre
    // and zoom; the fly then applies the panel's padding once.
    const vy = 50 + p.bottom / 2, hx = 36 + p.left / 2;
    let center: maplibregl.LngLatLike = [(w + e) / 2, (s + n) / 2], zoom = 2;
    try {
      const cam = m.cameraForBounds([[w, s], [e, n]], { padding: { top: vy, bottom: vy, left: hx, right: hx }, maxZoom: 5.5 });
      if (cam?.center && Number.isFinite(cam.zoom)) { center = cam.center; zoom = cam.zoom!; }
    } catch { /* (the map isn't sized yet: the middle of the route will do) */ }
    m.flyTo({ center, zoom: Math.max(1, zoom), pitch: 34, bearing: 0, padding: p, duration: calm ? 0 : 2400, essential: true });
  }

  return {
    /** Show a voyage (or none): its route and ports, then frame it, or the chosen port. */
    show(v: VoyageScene | null) {
      if (!v) { if (scene) clear(); return; }
      const fresh = scene?.id !== v.id;
      const moved = !fresh && scene?.active !== v.active;
      if (fresh) {
        clear();
        scene = v;
        route = makeRoute(v.points, v.stopAt);
        src('vy-done')?.setData(line(routeLine(route, 0, route.total), v.color));
        drawPins();
      }
      scene = v;
      light(v.active);
      if (sailing) return; // the ship's voyage moves the camera
      if (fresh && v.active === null) overview();
      else if (fresh || moved) {
        if (v.active === null) overview();
        else m.flyTo({ center: stopLL(v.active), zoom: 5.4, pitch, bearing: 0, padding: pad(), duration: opts.calm() ? 0 : 1800, essential: true });
      }
    },

    /** Sail the voyage: the ship sets out from a port, the line grows behind it, the camera follows. */
    sail(o: CinemaSailOptions): () => void {
      sailing?.();
      const v = scene, r = route;
      if (!v || !r || r.ll.length < 2) return () => {};
      const calm = opts.calm();
      const speed = r.total / (o.seconds * 1000);
      const el = document.createElement('div');
      el.className = 'cine-ship';
      el.style.setProperty('--c', v.color);
      el.innerHTML = SHIP_SVG;
      const ship = track(new maplibregl.Marker({ element: el, anchor: 'center', rotationAlignment: 'map', pitchAlignment: 'map' }));
      let d = r.at[o.from] ?? 0, next = o.from + 1, holding = false, done = false, raf = 0, lastTrail = 0;
      let last = performance.now(), pauseUntil = last + 1700 + o.pauseMs;
      const followFrom = last + 1700;
      let follow = true;
      const mine = (e: { originalEvent?: unknown }) => { if (e.originalEvent) follow = false; };
      m.on('dragstart', mine); m.on('rotatestart', mine); m.on('pitchstart', mine);

      const arrive = (i: number, now: number) => {
        o.onStop(i);
        light(i);
        if (!o.hold) { pauseUntil = now + o.pauseMs; return; }
        holding = true;
        void o.hold(i).catch(() => null).then(() => { holding = false; pauseUntil = performance.now() + 500; });
      };
      // The road ahead, faint; the road sailed, bright (redrawn as the ship moves).
      src('vy-ahead')?.setData(line(routeLine(r, d, r.total), v.color));
      src('vy-done')?.setData(line(routeLine(r, 0, d), v.color));
      const [la0, lo0] = routeAt(r, d);
      ship.setLngLat([lo0, la0]).setRotation(routeHeading(r, d)).addTo(m);
      let zoom = 5.4, bearing = 0;
      m.flyTo({ center: [lo0, la0], zoom, pitch, bearing, padding: pad(), duration: calm ? 0 : 1600, essential: true });
      arrive(o.from, last);
      if (!o.hold) pauseUntil = last + 1700 + o.pauseMs;

      const tick = (now: number) => {
        const dt = Math.min(64, now - last);
        last = now;
        if (!holding && now >= pauseUntil && next < r.at.length) {
          d = calm ? r.at[next] : d + speed * dt; // (reduced motion: port to port)
          if (d >= r.at[next]) { d = r.at[next]; arrive(next, now); next++; }
        }
        const [la, lo] = routeAt(r, d);
        const heading = routeHeading(r, d);
        ship.setLngLat([lo, la]).setRotation(heading);
        if (now - lastTrail > 33) {
          lastTrail = now;
          src('vy-done')?.setData(line(routeLine(r, 0, d), v.color));
          src('vy-ahead')?.setData(line(routeLine(r, d, r.total), v.color));
        }
        if (follow && now >= followFrom && !calm) {
          // Close in near a port, pull back over open ocean; lean gently with the ship's course.
          const toNext = next < r.at.length ? (r.at[next] - d) * KM : 0, fromLast = (d - r.at[Math.max(0, next - 1)]) * KM;
          const want = clamp(6.1 - Math.log2(Math.max(1, Math.min(toNext, fromLast) / 110)), 3, 5.6) - (opts.narrow ? 0.35 : 0);
          zoom += (want - zoom) * Math.min(1, dt / 1600);
          const lean = clamp(turn(0, heading) * 0.18, -24, 24);
          bearing += clamp(turn(bearing, lean), (-20 * dt) / 1000, (20 * dt) / 1000);
          m.jumpTo({ center: [lo, la], zoom, bearing });
        }
        if (next >= r.at.length && !holding && now >= pauseUntil) { finish(); o.onDone(); return; }
        raf = requestAnimationFrame(tick);
      };
      const finish = () => {
        if (done) return;
        done = true;
        cancelAnimationFrame(raf);
        m.off('dragstart', mine); m.off('rotatestart', mine); m.off('pitchstart', mine);
        el.classList.add('gone');
        window.setTimeout(() => ship.remove(), 400);
        if (sailing === finish) sailing = null;
      };
      raf = requestAnimationFrame(tick);
      sailing = finish;
      return finish;
    },
    /** The panel changed size: frame the same thing again in the room left (not while sailing). */
    reframe() {
      if (!scene || sailing) return !!scene;
      if (scene.active === null) overview();
      else m.flyTo({ center: stopLL(scene.active), zoom: 5.4, pitch, bearing: 0, padding: pad(), duration: opts.calm() ? 0 : 900, essential: true });
      return true;
    },
    clear,
  };
}
