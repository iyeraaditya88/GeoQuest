import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import { animate } from 'motion/react';
import { BY_CCA3, FEATURES, POLITICAL_COLOR, altitudeFor, countryAt, fmtCompact, shade, type CountryFeature } from '../lib/data';
import { createLabelLayer } from '../lib/mapLabels';
import { cursor } from '../lib/cursor';
import { buildCountryLayer, rgba, type CountryLayer, type RGBA } from '../lib/countryMesh';
import { createAdminLayer, createHoverFx, createZoomAdminLayer, loadAdmin, prefetchCountry } from '../lib/globeOverlays';
import { createNatureLayer, loadNature, riverTierAt } from '../lib/nature';
import { runDive, type DiveHooks } from '../lib/antipode';
import { displayName, riverNear, type FeatureInfo, type FeatureRef } from '../lib/features';
const displayRiver = (n: string) => displayName({ kind: 'river', name: n });
import { createDayNightMaterial, loadTexture, updateSun } from '../lib/daynight';
import { createReliefLayer } from '../lib/relief';
import { panelWidth, sidePanel } from '../lib/layout';
import { escapeHtml } from '../lib/html';

export type MapStyle = 'satellite' | 'political' | 'daynight';
export type Feedback = { cca3: string; kind: 'good' | 'bad' | 'reveal' } | null;

export interface GlobeView2D { lat: number; lng: number; altitude: number; cx: number; cy: number; r: number }

export interface GlobeHandle {
  flyTo: (cca3: string, ms?: number) => void;
  frame: (lat: number, lng: number, altitude: number) => void;
  reset: () => void;
  /** Where the globe currently sits on screen — used to morph into the flat atlas. */
  getView: () => GlobeView2D | null;
  /** Jump the camera (altitude defaults to the home view's). */
  setPov: (lat: number, lng: number, altitude?: number) => void;
  pause: () => void;
  resume: () => void;
  /** Antipode finder: tunnel from `from` through the core to its antipode. */
  dive: (from: { lat: number; lng: number }, hooks?: DiveHooks) => { finished: Promise<void>; cancel: () => void } | null;
}

interface Props {
  selected: string | null;
  highlighted: string[];
  style: MapStyle;
  autoRotate: boolean;
  feedback: Feedback;
  quiz: boolean;
  liftUp: boolean;
  /** a game card sits at the top — push the globe down a little */
  dropDown?: boolean;
  hidden: boolean;
  /** rivers, lakes, mountain ranges & peaks */
  nature?: boolean;
  /** width of the sidebar, so the globe centres in the free space */
  leftInset?: number;
  /** Street-view game: clicks drop a pin instead of selecting countries. */
  pickMode?: boolean;
  sideView?: boolean;
  pins?: ({ lat: number; lng: number; kind: 'guess' | 'answer' | 'from' | 'to' } | { lat: number; lng: number; kind: 'place'; id: string; emoji: string; name: string; tone: string })[];
  /** One of "My places" was tapped on the globe */
  onPin?: (id: string) => void;
  arcs?: { startLat: number; startLng: number; endLat: number; endLng: number }[];
  onPick?: (lat: number, lng: number) => void;
  /** A river / range / peak / lake was clicked. */
  onFeature?: (f: FeatureRef) => void;
  /** The selected feature (highlighted; its panel is open). */
  feature?: FeatureInfo | null;
  onSelect: (cca3: string | null) => void;
  onInteract: () => void;
  onReady: () => void;
}

const HOME_ALTITUDE = 1.75;
/**
 * Home view. The camera's field of view is vertical, so on a portrait phone the default
 * altitude makes the globe wider than the screen — back off until it fits the width.
 */
function homeView() {
  const w = window.innerWidth, h = window.innerHeight;
  const focal = h / 2 / Math.tan((50 * Math.PI) / 360); // globe.gl's default 50° fov
  const fit = 1 / Math.sin(Math.atan((0.46 * w) / focal)) - 1; // altitude where the disc spans 92% of the width
  // (A zero-sized window — background tab, hidden pane — gives NaN: never feed that to the camera.)
  return { lat: 24, lng: 12, altitude: Number.isFinite(fit) ? Math.max(HOME_ALTITUDE, fit) : HOME_ALTITUDE };
}

const TEXTURE: Record<MapStyle, string | null> = {
  satellite: '/textures/earth-blue-marble.jpg',
  daynight: null, // the day/night shader brings its own two textures
  political: null,
};

// Smooth "flight" curve: ease-in-out position, with altitude arcing up on long hops.
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);

function angularDistance(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(h)))) / r;
}

export const GlobeView = forwardRef<GlobeHandle, Props>(function GlobeView(
  { selected, highlighted, style, autoRotate, feedback, quiz, liftUp, dropDown = false, hidden, nature = true, leftInset = 0, pickMode = false, sideView = false, pins = [], arcs = [], onPick, onPin, onFeature, feature = null, onSelect, onInteract, onReady }, ref,
) {
  const globe = useRef<GlobeMethods | undefined>(undefined);
  const labelLayer = useRef<HTMLDivElement>(null);
  const labels = useRef<ReturnType<typeof createLabelLayer> | null>(null);
  const flight = useRef(0);
  const dragging = useRef(false);
  const interactRef = useRef(onInteract);
  interactRef.current = onInteract;
  const featureCb = useRef(onFeature);
  featureCb.current = onFeature;
  const styleRef = useRef(style), hiddenRef = useRef(hidden), natureRef = useRef(nature);
  const onPinRef = useRef(onPin);
  onPinRef.current = onPin;
  styleRef.current = style; hiddenRef.current = hidden; natureRef.current = nature;

  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [hover, setHover] = useState<string | null>(null);
  const countryLayer = useRef<CountryLayer | null>(null);
  const adminLayer = useRef<ReturnType<typeof createAdminLayer> | null>(null);
  const natureLayer = useRef<ReturnType<typeof createNatureLayer> | null>(null);
  const reliefLayer = useRef<ReturnType<typeof createReliefLayer> | null>(null);
  const zoomAdmin = useRef<ReturnType<typeof createZoomAdminLayer> | null>(null);
  const hoverFx = useRef<ReturnType<typeof createHoverFx> | null>(null);
  const [layerReady, setLayerReady] = useState(false);
  const prevHover = useRef<string | null>(null);
  const [offset, setOffset] = useState<[number, number]>([0, 0]);
  const hl = useMemo(() => new Set(highlighted), [highlighted]);

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const cancelFlight = () => cancelAnimationFrame(flight.current);

  // Our own click detection: tolerant of a few px of jitter (trackpads), unlike the
  // library's which drops any click with movement.
  const press = useRef<{ x: number; y: number; t: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 0) press.current = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  // Hover: one cheap sphere hit + point-in-polygon per frame, instead of the
  // library raycasting every country mesh on every frame.
  const hoverRaf = useRef(0);
  const lastMove = useRef<{ x: number; y: number } | null>(null);
  const onPointerMove = (e: React.PointerEvent) => {
    lastMove.current = { x: e.clientX, y: e.clientY };
    if (hoverRaf.current) return;
    hoverRaf.current = requestAnimationFrame(() => {
      hoverRaf.current = 0;
      const g = globe.current, m = lastMove.current;
      if (!g || !m || dragging.current) return;
      const geo = g.toGlobeCoords(m.x, m.y);
      const id = geo ? countryAt(geo.lat, geo.lng) : null;
      setHover((h) => (h === id ? h : id));
      const c = id ? BY_CCA3.get(id) : undefined;
      cursor.set({ country: c ? { name: c.name, cca2: c.cca2, sub: `${c.capital[0] ?? '—'} · ${fmtCompact(c.population)}` } : null });
      // Right on a river line? Name it (a click will open its details).
      if (geo && natureRef.current && !quiz && !pickMode) {
        void riverNear(geo.lat, geo.lng, pxTol(geo, 7), riverTierAt(globe.current?.pointOfView().altitude ?? 9)).then((r) => {
          if (!r || dragging.current) return;
          cursor.set({ country: { name: displayRiver(r.n), cca2: '', glyph: '〰', sub: 'River · click for details' } });
        });
      }
    });
  };
  const onPointerLeave = () => { setHover(null); cursor.set({ country: null }); };

  const onPointerUp = (e: React.PointerEvent) => {
    const p = press.current;
    press.current = null;
    if (!p || e.button !== 0) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > (e.pointerType === 'touch' ? 12 : 6) || performance.now() - p.t > 600) return;
    if ((e.target as HTMLElement).tagName !== 'CANVAS') return;
    const g = globe.current;
    if (!g) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const geo = g.toGlobeCoords(e.clientX - rect.left, e.clientY - rect.top);
    interactRef.current();
    if (pickMode) { if (geo) onPick?.(geo.lat, geo.lng); return; }
    let id = geo ? countryAt(geo.lat, geo.lng) : null;
    // Quizzes on a touchscreen: a fingertip that lands just off a small country (in the sea)
    // still counts — take the nearest country within finger reach.
    if (!id && quiz && e.pointerType === 'touch') id = nearestCountry(g, e.clientX - rect.left, e.clientY - rect.top, 16);
    const choose = () => { if (id) onSelect(id); else if (!quiz) onSelect(null); };
    // A click right on a river line opens the river; anywhere else, the country.
    if (geo && natureRef.current && !quiz && onFeature) {
      // A fingertip is imprecise: on touch only a near-exact hit on the line counts (labels stay tappable).
      void riverNear(geo.lat, geo.lng, pxTol(geo, e.pointerType === 'touch' ? 2.5 : 7), riverTierAt(g.pointOfView().altitude)).then((r) => (r ? onFeature({ kind: 'river', name: r.id }) : choose()));
      return;
    }
    choose();
  };

  /** The country nearest to a screen point, searching rings out to `maxPx`. */
  const nearestCountry = (g: GlobeMethods, x: number, y: number, maxPx: number) => {
    for (let r = 4; r <= maxPx; r += 4) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const p = g.toGlobeCoords(x + Math.cos(a) * r, y + Math.sin(a) * r);
        const c = p ? countryAt(p.lat, p.lng) : null;
        if (c) return c;
      }
    }
    return null;
  };

  /** `px` screen pixels expressed in degrees at a point (for hit-testing lines). */
  const pxTol = (geo: { lat: number; lng: number }, px: number) => {
    const g = globe.current;
    if (!g) return 0.2;
    const a = g.getScreenCoords(geo.lat, geo.lng), b = g.getScreenCoords(Math.min(89.9, geo.lat + 0.5), geo.lng);
    const perDeg = Math.hypot(a.x - b.x, a.y - b.y) * 2 || 1;
    return px / perDeg;
  };

  const flyToPov = useCallback((to: { lat: number; lng: number; altitude: number }, ms?: number) => {
    const g = globe.current;
    if (!g) return;
    cancelFlight();
    const from = g.pointOfView();
    const dLng = ((((to.lng - from.lng) % 360) + 540) % 360) - 180;
    const dist = angularDistance(from, to);
    // Quick but never jarring: ~0.6 s for neighbours, capped at 1.5 s for the far side.
    const duration = ms ?? Math.min(1500, 600 + dist * 4.5 + Math.abs(to.altitude - from.altitude) * 150);
    // Lift the camera mid-flight on long hops so you see where you're going.
    const arc = dist > 25 ? Math.min(1.1, (dist / 180) * 1.6) : 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const e = easeInOut(t);
      const ea = easeOutQuint(t) * 0.35 + e * 0.65;
      g.pointOfView({
        lat: from.lat + (to.lat - from.lat) * e,
        lng: from.lng + dLng * e,
        altitude: from.altitude + (to.altitude - from.altitude) * ea + arc * Math.sin(Math.PI * t),
      }, 0);
      if (t < 1) flight.current = requestAnimationFrame(step);
    };
    flight.current = requestAnimationFrame(step);
  }, []);

  useImperativeHandle(ref, () => ({
    flyTo(cca3, ms) {
      const c = BY_CCA3.get(cca3);
      if (c) flyToPov({ lat: c.latlng[0], lng: c.latlng[1], altitude: altitudeFor(c) }, ms);
    },
    frame(lat, lng, altitude) { flyToPov({ lat, lng, altitude }); },
    reset() { flyToPov(homeView()); },
    getView() {
      const g = globe.current;
      if (!g) return null;
      const pov = g.pointOfView();
      const cam = g.camera() as unknown as { position: THREE.Vector3; fov: number };
      const R = g.getGlobeRadius();
      const dist = cam.position.length();
      const c = g.getScreenCoords(pov.lat, pov.lng, 0);
      const focal = window.innerHeight / 2 / Math.tan((cam.fov * Math.PI) / 360);
      return { ...pov, cx: c.x, cy: c.y, r: focal * Math.tan(Math.asin(Math.min(1, R / dist))) };
    },
    setPov(lat, lng, altitude = homeView().altitude) { cancelFlight(); globe.current?.pointOfView({ lat, lng, altitude }, 0); },
    dive(from, hooks) {
      const g = globe.current;
      if (!g) return null;
      cancelFlight();
      // Labels and river overlays would float in mid-air through the glass — hide them for the ride.
      labels.current?.setEnabled(styleRef.current === 'political', false);
      natureLayer.current?.setVisible(false);
      reliefLayer.current?.setVisible(false);
      zoomAdmin.current?.setEnabled(false);
      hoverFx.current?.set(null, false);
      const run = runDive(g, from, hooks);
      void run.finished.then(() => {
        labels.current?.setEnabled(styleRef.current === 'political', !hiddenRef.current);
        natureLayer.current?.setVisible(natureRef.current);
        reliefLayer.current?.setVisible(natureRef.current);
        zoomAdmin.current?.setEnabled(true);
      });
      return run;
    },
    pause() { globe.current?.pauseAnimation(); },
    resume() { globe.current?.resumeAnimation(); },
  }), [flyToPov]);

  // Smooth, eased wheel/pinch zoom (OrbitControls' wheel zoom is stepwise).
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let target: number | null = null;
    let raf = 0;
    const step = () => {
      const g = globe.current;
      if (!g || target === null) { raf = 0; return; }
      const pov = g.pointOfView();
      const next = pov.altitude + (target - pov.altitude) * 0.17;
      g.pointOfView({ lat: pov.lat, lng: pov.lng, altitude: next }, 0);
      if (Math.abs(target - next) < 0.0008) { target = null; raf = 0; return; }
      raf = requestAnimationFrame(step);
    };
    const onWheel = (e: WheelEvent) => {
      const g = globe.current;
      if (!g) return;
      e.preventDefault();
      e.stopPropagation();
      cancelFlight();
      interactRef.current();
      const base = target ?? g.pointOfView().altitude;
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      target = Math.min(3.5, Math.max(0.13, base * Math.exp(delta * (e.ctrlKey ? 0.012 : 0.0018))));
      if (!raf) raf = requestAnimationFrame(step);
    };
    el.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => { el.removeEventListener('wheel', onWheel, { capture: true }); cancelAnimationFrame(raf); };
  }, []);

  // Adaptive quality: if the first second of animation is slow, render fewer pixels.
  const tuneQuality = () => {
    const g = globe.current;
    if (!g) return;
    const dpr = window.devicePixelRatio || 1;
    if (dpr <= 1.25) return;
    const times: number[] = [];
    let last = 0;
    const sample = (now: number) => {
      if (document.hidden) { times.length = 0; last = 0; requestAnimationFrame(sample); return; }
      if (last) times.push(now - last);
      last = now;
      if (times.length < 90) { requestAnimationFrame(sample); return; }
      const sorted = [...times].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      // ~60fps keeps full sharpness; noticeably slower machines trade a little resolution for smoothness.
      const ratio = median > 34 ? 1.25 : median > 21 ? 1.5 : Math.min(dpr, 2);
      g.renderer().setPixelRatio(ratio);
      console.info(`[geoquest] median frame ${median.toFixed(1)}ms → pixel ratio ${ratio}`);
    };
    // Measure after the intro flight settles.
    window.setTimeout(() => requestAnimationFrame(sample), 3200);
  };

  // Auto-rotate only while idle with nothing selected.
  useEffect(() => {
    const ctl = globe.current?.controls();
    if (!ctl) return;
    ctl.autoRotate = autoRotate && !selected;
    ctl.autoRotateSpeed = 0.45;
  }, [autoRotate, selected]);

  const setupControls = () => {
    const g = globe.current!;
    const ctl = g.controls();
    ctl.enableDamping = true;
    ctl.dampingFactor = 0.14; // short, crisp glide instead of a floaty one
    ctl.zoomSpeed = 0.7;
    // Direct manipulation: the point you grab stays under the cursor at any zoom.
    // (globe.gl resets rotateSpeed on every change, so set ours after it.)
    const cam = g.camera() as unknown as { position: THREE.Vector3; fov: number };
    const R = g.getGlobeRadius();
    const tuneSpeed = () => {
      const dist = cam.position.length();
      const discR = (window.innerHeight / 2 / Math.tan((cam.fov * Math.PI) / 360)) * Math.tan(Math.asin(Math.min(1, R / dist)));
      ctl.rotateSpeed = Math.min(1.2, Math.max(0.04, window.innerHeight / (2 * Math.PI * discR)));
    };
    ctl.addEventListener('change', tuneSpeed);
    tuneSpeed();
    ctl.minDistance = g.getGlobeRadius() * 1.12;
    // Always allow zooming out a bit past the home view (which is further out on phones).
    ctl.maxDistance = g.getGlobeRadius() * Math.max(4.5, (homeView().altitude + 1) * 1.15);
    ctl.autoRotate = autoRotate;
    ctl.autoRotateSpeed = 0.45;
    // First touch on the globe stops the spin and cancels any camera flight.
    ctl.addEventListener('start', () => {
      dragging.current = true;
      cancelFlight();
      interactRef.current();
      cursor.set({ dragging: true });
    });
    ctl.addEventListener('end', () => { dragging.current = false; cursor.set({ dragging: false }); });
    g.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Country fills + borders as two merged draws (see countryMesh.ts).
    const layer = buildCountryLayer(FEATURES, R);
    g.scene().add(layer.group);
    countryLayer.current = layer;
    adminLayer.current = createAdminLayer(g.scene(), R);
    natureLayer.current = createNatureLayer(g.scene(), R, g.camera());
    reliefLayer.current = createReliefLayer(g.scene(), R);
    zoomAdmin.current = createZoomAdminLayer(g.scene(), R, g.camera());
    void natureLayer.current.init();
    hoverFx.current = createHoverFx({
      scene: g.scene(), R, features: FEATURES,
      paint: (id, t) => layer.paint([id], () => blendRef.current(id, t)),
    });
    if (import.meta.env.DEV) (window as unknown as { __gq: unknown }).__gq = g;
    setLayerReady(true);
  };

  // Animate the globe offset (panel/chat open) instead of jumping.
  const wide = sidePanel(size.w, size.h);
  const pw = panelWidth(size.w, size.h);
  const sel = selected && !quiz ? BY_CCA3.get(selected) : undefined;
  const panelSide = !!sel || !!feature; // a side panel (country or feature) is open
  const targetX = sideView && wide ? size.w * 0.29 : leftInset / 2 + (panelSide && wide ? -pw / 2 : 0);
  const targetY = sideView && !wide ? size.h * 0.26 : sel && !wide ? -size.h * 0.27 : liftUp ? -Math.min(170, size.h * 0.19) : dropDown ? Math.min(150, size.h * 0.17) : 0;
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  useEffect(() => {
    const [x0, y0] = offsetRef.current;
    if (x0 === targetX && y0 === targetY) return;
    const ctl = animate(0, 1, {
      duration: 0.9, ease: [0.22, 1, 0.36, 1],
      onUpdate: (t) => setOffset([x0 + (targetX - x0) * t, y0 + (targetY - y0) * t]),
    });
    return () => ctl.stop();
  }, [targetX, targetY]);

  // Label layer (political map only)
  useEffect(() => {
    if (!labelLayer.current) return;
    labels.current = createLabelLayer(labelLayer.current, () => globe.current, (f) => featureCb.current?.(f));
    return () => labels.current?.destroy();
  }, []);
  useEffect(() => { labels.current?.setEnabled(style === 'political', !hidden); }, [style, hidden]);
  // Zooming into the selected country reveals its states/provinces and main cities.
  useEffect(() => {
    const id = !quiz && selected ? selected : null;
    if (!id) { labels.current?.setDetail(null, null); return; }
    let live = true;
    void loadAdmin(id).then((d) => { if (live) labels.current?.setDetail(id, d); });
    return () => { live = false; };
  }, [selected, quiz]);
  useEffect(() => { if (labelLayer.current) labelLayer.current.dataset.offset = offset.join(','); }, [offset]);
  useEffect(() => { if (labelLayer.current) labelLayer.current.dataset.panel = panelSide && wide && !sideView ? String(pw) : '0'; }, [panelSide, wide, sideView, pw]);
  // Selected feature: gold river line + highlighted label.
  useEffect(() => {
    natureLayer.current?.highlight(feature?.kind === 'river' ? feature.river ?? null : null);
    labels.current?.setPicked(feature ? { kind: feature.kind, name: feature.name } : null);
  }, [feature, layerReady]);

  const material = useMemo(() => {
    if (style === 'daynight') return createDayNightMaterial();
    const mat = new THREE.MeshPhongMaterial();
    if (style === 'political') {
      // globe.gl's lights are bright (ambient ≈ π) — pick a base that lands on a soft atlas blue once lit.
      mat.color = new THREE.Color('#5b8db8');
      mat.emissive = new THREE.Color('#0f2740');
      mat.emissiveIntensity = 0.25;
      mat.shininess = 6;
    } else {
      // Satellite: we attach the textures ourselves. (three-globe's globeImageUrl loader pins the
      // texture to whichever material was current when the load *started* — if ours lands a beat
      // later the globe stays white.)
      mat.map = loadTexture(TEXTURE.satellite!).t;
      mat.bumpMap = loadTexture('/textures/earth-topology.png', true).t;
      mat.shininess = 9;
    }
    mat.specular = new THREE.Color('#1e293b');
    return mat;
  }, [style]);

  const political = style === 'political';

  // Countries that get lifted 3D treatment (few) — everything else lives in the merged layer.
  const active = useMemo(() => {
    const a = new Set<string>(highlighted);
    if (!quiz && selected) a.add(selected);
    if (feedback) a.add(feedback.cca3);
    return a;
  }, [highlighted, selected, feedback, quiz]);
  const activeFeatures = useMemo(() => FEATURES.filter((f) => f.properties.cca3 && active.has(f.properties.cca3)), [active]);

  // Base fill and hover fill per country; hover is blended in/out over a few frames.
  const baseFill = useCallback((id: string | null): RGBA => {
    if (id && active.has(id)) return [0, 0, 0, 0]; // drawn lifted instead
    if (political) return rgba((id && POLITICAL_COLOR.get(id)) || '#e5e7eb');
    return rgba(selected && !quiz ? 'rgba(4,8,20,0.22)' : 'rgba(255,255,255,0.02)');
  }, [active, political, selected, quiz]);
  const hoverFill = useCallback((id: string | null): RGBA => {
    if (id && active.has(id)) return [0, 0, 0, 0];
    if (political) return rgba(shade((id && POLITICAL_COLOR.get(id)) || '#e5e7eb', -0.2));
    return rgba('rgba(255,236,190,0.36)'); // warm, clearly visible tint
  }, [active, political]);
  const blend = useCallback((id: string | null, t: number): RGBA => {
    const a = baseFill(id);
    if (t <= 0) return a;
    const b = hoverFill(id);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
  }, [baseFill, hoverFill]);
  const blendRef = useRef(blend);
  blendRef.current = blend;

  // Full repaint when the scene state changes (keeping any hover mid-animation).
  useEffect(() => {
    countryLayer.current?.paintAll((id) => blendRef.current(id, hoverFx.current?.strength(id) ?? 0));
  }, [layerReady, active, political, selected, quiz]);
  // Hover: fade the fill and a bright outline in/out.
  useEffect(() => {
    hoverFx.current?.set(hover, !!hover && !active.has(hover));
    prevHover.current = hover;
    // Warm the province/city data for a country you linger on, so a click shows it at once.
    if (hover && !quiz) { const id = hover; const t = window.setTimeout(() => prefetchCountry(id, BY_CCA3.get(id)?.cca2), 120); return () => window.clearTimeout(t); }
  }, [hover, active, layerReady, quiz]);
  useEffect(() => {
    // Games lean on borders (find the country!), so they get a touch more contrast.
    const game = quiz || pickMode;
    if (political) countryLayer.current?.setBorder(game ? 'rgba(30,41,59,0.85)' : 'rgba(51,65,85,0.7)', 'rgba(255,255,255,0.35)');
    else countryLayer.current?.setBorder(game ? 'rgba(255,247,228,0.85)' : 'rgba(255,247,228,0.6)', game ? 'rgba(3,7,18,0.5)' : 'rgba(3,7,18,0.38)');
    hoverFx.current?.setOutlineColor(political ? 'rgba(30,41,59,0.9)' : 'rgba(255,250,235,0.95)');
  }, [political, layerReady, quiz, pickMode]);

  // States / provinces of the selected country, drawn on its raised surface.
  const adminColor = political ? 'rgba(120,53,15,0.55)' : 'rgba(255,248,230,0.72)';
  useEffect(() => {
    adminLayer.current?.show(!quiz && selected ? selected : null, adminColor, 0.04);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, quiz, layerReady]);
  useEffect(() => { adminLayer.current?.recolor(adminColor); }, [adminColor]);
  // Province borders for every country in view once you zoom in.
  useEffect(() => { zoomAdmin.current?.setColor(political ? 'rgba(60,46,34,0.62)' : 'rgba(255,248,230,0.5)'); }, [political, layerReady]);
  useEffect(() => { zoomAdmin.current?.setEnabled(!quiz && !hidden); }, [quiz, hidden, layerReady]);
  useEffect(() => { zoomAdmin.current?.setExclude(!quiz && selected ? selected : null); }, [selected, quiz, layerReady]);

  // Rivers, lakes, ranges & peaks.
  useEffect(() => { natureLayer.current?.setStyle(style); reliefLayer.current?.setStyle(style); }, [style, layerReady]);
  useEffect(() => { natureLayer.current?.setVisible(nature); reliefLayer.current?.setVisible(nature && !quiz); }, [nature, quiz, layerReady]);
  useEffect(() => { void natureLayer.current?.lift(nature && !quiz && selected ? selected : null, 0.04); }, [selected, quiz, nature, layerReady]);
  useEffect(() => {
    let live = true;
    if (!nature) { labels.current?.setNature(null, false); return; }
    void loadNature().then((d) => { if (live) labels.current?.setNature(d, true); });
    return () => { live = false; };
  }, [nature]);

  const capColor = useCallback((f: object) => {
    const id = (f as CountryFeature).properties.cca3;
    if (feedback && id === feedback.cca3) {
      return feedback.kind === 'good' ? 'rgba(52,211,153,0.92)' : feedback.kind === 'bad' ? 'rgba(248,113,113,0.88)' : 'rgba(251,191,36,0.92)';
    }
    if (!quiz && id && id === selected) return political ? '#fbbf24' : 'rgba(251,191,36,0.6)';
    if (id && hl.has(id)) return political ? '#60a5fa' : 'rgba(56,189,248,0.7)';
    const isHover = !!id && id === hover;
    if (political) {
      const base = (id && POLITICAL_COLOR.get(id)) || '#e5e7eb';
      return isHover ? shade(base, -0.12) : base;
    }
    if (isHover) return 'rgba(255,255,255,0.26)';
    return selected && !quiz ? 'rgba(4,8,20,0.22)' : 'rgba(255,255,255,0.02)';
  }, [hover, selected, hl, political, feedback, quiz]);

  // Only the few "active" polygons change altitude, so geometry rebuilds stay cheap.
  const altitude = useCallback((f: object) => {
    const id = (f as CountryFeature).properties.cca3;
    if (feedback && id === feedback.cca3) return 0.05;
    if (!quiz && id && id === selected) return 0.04;
    if (id && hl.has(id)) return 0.02;
    return 0.006;
  }, [selected, hl, feedback, quiz]);

  const strokeColor = useCallback((f: object) => {
    const id = (f as CountryFeature).properties.cca3;
    if (!quiz && id && id === selected) return political ? 'rgba(146,64,14,0.9)' : 'rgba(253,230,138,0.95)';
    return political ? 'rgba(71,85,105,0.55)' : 'rgba(255,255,255,0.2)';
  }, [selected, political, quiz]);

  const sideColor = useCallback(() => (political ? 'rgba(120,113,108,0.35)' : 'rgba(15,23,42,0.35)'), [political]);

  const capPoint = useMemo(
    () => (sel?.capLatLng ? [{ lat: sel.capLatLng[0], lng: sel.capLatLng[1], name: sel.capital[0] }] : []),
    [sel],
  );
  // Live day & night: keep the sun where it really is (and mark the point beneath it).
  const [sunAt, setSunAt] = useState<{ lat: number; lng: number; name: string } | null>(null);
  useEffect(() => {
    if (style !== 'daynight' || !(material instanceof THREE.ShaderMaterial)) { setSunAt(null); return; }
    const tick = () => {
      const now = new Date();
      const s = updateSun(material, now);
      reliefLayer.current?.setSun(s.lng, s.lat);
      setSunAt({ ...s, name: `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')} UTC` });
    };
    tick();
    const t = window.setInterval(tick, 60_000);
    return () => window.clearInterval(t);
  }, [style, material]);

  // The pins' drawing functions stay the same between renders: the globe library rebuilds every
  // pin when they change — which, on each hover (a re-render), made pins flicker and re-drop.
  const htmlAltitude = useCallback((d: object) => { const k = (d as { kind: string }).kind; return k === 'capital' ? 0.045 : k === 'sun' ? 0.02 : k === 'place' ? 0.008 : 0.012; }, []);
  const htmlVisibility = useCallback((el: HTMLElement, visible: boolean) => {
    el.style.opacity = visible ? '' : '0';
    el.style.visibility = visible ? '' : 'hidden';
  }, []);
  const htmlElement = useCallback((d: object) => {
    const it = d as { kind: string; name?: string; id?: string; emoji?: string; tone?: string };
    const el = document.createElement('div');
    if (it.kind === 'place') {
      // My places: an emoji pin with its name; tap to open it.
      el.className = `place-pin k-${it.tone ?? ''}`;
      el.innerHTML = `<button type="button" aria-label="${escapeHtml(it.name ?? '')}"><i><b>${escapeHtml(it.emoji ?? '📍')}</b></i><span>${escapeHtml(it.name ?? '')}</span></button>`;
      el.querySelector('button')!.addEventListener('click', (e) => { e.stopPropagation(); onPinRef.current?.(it.id ?? ''); });
    } else if (it.kind === 'capital') {
      el.className = 'cap-pin';
      el.innerHTML = `<i></i><span>★ ${escapeHtml(it.name ?? '')}</span>`;
    } else if (it.kind === 'sun') {
      el.className = 'sun-pin';
      el.title = `The sun is directly overhead here (${it.name})`;
      el.innerHTML = `<svg viewBox="0 0 40 40" aria-hidden="true"><g class="rays">${Array.from({ length: 8 }, (_, i) =>
        `<rect x="19" y="2.5" width="2" height="6" rx="1" transform="rotate(${i * 45} 20 20)"/>`).join('')}</g><circle cx="20" cy="20" r="7.5"/></svg><span>Midday here</span>`;
    } else {
      el.className = `game-pin ${it.kind}`;
      el.innerHTML = '<span></span>';
    }
    return el;
  }, []);

  const htmlItems = useMemo(
    () => [
      ...(political ? [] : capPoint.map((c) => ({ ...c, kind: 'capital' as const }))),
      ...(sunAt ? [{ ...sunAt, kind: 'sun' as const }] : []),
      ...pins,
    ],
    [political, capPoint, pins, sunAt],
  );

  return (
    <>
      <div ref={wrap} className={`globe-wrap ${hidden ? 'is-hidden' : ''}`} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <Globe
        ref={globe}
        width={size.w}
        height={size.h}
        rendererConfig={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        backgroundColor="rgba(0,0,0,0)"
        backgroundImageUrl="/textures/night-sky.png"
        globeImageUrl={null}
        bumpImageUrl={null}
        globeMaterial={material}
        showAtmosphere
        atmosphereColor={political ? '#bae6fd' : '#7dd3fc'}
        atmosphereAltitude={0.2}
        animateIn={false}
        globeOffset={offset}
        onGlobeReady={() => {
          setupControls();
          const home = homeView();
          globe.current?.pointOfView({ ...home, altitude: home.altitude + 1.85 }, 0);
          requestAnimationFrame(() => flyToPov(home, 2600));
          tuneQuality();
          // Lift the boot screen only once the globe's imagery is in (never a white globe).
          const needs = style === 'political' ? [] : style === 'daynight'
            ? [loadTexture(TEXTURE.satellite!).ready, loadTexture('/textures/earth-night.jpg').ready]
            : [loadTexture(TEXTURE.satellite!).ready];
          void Promise.all(needs).then(() => onReady());
        }}
        polygonsData={activeFeatures}
        polygonCapColor={capColor}
        polygonSideColor={sideColor}
        polygonStrokeColor={strokeColor}
        polygonAltitude={altitude}
        polygonCapCurvatureResolution={6}
        polygonsTransitionDuration={450}
        enablePointerInteraction={false}
        ringsData={capPoint}
        ringColor={() => (t: number) => (political ? `rgba(180,83,9,${1 - t})` : `rgba(253,224,71,${1 - t})`)}
        ringMaxRadius={2.2}
        ringPropagationSpeed={1.6}
        ringRepeatPeriod={1100}
        ringAltitude={0.042}
        htmlElementsData={htmlItems}
        htmlAltitude={htmlAltitude}
        htmlTransitionDuration={0}
        // Pins round the back of the globe: hidden (and not tappable), not floating faintly in space.
        htmlElementVisibilityModifier={htmlVisibility}
        htmlElement={htmlElement}
        arcsData={arcs}
        arcColor={() => ['rgba(251,191,36,0.95)', 'rgba(52,211,153,0.95)']}
        arcStroke={0.9}
        arcAltitudeAutoScale={0.35}
        arcDashLength={0.5}
        arcDashGap={0.15}
        arcDashInitialGap={1}
        arcDashAnimateTime={1600}
        arcsTransitionDuration={0}
      />
      </div>
      <div ref={labelLayer} className={`map-labels ${quiz ? 'quiz' : ''} ${style === 'political' ? '' : 'dark'}`} aria-hidden />
    </>
  );
});
