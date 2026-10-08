import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, animate } from 'motion/react';
import { Viewer } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import { CompassPlugin } from '@photo-sphere-viewer/compass-plugin';
import { VirtualTourPlugin, type VirtualTourNode } from '@photo-sphere-viewer/virtual-tour-plugin';
import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/markers-plugin/index.css';
import '@photo-sphere-viewer/compass-plugin/index.css';
import '@photo-sphere-viewer/virtual-tour-plugin/index.css';
import { RotateCw, ChevronDown, ChevronUp, ExternalLink, Flag, KeyRound, Loader2, LocateFixed, Maximize2, MapPin, Minimize2, RotateCcw, Trophy, X, Footprints } from 'lucide-react';
import { Viewer as MlyViewer, NavigationDirection } from 'mapillary-js';
import 'mapillary-js/dist/mapillary.css';
import * as maplibregl from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { BY_CCA3, flagUrl, fmtInt } from '../lib/data';
import { getItem, prefetchAround, type StreetItem } from '../lib/streetview';
import type { MapillarySpot } from '../lib/mapillary';
import { api } from '../lib/api';
import { Click, TOUCH } from '../lib/touch';
import { escapeHtml } from '../lib/html';
import { MusicButton } from './MusicButton';


export interface RoundResult {
  km: number;
  score: number;
  answer: { lat: number; lng: number };
  guess: { lat: number; lng: number };
  country: string | null;
  guessCountry: string | null;
}

export type Spot = MapillarySpot | (StreetItem & { provider: 'panoramax' });

export interface GeoGame {
  round: number;
  totalRounds: number;
  results: RoundResult[];
  status: 'setup' | 'loading' | 'play' | 'result' | 'final' | 'error';
  item: Spot | null;
  guess: { lat: number; lng: number } | null;
  error?: string;
}

// ── Street-level viewer ──────────────────────────────────────
function panoDataFor(it: StreetItem) {
  return (img: HTMLImageElement) => {
    it.aspect = img.height / img.width;
    if (it.is360) return { fullWidth: img.width, fullHeight: img.height, croppedWidth: img.width, croppedHeight: img.height, croppedX: 0, croppedY: 0, poseHeading: it.heading };
    const fullWidth = Math.round((img.width * 360) / it.fov);
    const fullHeight = Math.round(fullWidth / 2);
    return {
      fullWidth, fullHeight, croppedWidth: img.width, croppedHeight: img.height,
      croppedX: Math.round((fullWidth - img.width) / 2), croppedY: Math.max(0, Math.round((fullHeight - img.height) / 2)),
      poseHeading: it.heading,
    };
  };
}

function toNode(it: StreetItem, preview = false): VirtualTourNode {
  const links = [it.next, it.prev].filter(Boolean).map((l) => ({ nodeId: l!.id, gps: [l!.lng, l!.lat] as [number, number] }));
  return {
    id: it.id,
    panorama: preview && it.is360 ? it.preview : it.image,
    gps: [it.lng, it.lat],
    links,
    // Orient every image so yaw 0 = north; flat photos become a partial sphere of their field of view.
    panoData: panoDataFor(it),
  };
}

// The tour plugin can reject a pending preload after its viewer is destroyed (round
// change / exit). That's expected — swallow just that one so real errors stay visible.
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason instanceof TypeError && String(e.reason.message).includes("reading 'loadNode'")) e.preventDefault();
});

const D = Math.PI / 180;
const bearing = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const φ1 = a.lat * D, φ2 = b.lat * D, Δλ = (b.lng - a.lng) * D;
  return Math.atan2(Math.sin(Δλ) * Math.cos(φ2), Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ));
};
const angleDiff = (a: number, b: number) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);

function PanoramaxViewer({ item, onError, onMoved }: { item: StreetItem; onError: () => void; onMoved: (steps: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const currentRef = useRef(item);
  const movingRef = useRef(false);
  const pendingRef = useRef<'forward' | 'back' | null>(null);
  const moveRef = useRef<(dir: 'forward' | 'back') => void>(() => {});
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);
  const [cur, setCur] = useState(item);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const collectionOf = new Map<string, string>([[item.id, item.collection]]);
    const items = new Map<string, StreetItem>([[item.id, item]]);
    const register = (it: StreetItem) => { items.set(it.id, it); [it.prev, it.next].forEach((l) => l && collectionOf.set(l.id, it.collection)); };
    currentRef.current = item;
    register(item);
    prefetchAround(item);
    let steps = 0;
    const hdReady = new Set<string>();
    let reloading = false;
    let overArrow = false;
    let dragging = false;

    const v = new Viewer({
      container: host.current!,
      navbar: false,
      loadingTxt: '',
      defaultYaw: item.heading * D,
      defaultZoomLvl: item.is360 ? 30 : 0,
      mousewheelCtrlKey: false,
      touchmoveTwoFingers: false,
      moveInertia: 0.92,
      moveSpeed: 1.2,
      keyboard: false,
      plugins: [
        [MarkersPlugin, {}],
        [CompassPlugin, { size: '84px', position: 'top left', navigation: false }],
        [VirtualTourPlugin, {
          dataMode: 'server',
          positionMode: 'gps',
          renderMode: '3d',
          startNodeId: item.id,
          preload: true,
          // Quick crossfade, no camera swing: feels like stepping, not teleporting.
          transitionOptions: { showLoader: false, speed: 350, effect: 'fade', rotation: false },
          getNode: async (id: string) => {
            const it = id === item.id ? item : await getItem(collectionOf.get(id) ?? item.collection, id);
            register(it);
            return toNode(it, !hdReady.has(id));
          },
        }],
      ],
    });
    viewer.current = v;
    const tour = v.getPlugin(VirtualTourPlugin) as VirtualTourPlugin;

    // Regular photos cover only part of the sphere. Let the drag move freely, then
    // spring back inside the photo on release (no fighting the mouse).
    const photoRange = () => {
      const c = currentRef.current;
      const hfov = c.fov * D, vfov = hfov * (c.aspect ?? 0.75);
      return {
        center: c.heading * D,
        yawHalf: Math.max(0, (hfov - v.state.hFov * D) / 2),
        pitchHalf: Math.max(0, (vfov - v.state.vFov * D) / 2),
      };
    };
    const settleIntoPhoto = () => {
      const c = currentRef.current;
      if (c.is360 || dragging) return;
      const pos = v.getPosition();
      const R = photoRange();
      const dy = ((pos.yaw - R.center + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const cy = Math.max(-R.yawHalf, Math.min(R.yawHalf, dy));
      const cp = Math.max(-R.pitchHalf, Math.min(R.pitchHalf, pos.pitch));
      if (Math.abs(cy - dy) > 0.002 || Math.abs(cp - pos.pitch) > 0.002) {
        v.animate({ yaw: R.center + cy, pitch: cp, speed: 600 });
      }
    };
    const applyLens = () => {
      const c = currentRef.current;
      if (c.is360) { v.setOption('maxFov', 90); return; }
      v.setOption('maxFov', Math.max(30, Math.min(75, (c.fov * (c.aspect ?? 0.75)) * 0.8)));
      v.zoom(0);
      v.rotate({ yaw: c.heading * D, pitch: 0 });
    };
    const onDown = () => { dragging = true; };
    const onUp = () => { dragging = false; window.setTimeout(settleIntoPhoto, 120); };
    host.current!.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);

    // Swap the light preview for the full-resolution image once downloaded —
    // through the tour plugin, so arrows and navigation state stay intact.
    const sharpen = (it: StreetItem) => {
      if (!it.is360 || it.preview === it.image || hdReady.has(it.id)) return;
      const hd = new Image();
      hd.crossOrigin = 'anonymous';
      hd.onload = () => {
        hdReady.add(it.id);
        if (currentRef.current.id !== it.id || viewer.current !== v || movingRef.current || pendingRef.current) return;
        reloading = true;
        tour.setCurrentNode(it.id, { forceUpdate: true, effect: 'fade', speed: 250, showLoader: false, rotation: false })
          .catch(() => null)
          .finally(() => { reloading = false; });
      };
      hd.src = it.image;
    };

    const giveUp = window.setTimeout(() => onError(), 20000);
    let first = true;
    v.addEventListener('panorama-loaded', () => {
      setLoading(false);
      window.clearTimeout(giveUp);
      if (first) { first = false; if (!item.is360) applyLens(); window.setTimeout(() => sharpen(item), 400); }
    });
    v.addEventListener('panorama-error', () => onError());

    // Mouse: click the ground to walk that way (arrows also work).
    tour.addEventListener('enter-arrow', () => { overArrow = true; });
    tour.addEventListener('leave-arrow', () => { overArrow = false; });
    v.addEventListener('click', ({ data }) => {
      if (data.rightclick || overArrow) return;
      if (data.pitch > 0.12) { setHint(`${Click} the road below the horizon to walk`); window.setTimeout(() => setHint(null), 1600); return; }
      moveTowards(data.yaw);
    });

    tour.addEventListener('node-changed', ({ node }) => {
      if (reloading && node.id === currentRef.current.id) return; // just sharpened, not a step
      const it = items.get(node.id) ?? currentRef.current;
      const wasFlat = !currentRef.current.is360;
      currentRef.current = it;
      movingRef.current = false;
      setCur(it);
      setMoving(false);
      if (!it.is360 || wasFlat) applyLens();
      prefetchAround(it);
      steps += 1;
      onMoved(steps - 1);
      // Held key / queued press: keep walking straight away.
      const next = pendingRef.current;
      pendingRef.current = null;
      if (next) requestAnimationFrame(() => moveRef.current(next));
      else window.setTimeout(() => sharpen(it), 350);
    });


    function go(target: string) {
      movingRef.current = true;
      setMoving(true);
      tour.setCurrentNode(target)
        .then((ok) => { if (!ok) { movingRef.current = false; setMoving(false); } })
        .catch(() => { movingRef.current = false; setMoving(false); });
    }

    function linksOf(c: StreetItem) {
      return ([c.next, c.prev].filter(Boolean) as NonNullable<StreetItem['next']>[])
        .map((l) => ({ l, b: l.lat === c.lat && l.lng === c.lng ? (l === c.next ? c.heading * D : c.heading * D + Math.PI) : bearing(c, l) }));
    }

    function moveTowards(yaw: number) {
      if (movingRef.current) return;
      const best = linksOf(currentRef.current).map((x) => ({ ...x, d: angleDiff(x.b, yaw) })).sort((a, b) => a.d - b.d)[0];
      if (best && best.d < Math.PI / 2.4) go(best.l.id);
      else { setHint('No road that way — try the arrows'); window.setTimeout(() => setHint(null), 1600); }
    }

    // "Forward" = the neighbour closest to where you're looking.
    moveRef.current = (dir) => {
      if (movingRef.current) { pendingRef.current = dir; return; }
      const links = linksOf(currentRef.current);
      if (!links.length) return;
      const yaw = v.getPosition().yaw;
      const ranked = links.map((x) => ({ ...x, d: angleDiff(x.b, yaw) })).sort((a, b) => a.d - b.d);
      const pick = dir === 'forward' ? ranked[0] : ranked[ranked.length - 1];
      if (dir === 'forward' && pick.d > Math.PI * 0.6) return;
      if (dir === 'back' && pick.d < Math.PI * 0.4) return;
      go(pick.l.id);
    };

    return () => {
      window.clearTimeout(giveUp);
      window.removeEventListener('pointerup', onUp);
      v.destroy();
      viewer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const backToStart = () => {
    const tour = viewer.current?.getPlugin(VirtualTourPlugin) as VirtualTourPlugin | undefined;
    pendingRef.current = null;
    tour?.setCurrentNode(item.id);
  };

  const canWalk = !!(cur.next || cur.prev);

  return (
    <div className="sv-viewer">
      <div ref={host} className="sv-host" />
      <AnimatePresence>
        {loading && (
          <motion.div className="sv-loading" exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
            <MiniLoader />
            <span>Dropping you somewhere on Earth…</span>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {hint && (
          <motion.div className="sv-hint" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{hint}</motion.div>
        )}
      </AnimatePresence>
      {!loading && canWalk && (
        <div className="sv-walk">
          <button onClick={() => moveRef.current('back')} title="Step back"><ChevronDown size={18} /></button>
          <span className={moving ? 'is-moving' : ''}>{moving ? <><i className="sv-dot" /> Walking</> : 'Walk'}</span>
          <button onClick={() => moveRef.current('forward')} title="Step forward"><ChevronUp size={18} /></button>
          <i className="sv-walk-sep" />
          <button onClick={backToStart} title="Back to start"><LocateFixed size={16} /></button>
        </div>
      )}
      {!loading && !canWalk && <button className="sv-btn sv-start" onClick={backToStart} title="Back to start"><LocateFixed size={16} /></button>}
      {!loading && !cur.is360 && <div className="sv-badge">Photo · limited view</div>}
      <div className="sv-credit">Imagery: {cur.author} · {cur.license} · Panoramax</div>
    </div>
  );
}

function MiniLoader() {
  return (
    <div className="mini-loader" aria-hidden>
      <div className="loader-bounce"><div className="loader-globe" /></div>
      <div className="loader-shadow" />
    </div>
  );
}

// ── Mapillary viewer ─────────────────────────────────────────
// Navigation is driven by where you're LOOKING: every neighbouring photo
// (sequence + spatial edges) has a direction of travel, and W/S pick the one
// most in front of / behind the camera. (Mapillary's "Next" follows capture
// order, which points backwards whenever the camera faces against travel.)
type Edge = { target: string; bearing: number; seq: boolean };
const toBearing = (azimuthRad: number) => ((90 - (azimuthRad * 180) / Math.PI) % 360 + 360) % 360;
const degDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const bearingTo = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180, y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
};
const STEP_DIRS = new Set([NavigationDirection.Next, NavigationDirection.Prev, NavigationDirection.StepForward, NavigationDirection.StepBackward,
  NavigationDirection.StepLeft, NavigationDirection.StepRight, NavigationDirection.Spherical]);

function MapillaryViewer({ token, spot, onError, onMoved }: { token: string; spot: MapillarySpot; onError: () => void; onMoved: (steps: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<MlyViewer | null>(null);
  const walkRef = useRef<(dir: 'forward' | 'back') => void>(() => {});
  const holdRef = useRef<(dir: 'forward' | 'back' | null) => void>(() => {});
  const turnRef = useRef<(deg: number) => void>(() => {});
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number; far: boolean }[]>([]);
  const [gliding, setGliding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);
  const [can, setCan] = useState({ forward: false, back: false });
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    let steps = 0;
    let first = true;
    let seqEdges: Edge[] = [];
    let spatialEdges: Edge[] = [];
    let bearing = spot.pano ? 0 : 0;
    let here = { lat: spot.lat, lng: spot.lng };
    let movingNow = false;
    let currentId = spot.id;
    let edgesFresh = false; // edges belong to the photo we're on
    let pending: 'forward' | 'back' | null = null;
    let hold: 'forward' | 'back' | null = null; // a walk button held down
    let glide: { to: { lat: number; lng: number }; left: number; lastDist: number } | null = null; // double-tap: go there
    let hintTimer = 0;
    const say = (t: string) => { setHint(t); window.clearTimeout(hintTimer); hintTimer = window.setTimeout(() => setHint(null), 1600); };

    const v = new MlyViewer({
      accessToken: token,
      container: host.current!,
      imageId: spot.id,
      component: {
        cover: false,
        attribution: true,
        bearing: true,
        cache: true,
        // Mapillary's ground arrows: helpful with a mouse; on phones they sit on top of our walk bar
        // (tap / double-tap / hold-to-walk cover it there).
        direction: TOUCH || window.innerWidth <= 600 ? false : { minWidth: 260, maxWidth: 520 },
        keyboard: false,
        zoom: true, sequence: false, spatial: false, tag: false, popup: false, slider: false, marker: false,
      },
    });
    viewerRef.current = v;

    // Rotation goes through the viewer's own state service (what its mouse-drag uses).
    // Public getCenter()/setCenter() return NaN on 360° images before the first render,
    // and feeding NaN back in freezes the camera — so we never use them.
    type Rotator = { rotateWithoutInertia: (d: { phi: number; theta: number }) => void };
    const rotator = (v as unknown as { _navigator?: { stateService?: Rotator } })._navigator?.stateService;
    const rotate = (phi: number) => {
      if (!rotator || !Number.isFinite(phi) || phi === 0) return;
      rotator.rotateWithoutInertia({ phi, theta: 0 });
    };
    const DEG = Math.PI / 180;
    let panRaf = 0;
    /** Smoothly pan the camera by `deg` degrees (clockwise +) over `ms`. */
    const panBy = (deg: number, ms: number) => {
      cancelAnimationFrame(panRaf);
      const t0 = performance.now();
      let done = 0;
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const target = deg * e;
        rotate(-(target - done) * DEG); // +phi turns left
        done = target;
        if (t < 1) panRaf = requestAnimationFrame(step);
      };
      panRaf = requestAnimationFrame(step);
    };

    const edges = () => {
      const all = new Map<string, Edge>();
      for (const e of [...seqEdges, ...spatialEdges]) if (e.target !== currentId && (!all.has(e.target) || e.seq)) all.set(e.target, e);
      return [...all.values()];
    };
    const best = (heading: number, maxDiff: number) => edges()
      .map((e) => ({ e, d: degDiff(e.bearing, heading) - (e.seq ? 6 : 0) })) // small preference for staying on the road
      .filter((x) => x.d <= maxDiff)
      .sort((a, b) => a.d - b.d)[0]?.e;
    const refreshCan = () => setCan({ forward: !!best(bearing, 75), back: !!best(bearing + 180, 75) });

    // Start each round facing down the road (like GeoGuessr), not at a wall or dead end.
    let oriented = false, touched = false, ready = false;
    const orient = async () => {
      if (oriented || touched || steps > 0 || !ready) return;
      const es = edges();
      if (!es.length) return;
      oriented = true;
      if (best(bearing, 60)) return; // already facing a way forward
      const img = await v.getImage();
      if (img.cameraType !== 'spherical') return; // can't swing round a flat photo
      const target = (es.find((e) => e.seq) ?? es[0]).bearing;
      const delta = ((target - bearing + 540) % 360) - 180; // degrees, + = clockwise
      panBy(delta, 700);
    };

    const toEdges = (status: { cached: boolean; edges: { target: string; data: { direction: NavigationDirection; worldMotionAzimuth: number } }[] }, seq: boolean) =>
      status.edges.filter((e) => STEP_DIRS.has(e.data.direction)).map((e) => ({ target: e.target, bearing: toBearing(e.data.worldMotionAzimuth), seq }));
    const onEdges = () => {
      edgesFresh = true;
      refreshCan();
      void orient();
      // A key pressed while the neighbours were still loading: act on it now.
      if (pending && !movingNow) { const d = pending; pending = null; walk(d); }
      else continueGlide();
    };
    v.on('sequenceedges', (e) => { if (e.status.cached) { seqEdges = toEdges(e.status, true); onEdges(); } });
    v.on('spatialedges', (e) => { if (e.status.cached) { spatialEdges = toEdges(e.status, false); onEdges(); } });
    // While a step is in flight, hold on to the heading the player chose.
    let headingLock = false;
    v.on('bearing', (e) => { if (!headingLock) { bearing = e.bearing; refreshCan(); } });

    // Keep facing the same way across steps (Mapillary otherwise snaps to each photo's default view).
    let keepHeading: number | null = null;
    const go = (target: string) => {
      if (target === currentId) return;
      keepHeading = bearing;
      headingLock = true;
      movingNow = true;
      setMoving(true);
      v.moveTo(target).catch(() => { movingNow = false; setMoving(false); pending = null; headingLock = false; });
    };

    const walk = (dir: 'forward' | 'back') => {
      if (movingNow || !edgesFresh) { pending = dir; return; }
      const e = best(dir === 'forward' ? bearing : bearing + 180, 75);
      if (e) go(e.target);
      else say(dir === 'forward' ? 'No road ahead — turn around or try another way' : 'Nothing behind you');
    };
    walkRef.current = walk;
    holdRef.current = (dir) => { hold = dir; glide = null; setGliding(false); if (dir) walk(dir); else pending = null; };
    turnRef.current = (deg) => { touched = true; panBy(deg, 380); };

    // ── Tapping the street ──
    const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const k = Math.PI / 180, x = (b.lng - a.lng) * k * Math.cos(((a.lat + b.lat) / 2) * k), y = (b.lat - a.lat) * k;
      return Math.hypot(x, y) * 6371000;
    };
    const stepToward = (to: { lat: number; lng: number }, maxDiff: number) => {
      const e = best(bearingTo(here, to), maxDiff);
      if (e) go(e.target);
      return !!e;
    };
    const stopGlide = () => { glide = null; setGliding(false); };
    /** Double-tap: keep stepping toward the spot until we're there (or the road runs out). */
    function continueGlide() {
      if (!glide || movingNow || !edgesFresh) return;
      const d = metres(here, glide.to);
      if (d < 7 || glide.left <= 0 || d > glide.lastDist + 3) { stopGlide(); return; }
      glide.lastDist = d;
      glide.left -= 1;
      if (!stepToward(glide.to, 55)) { if (glide.left === 13) say('No road that way'); stopGlide(); }
    }
    const tapAt = async (px: [number, number], far: boolean) => {
      touched = true;
      const ll = await v.unproject(px).catch(() => null);
      if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lng)) { say(`${Click} the road to walk that way`); return; }
      if (far) {
        glide = { to: ll, left: 14, lastDist: Infinity };
        setGliding(true);
        if (movingNow || !edgesFresh) return; // carries on when the current step lands
        continueGlide();
        return;
      }
      stopGlide();
      if (movingNow || !edgesFresh) return;
      if (!stepToward(ll, 50)) say('No road that way — try another direction');
    };
    // Our own tap detection (MapillaryJS has no double-click action, and iOS rarely sends dblclick):
    // one tap = a step toward that spot; two quick taps = go there.
    const el = host.current!;
    let down: { x: number; y: number; t: number } | null = null;
    let lastTap: { x: number; y: number; t: number } | null = null;
    let tapTimer = 0, rippleId = 0;
    const ripple = (x: number, y: number, far: boolean) => {
      const id = ++rippleId;
      setRipples((r) => [...r.slice(-3), { id, x, y, far }]);
      window.setTimeout(() => setRipples((r) => r.filter((q) => q.id !== id)), 700);
    };
    const onDown = (e: PointerEvent) => {
      down = e.target instanceof HTMLCanvasElement && e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
      if (down) { touched = true; if (glide) stopGlide(); }
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > (e.pointerType === 'touch' ? 12 : 6) || performance.now() - d.t > 450) return;
      const r = el.getBoundingClientRect();
      const px: [number, number] = [e.clientX - r.left, e.clientY - r.top];
      const now = performance.now();
      if (lastTap && now - lastTap.t < 320 && Math.hypot(px[0] - lastTap.x, px[1] - lastTap.y) < 45) {
        window.clearTimeout(tapTimer);
        lastTap = null;
        ripple(px[0], px[1], true);
        void tapAt(px, true);
        return;
      }
      lastTap = { x: px[0], y: px[1], t: now };
      tapTimer = window.setTimeout(() => { lastTap = null; ripple(px[0], px[1], false); void tapAt(px, false); }, 260);
    };
    el.addEventListener('pointerdown', onDown, true);
    el.addEventListener('pointerup', onUp, true);

    const giveUp = window.setTimeout(() => { if (first) onError(); }, 20000);
    v.on('image', (e) => {
      here = e.image.lngLat;
      // New photo: its neighbours arrive via the edge events — drop the old ones now.
      if (e.image.id !== currentId) { currentId = e.image.id; seqEdges = []; spatialEdges = []; edgesFresh = false; refreshCan(); }
      movingNow = false;
      setMoving(false);
      if (first) {
        first = false;
        window.clearTimeout(giveUp);
        setLoading(false);
        // Let the first frame render before touching the camera.
        window.setTimeout(() => { ready = true; void orient(); }, 350);
      } else {
        steps += 1;
        onMoved(steps);
        const want = keepHeading;
        keepHeading = null;
        if (want != null && e.image.cameraType === 'spherical') {
          // Wait a beat for the viewer to settle on the new photo, then glide back to the heading.
          window.setTimeout(() => {
            void v.getBearing().then((now) => {
              const delta = ((want - now + 540) % 360) - 180;
              if (Math.abs(delta) > 4) panBy(delta, 260);
              window.setTimeout(() => { if (!movingNow) { headingLock = false; void v.getBearing().then((b) => { bearing = b; refreshCan(); }); } }, 300);
            });
          }, 60);
        } else {
          headingLock = false;
          void v.getBearing().then((b) => { bearing = b; refreshCan(); });
        }
      }
      // Keep walking if a key is held / a press was queued (runs once the new
      // photo's neighbours are known — see onEdges).
      if (hold && !pending) pending = hold;
      if (pending && edgesFresh) { const next = pending; pending = null; requestAnimationFrame(() => walk(next)); }
      else if (glide && edgesFresh) requestAnimationFrame(continueGlide);
    });

    v.on('mousedown', () => { touched = true; });

    const onBlur = () => { pending = null; hold = null; };
    window.addEventListener('blur', onBlur);
    return () => {
      window.clearTimeout(giveUp);
      window.clearTimeout(hintTimer);
      window.clearTimeout(tapTimer);
      el.removeEventListener('pointerdown', onDown, true);
      el.removeEventListener('pointerup', onUp, true);
      cancelAnimationFrame(panRaf);
      window.removeEventListener('blur', onBlur);
      v.remove();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot.id, token]);

  const backToStart = () => { void viewerRef.current?.moveTo(spot.id).catch(() => null); };
  // Walk buttons: press = one step, hold = keep walking until released.
  const holdProps = (dir: 'forward' | 'back') => ({
    onPointerDown: (e: React.PointerEvent) => { e.currentTarget.setPointerCapture?.(e.pointerId); holdRef.current(dir); },
    onPointerUp: () => holdRef.current(null),
    onPointerCancel: () => holdRef.current(null),
    onLostPointerCapture: () => holdRef.current(null),
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); walkRef.current(dir); } },
  });

  return (
    <div className="sv-viewer">
      <div ref={host} className="sv-host mly" />
      <AnimatePresence>
        {loading && (
          <motion.div className="sv-loading" exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
            <MiniLoader />
            <span>Dropping you somewhere on Earth…</span>
          </motion.div>
        )}
      </AnimatePresence>
      {ripples.map((r) => <i key={r.id} className={`sv-ripple ${r.far ? 'far' : ''}`} style={{ left: r.x, top: r.y }} />)}
      <AnimatePresence>
        {hint && <motion.div className="sv-hint" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{hint}</motion.div>}
      </AnimatePresence>
      {!loading && (
        <div className="sv-walk mly-walk">
          <button className="sv-turn" onClick={() => turnRef.current(-45)} title="Look left" aria-label="Look left"><RotateCcw size={16} /></button>
          <button {...holdProps('back')} disabled={!can.back} title="Step back — hold to keep walking" aria-label="Step back"><ChevronDown size={18} /></button>
          <span className={moving || gliding ? 'is-moving' : ''}>{gliding ? <><i className="sv-dot" /> Going there</> : moving ? <><i className="sv-dot" /> Walking</> : 'Hold to walk'}</span>
          <button {...holdProps('forward')} disabled={!can.forward} title="Step forward — hold to keep walking" aria-label="Step forward"><ChevronUp size={18} /></button>
          <button className="sv-turn" onClick={() => turnRef.current(45)} title="Look right" aria-label="Look right"><RotateCw size={16} /></button>
          <i className="sv-walk-sep" />
          <button onClick={backToStart} title="Back to start" aria-label="Back to start"><LocateFixed size={16} /></button>
        </div>
      )}
    </div>
  );
}

// ── Maps (MapLibre + OpenFreeMap, keyless) ───────────────────
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
// Point MapLibre at a bundled copy of its tile worker (works in dev and production builds).
maplibregl.setWorkerUrl(mapWorkerUrl);

/** Credits stay available behind the ⓘ button instead of covering the map. */
function collapseAttribution(root: HTMLElement) {
  const tick = () => root.querySelectorAll('.maplibregl-compact-show').forEach((el) => el.classList.remove('maplibregl-compact-show'));
  [50, 400, 1500].forEach((ms) => window.setTimeout(tick, ms));
}

function pinEl(kind: 'guess' | 'answer', label?: string) {
  const el = document.createElement('div');
  el.className = `game-pin map ${kind}`;
  el.innerHTML = `<span></span>${label ? `<b>${escapeHtml(label)}</b>` : ''}`;
  return el;
}

/** Make the basemap easier to guess on: bolder country borders, clearer country names. */
function emphasiseCountries(m: maplibregl.Map) {
  for (const layer of m.getStyle()?.layers ?? []) {
    const id = layer.id;
    try {
      if (layer.type === 'line' && /boundary/.test(id) && !/disputed|admin_?[4-9]|_[3-9]$/.test(id)) {
        m.setPaintProperty(id, 'line-color', '#5f6f8f');
        m.setPaintProperty(id, 'line-width', ['interpolate', ['linear'], ['zoom'], 0, 0.9, 4, 1.6, 8, 2.2]);
        m.setPaintProperty(id, 'line-opacity', 0.9);
      }
      if (layer.type === 'symbol' && /country/.test(id)) {
        m.setPaintProperty(id, 'text-color', '#1f2a44');
        m.setPaintProperty(id, 'text-halo-color', 'rgba(255,255,255,0.95)');
        m.setPaintProperty(id, 'text-halo-width', 1.6);
      }
    } catch { /* a layer without that property — skip */ }
  }
}

const SIZE_KEY = 'gq-guessmap-size';
/** GeoGuessr-style mini map: small in the corner, grows on hover, click to drop a pin (drag to adjust). */
function GuessMap({ round, guess, onPick, onGuess }: { round: number; guess: { lat: number; lng: number } | null; onPick: (lat: number, lng: number) => void; onGuess: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const [hover, setHover] = useState(false);
  const leaveT = useRef(0);
  const [pinned, setPinned] = useState(false); // touch: the map is open
  // Touch / small screens: a thumbnail in the corner; tap it to open the map, then guess.
  const [compact] = useState(() => TOUCH || window.innerWidth <= 600);
  // Desktop: three sizes (− / +), remembered; hovering the smallest one grows it a step.
  const [level, setLevel] = useState(() => { try { return Math.min(2, Math.max(0, Number(localStorage.getItem(SIZE_KEY)) || 0)); } catch { return 0; } });
  const changeLevel = (d: number) => setLevel((l) => { const n = Math.min(2, Math.max(0, l + d)); try { localStorage.setItem(SIZE_KEY, String(n)); } catch { /* ignore */ } return n; });
  const size = compact ? (pinned ? 2 : 0) : Math.max(level, hover ? 1 : 0);
  const big = compact ? pinned : size > 0;

  useEffect(() => {
    const m = new maplibregl.Map({
      container: host.current!, style: MAP_STYLE, center: [10, 25], zoom: 0.4,
      attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false, maxPitch: 0,
    });
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    collapseAttribution(host.current!);
    m.touchZoomRotate.disableRotation();
    m.on('click', (e) => pickRef.current(e.lngLat.lat, ((e.lngLat.lng + 540) % 360) - 180));
    m.once('load', () => { host.current?.parentElement?.classList.add('ready'); emphasiseCountries(m); }); // stop the placeholder shimmer
    const ro = new ResizeObserver(() => { m.resize(); m.redraw(); }) // repaint in the same frame, or the canvas stays blank while the dock grows;
    ro.observe(host.current!);
    map.current = m;
    return () => { ro.disconnect(); m.remove(); };
  }, []);

  // New round: zoom back out, clear the pin.
  useEffect(() => {
    marker.current?.remove();
    marker.current = null;
    map.current?.jumpTo({ center: [10, 25], zoom: 0.4 });
    if (compact) setPinned(false);
  }, [round, compact]);

  useEffect(() => {
    if (!map.current) return;
    if (!guess) { marker.current?.remove(); marker.current = null; return; }
    if (!marker.current) {
      // Drag the pin to fine-tune the guess.
      const mk = new maplibregl.Marker({ element: pinEl('guess'), anchor: 'bottom', draggable: true }).setLngLat([guess.lng, guess.lat]).addTo(map.current);
      mk.on('dragend', () => { const p = mk.getLngLat(); pickRef.current(p.lat, ((p.lng + 540) % 360) - 180); });
      marker.current = mk;
    } else marker.current.setLngLat([guess.lng, guess.lat]);
  }, [guess]);

  return (
    <div className={`guess-dock size-${size} ${big ? 'big' : ''} ${compact ? 'compact' : ''}`} onMouseEnter={compact ? undefined : () => { window.clearTimeout(leaveT.current); setHover(true); }} onMouseLeave={compact ? undefined : () => { leaveT.current = window.setTimeout(() => setHover(false), 380); }}>
      <div className="guess-map-wrap">
        <div ref={host} className="guess-map" />
        {compact && !big ? (
          <button className="gm-open" onClick={() => setPinned(true)} aria-label="Open the map to place your guess">
            <MapPin size={13} /> {guess ? 'Your pin' : `${Click} to guess`}
          </button>
        ) : compact ? (
          <button className="gm-pin" onClick={() => setPinned(false)} title="Back to the street" aria-label="Shrink map"><Minimize2 size={14} /></button>
        ) : (
          <div className="gm-size" role="group" aria-label="Map size">
            <button onClick={() => changeLevel(-1)} disabled={level === 0} title="Smaller map" aria-label="Smaller map"><Minimize2 size={13} /></button>
            <button onClick={() => changeLevel(1)} disabled={level === 2} title="Bigger map" aria-label="Bigger map"><Maximize2 size={13} /></button>
          </div>
        )}
      </div>
      {(!compact || big) && (
        <motion.button className="sv-guess" disabled={!guess} onClick={onGuess} whileTap={guess ? { scale: 0.98 } : undefined}>
          <MapPin size={16} /> {guess ? 'Guess' : 'Place your pin on the map'}
        </motion.button>
      )}
    </div>
  );
}

function shortest(a: { lng: number }, b: { lng: number }) {
  // Draw the line the short way round the antimeridian.
  let lng = b.lng;
  while (lng - a.lng > 180) lng -= 360;
  while (lng - a.lng < -180) lng += 360;
  return lng;
}

/** Full-screen reveal: your pin, the true spot, and the line between them. */
function ResultMap({ results, all }: { results: RoundResult[]; all: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const rs = all ? results : results.slice(-1);
    const m = new maplibregl.Map({
      container: host.current!, style: MAP_STYLE, center: [rs[0].answer.lng, rs[0].answer.lat], zoom: 2,
      attributionControl: false, dragRotate: false, pitchWithRotate: false,
    });
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');
    collapseAttribution(host.current!);
    const lines = rs.map((r) => [[r.guess.lng, r.guess.lat], [shortest(r.guess, r.answer), r.answer.lat]] as [number, number][]);
    // Dashed guess→answer lines as an SVG overlay kept in sync with the map. (Doesn't
    // depend on the style's "load" event, which can lag while fonts/sprites stream in.)
    const svg = svgRef.current!;
    const draw = () => {
      const paths = lines.map(([a, b]) => {
        const p = m.project(a), q = m.project(b);
        return `M${p.x.toFixed(1)},${p.y.toFixed(1)} L${q.x.toFixed(1)},${q.y.toFixed(1)}`;
      }).join(' ');
      svg.querySelector('.rl-halo')!.setAttribute('d', paths);
      svg.querySelector('.rl-line')!.setAttribute('d', paths);
    };
    m.on('move', draw);
    m.on('resize', draw);
    m.once('load', () => { host.current?.classList.add('ready'); emphasiseCountries(m); });
    // How far off, written on the line (single round).
    if (!all && rs[0]) {
      const r = rs[0], mid: [number, number] = [(r.guess.lng + shortest(r.guess, r.answer)) / 2, (r.guess.lat + r.answer.lat) / 2];
      const el = document.createElement('div');
      el.className = 'rl-dist';
      el.textContent = fmtKm(r.km);
      new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(mid).addTo(m);
    }
    rs.forEach((r, i) => {
      new maplibregl.Marker({ element: pinEl('guess', all ? String(i + 1) : undefined), anchor: 'bottom' }).setLngLat([r.guess.lng, r.guess.lat]).addTo(m);
      new maplibregl.Marker({ element: pinEl('answer', all ? String(i + 1) : undefined), anchor: 'bottom' }).setLngLat([shortest(r.guess, r.answer), r.answer.lat]).addTo(m);
    });
    const b = new maplibregl.LngLatBounds();
    lines.flat().forEach((c) => b.extend(c));
    const pad = { top: 90, left: 60, right: 60, bottom: all ? 380 : 260 };
    m.fitBounds(b, { padding: pad, maxZoom: 15, duration: 0 });
    // A short fly-in for the reveal.
    requestAnimationFrame(() => {
      const target = m.getZoom();
      m.setZoom(Math.max(0, target - 1.2));
      m.easeTo({ zoom: target, duration: 1200, easing: (t) => 1 - Math.pow(1 - t, 3) });
    });
    draw();
    return () => m.remove();
  }, [results, all]);
  return (
    <>
      <div ref={host} className="result-map" />
      <svg ref={svgRef} className="result-lines" aria-hidden>
        <path className="rl-halo" />
        <path className="rl-line" />
      </svg>
    </>
  );
}

// ── One-time Mapillary setup ─────────────────────────────────
function MapillarySetup({ onConnected, onFallback, initialError }: { onConnected: (token: string) => void; onFallback: () => void; initialError?: string }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api('/api/mapillary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token.trim() }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? 'Couldn’t save the token.'); return; }
      onConnected(d.token);
    } catch {
      setError('The GeoQuest server isn’t running — start it with npm run dev.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <motion.div className="mly-setup" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
      <div className="mly-badge"><KeyRound size={18} /></div>
      <h2>Connect Mapillary for real Street View</h2>
      <p>Mapillary has millions of 360° street photos worldwide and silky 3D walking. It’s free — you just need a client token (about 2 minutes, once).</p>
      <ol>
        <li><span>1</span><div>Open the <a href="https://www.mapillary.com/dashboard/developers" target="_blank" rel="noreferrer">Mapillary developer dashboard <ExternalLink size={11} /></a> and sign in (free account).</div></li>
        <li><span>2</span><div>Click <b>Register application</b>. Any name works (e.g. GeoQuest); for the callback URL use <code>http://localhost:5173</code>. Under permissions, tick <b>Read</b>.</div></li>
        <li><span>3</span><div>Copy the <b>Client Token</b> (starts with <code>MLY|</code>) — <i>not</i> the Client Secret — and paste it below.</div></li>
      </ol>
      <form onSubmit={save} className="key-row">
        <input type="password" autoComplete="off" spellCheck={false} placeholder="MLY|…" value={token} onChange={(e) => setToken(e.target.value)} />
        <button type="submit" className="key-save" disabled={!token.trim() || busy}>{busy ? <Loader2 size={15} className="spin" /> : 'Connect'}</button>
      </form>
      {error && <div className="key-error">{error.split('**').map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))}</div>}
      <p className="mly-note">Saved only in this project’s <code>.env</code> on your computer.</p>
      <button className="mly-fallback" onClick={onFallback}>Play with open imagery instead (lower quality)</button>
    </motion.div>
  );
}

// ── Game shell ───────────────────────────────────────────────
interface Props {
  game: GeoGame;
  mlyToken: string | null;
  onPick: (lat: number, lng: number) => void;
  onGuess: () => void;
  onNext: () => void;
  onExit: () => void;
  onRestart: () => void;
  onSkip: () => void;
  onMapillary: (token: string) => void;
  onFallback: () => void;
  /** Live match: the match paces the rounds — no Skip / Next, show this note instead. */
  match?: { note: string };
}

function Count({ to, duration = 1.1 }: { to: number; duration?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const c = animate(0, to, { duration, ease: [0.22, 1, 0.36, 1], onUpdate: setV });
    return () => c.stop();
  }, [to, duration]);
  return <>{fmtInt(Math.round(v))}</>;
}

const fmtKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : km < 100 ? `${km.toFixed(1)} km` : `${fmtInt(Math.round(km))} km`);

export function StreetGame({ game, mlyToken, onPick, onGuess, onNext, onExit, onRestart, onSkip, onMapillary, onFallback, match }: Props) {
  const [steps, setSteps] = useState(0);
  useEffect(() => setSteps(0), [game.item?.id]);
  const total = game.results.reduce((s, r) => s + r.score, 0);
  const last = game.results[game.results.length - 1];
  const spot = game.item;
  const showViewer = spot && (game.status === 'play' || game.status === 'result');

  return (
    <motion.section className="sv-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
      {showViewer && spot.provider === 'mapillary' && mlyToken && (
        <MapillaryViewer key={spot.id} token={mlyToken} spot={spot} onError={onSkip} onMoved={setSteps} />
      )}
      {showViewer && spot.provider === 'panoramax' && (
        <PanoramaxViewer key={spot.id} item={spot} onError={onSkip} onMoved={setSteps} />
      )}

      {game.status === 'setup' && <MapillarySetup onConnected={onMapillary} onFallback={onFallback} initialError={game.error} />}

      {game.status === 'loading' && (
        <div className="sv-loading">
          <MiniLoader />
          <span>Finding a street somewhere on Earth…</span>
        </div>
      )}

      {game.status === 'error' && (
        <div className="sv-loading">
          <span>{game.error}</span>
          {match ? <span className="sv-match-note">{match.note}</span> : <button className="primary sv-small" onClick={onSkip}>Try again</button>}
        </div>
      )}

      {/* Reveal map sits above the street view */}
      <AnimatePresence>
        {(game.status === 'result' || game.status === 'final') && game.results.length > 0 && (
          <motion.div className="result-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
            <ResultMap key={game.status === 'final' ? 'final' : `r${game.results.length}`} results={game.results} all={game.status === 'final'} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* HUD */}
      {game.status !== 'setup' && (
        <div className="sv-hud">
          <div className="sv-chip"><Footprints size={13} /> Round <b>{Math.min(game.round, game.totalRounds)}</b>/{game.totalRounds}</div>
          <div className="sv-chip"><Trophy size={13} /> <b>{fmtInt(total)}</b> pts</div>
          {steps > 0 && game.status === 'play' && <div className="sv-chip ghost">{steps} step{steps === 1 ? '' : 's'}</div>}
          <div className="sv-spacer" />
          {game.status === 'play' && !match && <button className="sv-chip btn" onClick={onSkip} title="New location (no points)">Skip</button>}
          <MusicButton className="sv-btn" />
          <button className="sv-btn" onClick={onExit} aria-label="Exit street view"><X size={17} /></button>
        </div>
      )}
      {game.status === 'setup' && <button className="sv-btn sv-close" onClick={onExit} aria-label="Close"><X size={17} /></button>}

      {game.status === 'play' && (
        <>
          <motion.div className="sv-instruction" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
            Drag to look · click the road to step, <b>double-click</b> to go there · pin your guess on the map
          </motion.div>
          <GuessMap round={game.round * 100 + game.results.length} guess={game.guess} onPick={onPick} onGuess={onGuess} />
        </>
      )}

      {/* Result card */}
      <AnimatePresence>
        {game.status === 'result' && last && (
          <motion.div className="sv-result" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30, delay: 0.15 }}>
            <div className="svr-top">
              <div>
                <div className="svr-kicker">{last.km < 25 ? 'Incredible!' : last.km < 300 ? 'Great guess' : last.guessCountry === last.country ? 'Right country!' : last.km < 1500 ? 'Not bad' : 'Way off — next time!'}</div>
                <div className="svr-points"><Count to={last.score} /> <span>points</span></div>
                <div className="svr-dist">Your guess was <b>{fmtKm(last.km)}</b> away</div>
              </div>
              {last.country && BY_CCA3.get(last.country) && (
                <div className="svr-country">
                  <img src={flagUrl(BY_CCA3.get(last.country)!.cca2, 160)} alt="" />
                  <span>{BY_CCA3.get(last.country)!.name}</span>
                  {last.guessCountry === last.country && <em>✓ right country</em>}
                </div>
              )}
            </div>
            <div className="svr-bar"><motion.i initial={{ width: 0 }} animate={{ width: `${(last.score / 5000) * 100}%` }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} /></div>
            {match ? <div className="sv-match-note">{match.note}</div> : <button className="primary" onClick={onNext}>{game.round >= game.totalRounds ? <><Flag size={15} /> See final score</> : 'Next round'}</button>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Final */}
      {game.status === 'final' && (
        <motion.div className="sv-final" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}>
          <div className="svf-head">
            <Trophy size={26} className="svf-trophy" />
            <div>
              <div className="svr-kicker">Game complete</div>
              <div className="svf-total"><Count to={total} duration={1.6} /><span> / {fmtInt(game.totalRounds * 5000)}</span></div>
            </div>
          </div>
          <ul className="svf-rounds">
            {game.results.map((r, i) => {
              const c = r.country ? BY_CCA3.get(r.country) : undefined;
              return (
                <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.08 }}>
                  <span className="svf-n">{i + 1}</span>
                  {c ? <img src={flagUrl(c.cca2, 80)} alt="" /> : <MapPin size={14} />}
                  <span className="svf-c">{c?.name ?? 'Somewhere'}</span>
                  <span className="svf-d">{fmtKm(r.km)}</span>
                  <b>{fmtInt(r.score)}</b>
                </motion.li>
              );
            })}
          </ul>
          <div className="svf-actions">
            <button className="primary" onClick={onRestart}><RotateCcw size={15} /> Play again</button>
            <button className="ghost-cta" onClick={onExit}>Back to the globe</button>
          </div>
        </motion.div>
      )}
    </motion.section>
  );
}
