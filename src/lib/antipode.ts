// Antipode finder: place lookup + the "dig straight through the Earth" animation.
//
// The dive is one rAF timeline driving a handful of light objects: the planet turns to
// glass, its layers glow inside, a comet tunnels A → core → B while the camera swings
// round a single great circle (so it never flips), then the far side solidifies.
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import citiesRaw from '../data/cities.json';
import { BY_CCA3, COUNTRIES, countryAt } from './data';

type City = [name: string, lat: number, lng: number, pop: number, rank: number, capital: 0 | 1, iso3: string];
const CITIES = citiesRaw as City[];

export interface Place {
  lat: number;
  lng: number;
  label: string; // "Madrid, Spain" / "South Pacific Ocean"
  sub?: string; // nearest-city note etc.
  cca3: string | null; // country it lies in (null = ocean)
  cca2?: string;
}

export const EARTH_R_KM = 6371;
export const antipodeOf = (lat: number, lng: number) => ({ lat: -lat, lng: lng > 0 ? lng - 180 : lng + 180 });

const rad = Math.PI / 180;
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const s = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

function nearestCity(lat: number, lng: number) {
  let best: City | null = null, bd = Infinity;
  for (const c of CITIES) {
    if (Math.abs(c[1] - lat) > 40) continue; // cheap reject before the trig
    const d = distanceKm({ lat, lng }, { lat: c[1], lng: c[2] });
    if (d < bd) { bd = d; best = c; }
  }
  if (!best) for (const c of CITIES) { const d = distanceKm({ lat, lng }, { lat: c[1], lng: c[2] }); if (d < bd) { bd = d; best = c; } }
  return best ? { name: best[0], cca3: best[6], km: bd } : null;
}

/** Rough but friendly ocean names (good enough for "you'd surface in the …"). */
function oceanAt(lat: number, lng: number) {
  if (lat > 66) return 'Arctic Ocean';
  if (lat < -58) return 'Southern Ocean';
  if (lat > 30 && lat < 46 && lng > -6 && lng < 36) return 'Mediterranean Sea';
  if (lat > 8 && lat < 30 && lng > -98 && lng < -60) return lng < -84 && lat > 18 ? 'Gulf of Mexico' : 'Caribbean Sea';
  // Indian Ocean: Africa → Australia, south of Asia.
  if (lng >= 20 && lng <= 147 && lat < 30 && !(lng > 100 && lat > -5)) return 'Indian Ocean';
  // Atlantic: between the Americas and Europe/Africa (its western edge slants with the coast).
  const westEdge = lat > 10 ? -100 : lat > -20 ? -50 : -68;
  if (lng > westEdge && lng < 20) return lat >= 0 ? 'North Atlantic Ocean' : 'South Atlantic Ocean';
  return lat >= 0 ? 'North Pacific Ocean' : 'South Pacific Ocean';
}

export function describePlace(lat: number, lng: number, name?: string): Place {
  const cca3 = countryAt(lat, lng);
  const c = cca3 ? BY_CCA3.get(cca3) : undefined;
  const near = nearestCity(lat, lng);
  const nearCountry = near ? BY_CCA3.get(near.cca3)?.name : undefined;
  if (name) return { lat, lng, label: c ? `${name}, ${c.name}` : name, cca3, cca2: c?.cca2 };
  if (c) {
    const label = near && near.km < 120 && near.cca3 === cca3 ? `${near.name}, ${c.name}` : c.name;
    const sub = near && near.km >= 120 && near.cca3 === cca3 ? `${fmtKm(near.km)} from ${near.name}` : undefined;
    return { lat, lng, label, sub, cca3, cca2: c.cca2 };
  }
  return {
    lat, lng, label: oceanAt(lat, lng), cca3: null,
    sub: near ? `Nearest city: ${near.name}${nearCountry ? `, ${nearCountry}` : ''} · ${fmtKm(near.km)} away` : undefined,
  };
}

export const fmtKm = (km: number) => `${Math.round(km).toLocaleString('en-US')} km`;
export const fmtCoord = (lat: number, lng: number) =>
  `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? 'E' : 'W'}`;

// ── Search: cities + countries ────────────────────────────
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const CITY_INDEX = CITIES.map((c) => ({ c, n: norm(c[0]) }));
export interface PlaceHit { name: string; sub: string; lat: number; lng: number; cca2?: string; kind: 'city' | 'country' }
export function searchPlaces(q: string, limit = 6): PlaceHit[] {
  const n = norm(q.trim());
  if (n.length < 2) return [];
  const out: (PlaceHit & { score: number })[] = [];
  for (const c of COUNTRIES) {
    const cn = norm(c.name);
    if (!cn.includes(n)) continue;
    const at = c.capLatLng ?? c.latlng;
    out.push({ name: c.name, sub: c.capital[0] ? `Country · capital ${c.capital[0]}` : 'Country', lat: at[0], lng: at[1], cca2: c.cca2, kind: 'country', score: (cn.startsWith(n) ? 0 : 1) - 0.5 });
  }
  for (const { c, n: cn } of CITY_INDEX) {
    if (!cn.includes(n)) continue;
    const country = BY_CCA3.get(c[6]);
    out.push({ name: c[0], sub: country ? `${country.name}` : 'City', lat: c[1], lng: c[2], cca2: country?.cca2, kind: 'city', score: (cn.startsWith(n) ? 0 : 1) - Math.log10(c[3] + 10) / 10 });
  }
  return out.sort((a, b) => a.score - b.score).slice(0, limit);
}

// ── Journey through the Earth ─────────────────────────────
/** Depth below the surface for progress p ∈ [0,1] along the diameter, and what's there. */
export function journeyAt(p: number) {
  const travelled = p * 2 * EARTH_R_KM;
  const depth = Math.min(travelled, 2 * EARTH_R_KM - travelled);
  const layer = depth < 35 ? 'Crust' : depth < 2890 ? 'Mantle' : depth < 5150 ? 'Outer core' : 'Inner core';
  // Rough geotherm (°C): crust → mantle → core.
  const T = depth < 35 ? 15 + depth * 12
    : depth < 660 ? 450 + (depth - 35) * 1.6
    : depth < 2890 ? 1450 + (depth - 660) * 1.0
    : depth < 5150 ? 3700 + (depth - 2890) * 0.62
    : 5100 + (depth - 5150) * 0.25;
  return { travelled, depth, layer, tempC: Math.round(T / 10) * 10 };
}

export interface DiveHooks {
  /** Every frame: p = progress through the planet (0 at the start point, 1 at the antipode). */
  onTick?: (p: number) => void;
  /** The comet breaks the surface on the far side. */
  onEmerge?: () => void;
}

const ease = {
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  sine: (t: number) => 0.5 - Math.cos(Math.PI * t) / 2,
};
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

function unit(lat: number, lng: number) {
  // three-globe's polar2Cartesian convention.
  const phi = (90 - lat) * rad, theta = (90 - lng) * rad;
  return new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
}

let glowTex: THREE.Texture | null = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,240,200,0.95)');
  grd.addColorStop(0.45, 'rgba(251,191,36,0.35)');
  grd.addColorStop(1, 'rgba(251,146,60,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

const TOTAL = 5400; // ms

/**
 * Run the dive. Resolves when the camera has settled over the antipode.
 * `cancel()` stops it and restores the scene (camera jumps to the antipode).
 */
export function runDive(g: GlobeMethods, from: { lat: number; lng: number }, hooks: DiveHooks = {}) {
  const scene = g.scene();
  const camera = g.camera() as THREE.PerspectiveCamera;
  const R = g.getGlobeRadius();
  const to = antipodeOf(from.lat, from.lng);
  const A = unit(from.lat, from.lng), B = A.clone().negate();
  // Camera swings round ONE great circle A → side → B: no flips, no pole wobble.
  let side = new THREE.Vector3(0, 1, 0).cross(A);
  if (side.lengthSq() < 1e-4) side = new THREE.Vector3(1, 0, 0);
  side.normalize();
  const axis = A.clone().cross(side).normalize();
  const d0 = camera.position.length(), d1 = R * 2.35, dMid = R * 3.25;

  // ── Glass: fade everything already in the scene (except the sky & atmosphere) ──
  type Saved = { m: THREE.Material & { opacity: number }; opacity: number; transparent: boolean; depthWrite: boolean };
  const saved: Saved[] = [];
  const group = new THREE.Group();
  scene.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const m of (Array.isArray(mats) ? mats : [mats]) as (THREE.Material & { opacity: number })[]) {
      // Skip the atmosphere glow and star sky — except shaders that expose an opacity (Day & Night globe).
      if (m.side === THREE.BackSide || (m instanceof THREE.ShaderMaterial && !m.uniforms?.uOpacity)) continue;
      if (saved.some((s) => s.m === m)) continue;
      saved.push({ m, opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite });
    }
  });
  const setGlass = (k: number) => {
    for (const s of saved) {
      const wantT = k < 0.999 || s.transparent;
      if (s.m.transparent !== wantT) { s.m.transparent = wantT; s.m.needsUpdate = true; }
      s.m.opacity = s.opacity * k;
      const u = (s.m as THREE.ShaderMaterial).uniforms?.uOpacity;
      if (u) u.value = k;
      s.m.depthWrite = k > 0.97 ? s.depthWrite : false;
    }
  };

  // ── Inside the planet ──
  const add = <T extends THREE.Object3D>(o: T, order: number) => { o.renderOrder = order; group.add(o); return o; };
  const basic = (color: string, opacity: number, blending: THREE.Blending = THREE.AdditiveBlending) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending, userData: { max: opacity } });
  const mantle = add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.985, 48, 32), basic('#9a3412', 0.16)), 20);
  const outer = add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.546, 48, 32), basic('#f97316', 0.3)), 21);
  const inner = add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.19, 32, 24), basic('#fde68a', 0.95)), 22);
  const coreGlow = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#fbbf24', transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })), 23);
  coreGlow.scale.setScalar(R * 0.9);

  // The tunnel: a bright thread inside a soft glow, growing behind the comet.
  const beamCore = add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.006, R * 0.006, 1, 12, 1, true), basic('#fff7d6', 1)), 24);
  const beamGlow = add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.028, R * 0.028, 1, 16, 1, true), basic('#fbbf24', 0.28)), 24);
  const comet = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })), 26);
  comet.scale.setScalar(R * 0.2);

  // Ripples where the tunnel breaks the surface.
  const ring = (at: THREE.Vector3, color: string) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.copy(at.clone().multiplyScalar(R * 1.004));
    m.lookAt(at.clone().multiplyScalar(R * 2));
    return add(m, 27);
  };
  const entry = ring(A, '#fbbf24'), exit1 = ring(B, '#5eead4'), exit2 = ring(B, '#fde68a');
  const flash = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ccfbf1', transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })), 28);
  flash.position.copy(B.clone().multiplyScalar(R * 1.01));
  scene.add(group);

  const setOpacity = (o: THREE.Mesh | THREE.Sprite, k: number) => {
    const m = o.material as THREE.Material & { opacity: number; userData: { max?: number } };
    m.opacity = (m.userData.max ?? 1) * k;
    o.visible = m.opacity > 0.002;
  };
  const yAxis = new THREE.Vector3(0, 1, 0);
  const placeBeam = (p: number) => {
    // From the entry point to the comet's position along the diameter.
    const len = Math.max(1e-3, 2 * R * p);
    const mid = A.clone().multiplyScalar(R - len / 2);
    for (const b of [beamCore, beamGlow]) {
      b.position.copy(mid);
      b.quaternion.setFromUnitVectors(yAxis, A);
      b.scale.set(1, len, 1);
    }
  };

  const ctl = g.controls() as unknown as { enabled: boolean; autoRotate: boolean };
  const prevEnabled = ctl.enabled;
  ctl.enabled = false;
  ctl.autoRotate = false;

  let raf = 0, done = false, emerged = false;
  let resolve!: () => void;
  const finished = new Promise<void>((r) => { resolve = r; });
  const start = performance.now();
  const camDir = new THREE.Vector3();

  const cleanup = () => {
    cancelAnimationFrame(raf);
    setGlass(1);
    for (const s of saved) { s.m.transparent = s.transparent; s.m.depthWrite = s.depthWrite; s.m.needsUpdate = true; }
    scene.remove(group);
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    });
    ctl.enabled = prevEnabled;
    // Hand the camera back to the globe's controls, exactly where we left it.
    const d = camera.position.length();
    g.pointOfView({ lat: to.lat, lng: to.lng, altitude: d / R - 1 }, 0);
  };

  const frame = (now: number) => {
    const t = Math.min(TOTAL, now - start);
    const u = t / TOTAL;

    // Camera: one smooth sweep, pulling back mid-way so the whole diameter is in view.
    const cu = ease.inOut(seg(t, 250, TOTAL - 250));
    camDir.copy(A).applyAxisAngle(axis, Math.PI * cu);
    const dist = d0 + (d1 - d0) * cu + (dMid - (d0 + d1) / 2) * Math.sin(Math.PI * cu);
    camera.position.copy(camDir.multiplyScalar(dist));
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);

    // Glass in, glass out.
    const glass = 1 - 0.86 * ease.out(seg(t, 0, 750)) * (1 - ease.inOut(seg(t, 4050, 5050)));
    setGlass(glass);
    const inside = ease.out(seg(t, 250, 950)) * (1 - ease.inOut(seg(t, 3850, 4700)));
    setOpacity(mantle, inside);
    setOpacity(outer, inside);

    // Comet: eases in, lingers at the core, accelerates out.
    const x = ease.sine(seg(t, 850, 3950));
    const p = clamp01(x - 0.07 * Math.sin(2 * Math.PI * x));
    comet.position.copy(A).multiplyScalar(R * (1 - 2 * p));
    const atCore = Math.max(0, 1 - Math.abs(p - 0.5) / 0.14); // 1 at the centre
    setOpacity(comet, ease.out(seg(t, 700, 950)) * (1 - seg(t, 3950, 4250)));
    comet.scale.setScalar(R * (0.2 + 0.16 * atCore));
    setOpacity(inner, inside * (0.55 + 0.45 * atCore));
    setOpacity(coreGlow, inside * (0.35 + 0.65 * atCore));
    coreGlow.scale.setScalar(R * (0.75 + 0.5 * atCore));

    placeBeam(p);
    const beam = ease.out(seg(t, 800, 1100)) * (1 - ease.inOut(seg(t, 4000, 4800)));
    setOpacity(beamCore, beam);
    setOpacity(beamGlow, beam);

    // Ripples: in at the start, out (double) at the far side.
    const e = seg(t, 650, 1650);
    entry.scale.setScalar(R * (0.03 + 0.3 * ease.out(e)));
    setOpacity(entry, e > 0 ? (1 - e) * 0.9 : 0);
    const x1 = seg(t, 3950, 5100), x2 = seg(t, 4150, 5350);
    exit1.scale.setScalar(R * (0.03 + 0.42 * ease.out(x1)));
    setOpacity(exit1, x1 > 0 ? (1 - x1) * 0.95 : 0);
    exit2.scale.setScalar(R * (0.03 + 0.28 * ease.out(x2)));
    setOpacity(exit2, x2 > 0 ? (1 - x2) * 0.8 : 0);
    const f = seg(t, 3920, 4700);
    setOpacity(flash, f > 0 ? Math.sin(Math.PI * Math.min(1, f * 1.6)) * (1 - f) * 1.4 : 0);
    flash.scale.setScalar(R * (0.25 + 0.55 * f));

    if (!emerged && p >= 1) { emerged = true; hooks.onEmerge?.(); }
    hooks.onTick?.(p);

    if (u < 1) raf = requestAnimationFrame(frame);
    else { done = true; cleanup(); resolve(); }
  };
  raf = requestAnimationFrame(frame);

  return {
    to,
    finished,
    /** Jump to the end (skip / exit): restore the scene, camera over the antipode. */
    cancel() {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      camera.position.copy(B).multiplyScalar(d1);
      if (!emerged) hooks.onEmerge?.();
      hooks.onTick?.(1);
      cleanup();
      resolve();
    },
  };
}
