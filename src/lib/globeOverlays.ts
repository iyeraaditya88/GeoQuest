// Small three.js overlays drawn on top of the merged country layer:
//  • state/province boundaries for the selected country (fade in after it lifts)
//  • a soft, animated hover outline
import * as THREE from 'three';
import GeoJsonGeometry from 'three-geojson-geometry';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { flagUrl, type CountryFeature } from './data';
import { rgba } from './countryMesh';

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/** Animate a material's opacity; returns a cancel function. */
function fade(mat: THREE.Material & { opacity: number }, to: number, ms: number, delay = 0, done?: () => void) {
  const from = mat.opacity;
  let raf = 0;
  const t0 = performance.now() + delay;
  const step = (now: number) => {
    const t = Math.max(0, Math.min(1, (now - t0) / ms));
    mat.opacity = from + (to - from) * ease(t);
    if (t < 1) raf = requestAnimationFrame(step); else done?.();
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

function lineMesh(geo: THREE.BufferGeometry, css: string, order: number) {
  const [r, g, b, a] = rgba(css);
  const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(r, g, b), transparent: true, opacity: 0, depthWrite: false });
  (mat.userData as { target: number }).target = a;
  const mesh = new THREE.LineSegments(geo, mat);
  mesh.renderOrder = order;
  return mesh;
}

// ── State / province boundaries ───────────────────────────
/** [name, lat, lng, bbox area in deg²] — label point from Natural Earth, largest first. */
export type AdminState = [name: string, lat: number, lng: number, area: number];
/** [name, lat, lng, population, 2 = national capital | 1 = state capital | 0] — biggest first. */
export type AdminCity = [name: string, lat: number, lng: number, pop: number, cap: 0 | 1 | 2];
export interface AdminData { lines: number[][][]; states: AdminState[]; cities: AdminCity[] }

const adminCache = new Map<string, Promise<AdminData | null>>();
export function loadAdmin(cca3: string) {
  if (!adminCache.has(cca3)) {
    adminCache.set(cca3, fetch(`/admin1/${cca3}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d ? { lines: d.lines ?? [], states: d.states ?? [], cities: d.cities ?? [] } : null))
      .catch(() => null));
  }
  return adminCache.get(cca3)!;
}

/** Warm everything a country's selection needs (province/city data + its panel flag). */
const warmed = new Set<string>();
export function prefetchCountry(cca3: string, cca2?: string) {
  void loadAdmin(cca3);
  if (cca2 && !warmed.has(cca2)) { warmed.add(cca2); const img = new Image(); img.decoding = 'async'; img.src = flagUrl(cca2, 640); }
}

export function createAdminLayer(scene: THREE.Scene, R: number) {
  let current: { id: string; mesh: THREE.LineSegments; cancel?: () => void } | null = null;
  let wanted: string | null = null;

  const remove = (entry: NonNullable<typeof current>) => {
    entry.cancel?.();
    const mat = entry.mesh.material as THREE.LineBasicMaterial;
    fade(mat, 0, 180, 0, () => { scene.remove(entry.mesh); entry.mesh.geometry.dispose(); mat.dispose(); });
  };

  return {
    /** Show the boundaries of `cca3` (or hide with null). `lift` = the selected country's altitude. */
    async show(cca3: string | null, color: string, lift: number) {
      wanted = cca3;
      if (current && current.id !== cca3) { remove(current); current = null; }
      if (!cca3 || current) return;
      const lines = (await loadAdmin(cca3))?.lines;
      if (wanted !== cca3 || !lines?.length) return;
      // Sit just above the lifted country cap.
      const geo = new GeoJsonGeometry({ type: 'MultiLineString', coordinates: lines }, R * (1 + lift) * 1.0006, 2);
      const mesh = lineMesh(geo, color, 6);
      scene.add(mesh);
      const mat = mesh.material as THREE.LineBasicMaterial;
      // Wait for the country to finish rising, then draw the lines in.
      current = { id: cca3, mesh, cancel: fade(mat, (mat.userData as { target: number }).target, 400, 250) };
    },
    recolor(color: string) {
      if (!current) return;
      const [r, g, b, a] = rgba(color);
      const mat = current.mesh.material as THREE.LineBasicMaterial;
      mat.color.setRGB(r, g, b);
      (mat.userData as { target: number }).target = a;
      mat.opacity = a;
    },
    dispose() { if (current) { scene.remove(current.mesh); current.mesh.geometry.dispose(); } },
  };
}

// ── Hover: animated fill + outline ────────────────────────
export function createHoverFx(opts: {
  scene: THREE.Scene;
  R: number;
  features: CountryFeature[];
  /** paint country `id` at hover strength `t` (0 = normal, 1 = fully hovered) */
  paint: (id: string, t: number) => void;
}) {
  const { scene, R, features, paint } = opts;
  const entries = new Map<string, { t: number; target: number; outline?: THREE.LineSegments }>();
  let raf = 0, last = 0, outlineColor = 'rgba(255,255,255,0.95)';
  const outlineGeo = new Map<string, THREE.BufferGeometry>();

  const geoFor = (id: string) => {
    if (!outlineGeo.has(id)) {
      const parts = features.filter((f) => f.properties.cca3 === id)
        .map((f) => new GeoJsonGeometry(f.geometry as never, R * 1.0062, 4))
        .map((g) => (g.index ? g.toNonIndexed() : g));
      outlineGeo.set(id, parts.length > 1 ? mergeGeometries(parts, false)! : parts[0]);
    }
    return outlineGeo.get(id)!;
  };

  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    let busy = false;
    for (const [id, e] of entries) {
      const speed = e.target > e.t ? 9 : 6; // quick in, gentler out
      e.t += (e.target - e.t) * Math.min(1, dt * speed);
      if (Math.abs(e.target - e.t) < 0.01) e.t = e.target;
      paint(id, e.t);
      if (e.outline) (e.outline.material as THREE.LineBasicMaterial).opacity = rgba(outlineColor)[3] * e.t;
      if (e.t === 0 && e.target === 0) {
        if (e.outline) { scene.remove(e.outline); (e.outline.material as THREE.Material).dispose(); }
        entries.delete(id);
      } else if (e.t !== e.target) busy = true;
    }
    raf = busy ? requestAnimationFrame(tick) : 0;
    if (!busy) last = 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

  return {
    set(id: string | null, withOutline: boolean) {
      for (const [k, e] of entries) if (k !== id) e.target = 0;
      if (id) {
        let e = entries.get(id);
        if (!e) { e = { t: 0, target: 1 }; entries.set(id, e); }
        e.target = 1;
        if (withOutline && !e.outline) {
          e.outline = lineMesh(geoFor(id), outlineColor, 5);
          scene.add(e.outline);
        }
      }
      kick();
    },
    setOutlineColor(css: string) {
      outlineColor = css;
      const [r, g, b] = rgba(css);
      for (const e of entries.values()) if (e.outline) (e.outline.material as THREE.LineBasicMaterial).color.setRGB(r, g, b);
    },
    /** Current hover strength of a country (for full repaints). */
    strength: (id: string | null) => (id ? entries.get(id)?.t ?? 0 : 0),
    dispose() { cancelAnimationFrame(raf); for (const e of entries.values()) if (e.outline) scene.remove(e.outline); outlineGeo.forEach((g) => g.dispose()); },
  };
}
