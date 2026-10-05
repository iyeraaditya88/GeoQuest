import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import confetti from 'canvas-confetti';
import { GlobeView, type GlobeHandle, type GlobeView2D, type MapStyle, type Feedback } from './components/GlobeView';
import { FlatAtlas, type AtlasHandle } from './components/FlatAtlas';
import { CustomCursor } from './components/CustomCursor';
import { Sidebar, ShortcutsSheet, SIDEBAR_W } from './components/Sidebar';
import { cursor } from './lib/cursor';
import type { GeoGame, Spot } from './components/StreetGame';

// Games load on demand: Street View alone brings MapillaryJS (with its own three.js),
// MapLibre and Photo Sphere Viewer — none of that belongs in the first paint.
const loadStreet = () => import('./components/StreetGame');
const StreetGame = lazy(() => loadStreet().then((m) => ({ default: m.StreetGame })));
const loadTop5 = () => import('./components/Top5Game');
const loadCapitals = () => import('./components/CapitalsGame');
const loadTrivia = () => import('./components/TriviaGame');
const TriviaGame = lazy(() => loadTrivia().then((m) => ({ default: m.TriviaGame })));
const Top5Game = lazy(() => loadTop5().then((m) => ({ default: m.Top5Game })));
const CapitalsGame = lazy(() => loadCapitals().then((m) => ({ default: m.CapitalsGame })));

// Shown for the moment a game's code is still downloading, so a click never looks ignored.
function GameCardSkeleton() {
  return (
    <motion.div className="game-card skeleton" aria-busy initial={{ y: -30, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
      <div className="sk-row"><i className="sk sk-badge" /><i className="sk sk-title" /></div>
      <i className="sk sk-line" /><i className="sk sk-line short" />
      <div className="sk-grid"><i className="sk" /><i className="sk" /><i className="sk" /><i className="sk" /></div>
    </motion.div>
  );
}
function StreetSkeleton() {
  return (
    <motion.section className="sv-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
      <div className="sv-loading">
        <div className="mini-loader" aria-hidden><div className="loader-bounce"><div className="loader-globe" /></div><div className="loader-shadow" /></div>
        <span>Finding a street somewhere on Earth…</span>
      </div>
    </motion.section>
  );
}
import { findMapillarySpot, MapillaryTokenError } from './lib/mapillary';
import { DEFAULT_MAPILLARY_TOKEN } from './config';
import { findLocation, haversineKm, scoreFor } from './lib/streetview';
import { countryAt } from './lib/data';
import { CountryPanel } from './components/CountryPanel';
import { PeoplePanel } from './components/PeoplePanel';
import { FeaturePanel } from './components/FeaturePanel';
import { featureInfo, type FeatureInfo, type FeatureRef } from './lib/features';
import { AntipodeCard, type AntipodeStage } from './components/AntipodeCard';
import { antipodeOf, describePlace, type Place } from './lib/antipode';
import { placeFor } from './lib/trivia';
import { SearchPalette } from './components/SearchPalette';
import { AskDock } from './components/AskDock';
import { QuizBar, type QuizMode, type QuizState } from './components/QuizBar';
import { BY_CCA3, COUNTRIES, MAPPABLE } from './lib/data';
import { CURATED } from './data/curated';
import { api } from './lib/api';

const QUIZ_POOL = COUNTRIES.filter((c) => c.un && MAPPABLE.has(c.cca3) && c.area > 2000).map((c) => c.cca3);
const CLUE_POOL = Object.keys(CURATED).filter((k) => MAPPABLE.has(k));
const pickRandom = <T,>(xs: T[], not?: T) => { let x: T; do { x = xs[Math.floor(Math.random() * xs.length)]; } while (xs.length > 1 && x === not); return x; };

function loadBest() { try { return Number(localStorage.getItem('gq-best') ?? 0); } catch { return 0; } }
function saveBest(n: number) { try { localStorage.setItem('gq-best', String(n)); } catch { /* ignore */ } }

function newRound(mode: QuizMode, prev?: QuizState): QuizState {
  const pool = mode === 'clue' ? CLUE_POOL : QUIZ_POOL;
  const target = pickRandom(pool, prev?.target);
  let clue: string | undefined;
  if (mode === 'clue') {
    const c = BY_CCA3.get(target)!;
    const tips = CURATED[target].tips.map((t) => t.t);
    clue = pickRandom(tips);
    for (const w of [c.name, c.demonym].filter(Boolean)) clue = clue.replace(new RegExp(w, 'gi'), '▢▢▢');
  }
  return {
    mode, target, clue, result: 'idle', misses: 0,
    streak: prev?.streak ?? 0, best: prev?.best ?? loadBest(), score: prev?.score ?? 0, rounds: prev?.rounds ?? 0,
  };
}


export default function App() {
  const globe = useRef<GlobeHandle>(null);
  const atlas = useRef<AtlasHandle>(null);
  // Sidebar
  const [sbCollapsed, setSbCollapsedState] = useState(() => { try { return localStorage.getItem('gq-sb') === 'rail'; } catch { return false; } });
  const setSbCollapsed = (v: boolean) => { setSbCollapsedState(v); try { localStorage.setItem('gq-sb', v ? 'rail' : 'open'); } catch { /* ignore */ } };
  const [mobile, setMobile] = useState(() => window.innerWidth <= 900);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [keyReq, setKeyReq] = useState(0);
  const [ai, setAi] = useState<boolean | null>(null);
  const [recents, setRecents] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('gq-recents') ?? '[]'); } catch { return []; } });
  useEffect(() => {
    const onResize = () => { setMobile(window.innerWidth <= 900); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    const check = () => api('/api/health').then((r) => r.json()).then((d) => { setAi(!!d.ai); setUser(d.user ?? null); setRole(d.role ?? null); }).catch(() => setAi(false));
    void check();
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, []);
  const [ready, setReady] = useState(false);
  // Globe ↔ flat atlas
  const [view, setView] = useState<'globe' | 'flat'>('globe');
  const viewRef = useRef<'globe' | 'flat'>('globe');
  const [atlasFrom, setAtlasFrom] = useState<GlobeView2D | null>(null);
  const [atlasLeaving, setAtlasLeaving] = useState(false);
  const [globeHidden, setGlobeHidden] = useState(false);
  const morphing = useRef(false);
  // Graceful start: fade the static boot screen (index.html), then bring in the UI chrome.
  const [chrome, setChrome] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const boot = document.getElementById('boot');
    boot?.classList.add('done');
    const t1 = window.setTimeout(() => boot?.remove(), 900);
    const t2 = window.setTimeout(() => setChrome(true), 380);
    // Once the globe is up and idle, warm what's cheap to warm.
    const t3 = window.setTimeout(() => {
      const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => cb());
      idle(() => {
        void loadTop5(); void loadCapitals(); void loadTrivia(); // tiny — then the skeleton only shows on slow links
        // (Street View is NOT pre-imported: evaluating MapillaryJS + MapLibre is a ~250 ms
        // main-thread task that would stall whatever the user clicks at that moment. Its
        // loader appears instantly on click instead, and keeps animating while it loads.)
        // The night-lights texture (0.7 MB) for the Day & Night globe, so switching style is instant.
        const img = new Image(); img.src = '/textures/earth-night.jpg';
      });
    }, 4000);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3); };
  }, [ready]);
  // Street-view game
  const [geo, setGeo] = useState<GeoGame | null>(null);
  const geoRef = useRef<GeoGame | null>(null);
  geoRef.current = geo;
  const prefetch = useRef<Promise<Spot> | null>(null);
  const geoAbort = useRef<AbortController | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string[]>([]);
  const [style, setStyle] = useState<MapStyle>('satellite');
  const [autoRotate, setAutoRotate] = useState(true);
  // Rivers, lakes, mountain ranges & peaks — on by default, remembered per browser.
  const [hosted, setHosted] = useState(false); // public deployment: sign-in, per-user keys
  const [user, setUser] = useState<string | null>(null);
  const [role, setRole] = useState<'owner' | 'member' | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const signOut = () => { void api('/api/logout', { method: 'POST' }).finally(() => location.replace('/login')); };
  const [nature, setNature] = useState(() => { try { return localStorage.getItem('gq-nature') !== '0'; } catch { return true; } });
  const toggleNature = () => setNature((v) => { try { localStorage.setItem('gq-nature', v ? '0' : '1'); } catch { /* private mode */ } return !v; });
  const [searchOpen, setSearchOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const [askReq, setAskReq] = useState<{ prompt: string; n: number } | null>(null);
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [play, setPlay] = useState<null | 'top5' | 'capitals' | 'trivia'>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const timer = useRef<number | undefined>(undefined);

  const country = selected ? BY_CCA3.get(selected) ?? null : null;

  // One camera API for whichever view is active.
  const cam = useRef({
    flyTo: (c: string, ms?: number) => (viewRef.current === 'flat' ? atlas.current?.focus(c) : globe.current?.flyTo(c, ms)),
    reset: () => (viewRef.current === 'flat' ? atlas.current?.reset() : globe.current?.reset()),
  }).current;

  const select = useCallback((cca3: string | null) => {
    setSelected(cca3);
    setFeature(null);
    if (cca3) {
      cam.flyTo(cca3);
      setRecents((r) => {
        const next = [cca3, ...r.filter((x) => x !== cca3)].slice(0, 6);
        try { localStorage.setItem('gq-recents', JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
    }
  }, [cam]);

  // ── Rivers, ranges, peaks & lakes: click one to open its panel ──
  const [feature, setFeature] = useState<FeatureInfo | null>(null);
  const featureReq = useRef(0);
  const openFeature = useCallback(async (ref: FeatureRef) => {
    const n = ++featureReq.current;
    const info = await featureInfo(ref);
    if (!info || n !== featureReq.current) return;
    setSelected(null);
    setHighlighted([]);
    setDockOpen(false);
    setAutoRotate(false);
    setFeature(info);
    // Frame it: wide enough to see the whole river or range.
    const [w, s, e, nn] = info.bbox;
    if (viewRef.current === 'flat') atlas.current?.fitGeo(info.bbox);
    else {
      const span = Math.max((e - w) * Math.cos((info.center.lat * Math.PI) / 180), nn - s);
      globe.current?.frame(info.center.lat, info.center.lng, Math.max(0.32, Math.min(2.1, span / 32 + 0.28)));
    }
  }, []);

  const ask = useCallback((prompt: string) => {
    setDockOpen(true);
    if (prompt) setAskReq((r) => ({ prompt, n: (r?.n ?? 0) + 1 }));
  }, []);

  const highlight = useCallback((codes: string[]) => {
    setHighlighted(codes);
    if (codes.length === 1) cam.flyTo(codes[0]);
    else if (codes.length > 1 && viewRef.current === 'flat') atlas.current?.fit(codes);
    else if (codes.length > 1) {
      // Frame the group: average of centroids, zoomed out.
      const pts = codes.map((c) => BY_CCA3.get(c)!).filter(Boolean);
      const lat = pts.reduce((s, c) => s + c.latlng[0], 0) / pts.length;
      const lng = pts.reduce((s, c) => s + c.latlng[1], 0) / pts.length;
      const spread = Math.max(...pts.map((c) => Math.hypot(c.latlng[0] - lat, c.latlng[1] - lng)));
      globe.current?.frame(lat, lng, Math.min(2.6, Math.max(1.3, spread / 16)));
    }
  }, [cam]);

  const toggleFlat = async () => {
    if (morphing.current || !ready) return;
    morphing.current = true;
    if (viewRef.current === 'globe') {
      const v = globe.current?.getView();
      if (!v) { morphing.current = false; return; }
      setAutoRotate(false);
      viewRef.current = 'flat';
      setView('flat');
      setAtlasLeaving(false);
      setAtlasFrom(v);
      setGlobeHidden(true);
      window.setTimeout(() => globe.current?.pause(), 600);
      return; // FlatAtlas.onReady clears `morphing`
    }
    const a = atlas.current;
    if (!a) { morphing.current = false; return; }
    const c = a.centerGeo();
    globe.current?.resume();
    globe.current?.setPov(Math.max(-55, Math.min(65, c.lat)), c.lng);
    await new Promise((r) => requestAnimationFrame(r));
    const v = globe.current?.getView();
    if (v) await a.morphOut(v);
    viewRef.current = 'globe';
    setView('globe');
    setGlobeHidden(false);
    setAtlasLeaving(true);
    window.setTimeout(() => { setAtlasFrom(null); morphing.current = false; }, 420);
  };

  useEffect(() => { cursor.set({ hideLabel: !!quiz }); }, [quiz]);

  // ── Quiz ────────────────────────────────────────────────
  const startQuiz = (mode: QuizMode = 'find') => {
    setPlay(null);
    setSelected(null);
    setHighlighted([]);
    setDockOpen(false);
    setQuiz((q) => newRound(mode, q ?? undefined));
    setTimeout(() => cam.reset(), 60);
  };

  const nextRound = useCallback((q: QuizState, delay = 1700) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setFeedback(null);
      setQuiz(newRound(q.mode, q));
      cam.reset();
    }, delay);
  }, [cam]);

  const quizClick = (cca3: string | null) => {
    if (!quiz || !cca3 || quiz.result === 'good' || quiz.result === 'reveal') return;
    if (cca3 === quiz.target) {
      const streak = quiz.streak + 1;
      const best = Math.max(streak, quiz.best);
      saveBest(best);
      const q = { ...quiz, streak, best, score: quiz.score + 1, rounds: quiz.rounds + 1, result: 'good' as const };
      setQuiz(q);
      setFeedback({ cca3, kind: 'good' });
      confetti({ particleCount: 90, spread: 75, origin: { y: 0.2 }, colors: ['#fde68a', '#34d399', '#7dd3fc', '#f9a8d4'], disableForReducedMotion: true });
      nextRound(q);
    } else {
      const misses = quiz.misses + 1;
      if (misses >= 3) {
        const q = { ...quiz, misses, streak: 0, rounds: quiz.rounds + 1, result: 'reveal' as const };
        setQuiz(q);
        setFeedback({ cca3: quiz.target, kind: 'reveal' });
        cam.flyTo(quiz.target, 1200);
        nextRound(q, 2600);
      } else {
        setQuiz({ ...quiz, misses, result: 'bad' });
        setFeedback({ cca3, kind: 'bad' });
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setFeedback(null), 700);
      }
    }
  };

  const skip = () => {
    if (!quiz || quiz.result === 'good' || quiz.result === 'reveal') return;
    const q = { ...quiz, streak: 0, rounds: quiz.rounds + 1, result: 'reveal' as const };
    setQuiz(q);
    setFeedback({ cca3: quiz.target, kind: 'reveal' });
    cam.flyTo(quiz.target, 1200);
    nextRound(q, 2400);
  };

  const exitQuiz = () => { window.clearTimeout(timer.current); setQuiz(null); setFeedback(null); };

  const random = () => {
    const pick = pickRandom(QUIZ_POOL, selected ?? undefined);
    setHighlighted([]);
    select(pick);
  };

  // ── Street-view game ───────────────────────────────────
  const seen = useRef<string[]>([]);
  // Imagery provider: Mapillary when a token is connected, Panoramax as the open fallback.
  const mlyToken = useRef<string | null>(null);
  const [mlyTokenState, setMlyTokenState] = useState<string | null>(null);
  const useOpenImagery = useRef(false);

  const nextLocation = (): Promise<Spot> => {
    const ctl = geoAbort.current ?? new AbortController();
    geoAbort.current = ctl;
    if (mlyToken.current && !useOpenImagery.current) return findMapillarySpot(mlyToken.current, ctl.signal);
    return findLocation(ctl.signal, seen.current.slice(-3)).then((it) => ({ ...it, provider: 'panoramax' as const }));
  };

  const loadRound = async (round: number, results: GeoGame['results']) => {
    setGeo({ round, totalRounds: 5, results, status: 'loading', item: null, guess: null });
    try {
      const item = await (prefetch.current ?? nextLocation());
      prefetch.current = null;
      if (!geoRef.current) return;
      const c = countryAt(item.lat, item.lng);
      if (c) seen.current.push(c);
      setGeo({ round, totalRounds: 5, results, status: 'play', item, guess: null });
      // Warm up the next round while this one is played.
      if (round < 5) {
        const p = nextLocation();
        p.catch(() => { if (prefetch.current === p) prefetch.current = null; });
        prefetch.current = p;
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      prefetch.current = null;
      if (err instanceof MapillaryTokenError && mlyToken.current !== DEFAULT_MAPILLARY_TOKEN) {
        // A saved token stopped working → drop it and retry with the built-in one.
        void api('/api/mapillary', { method: 'DELETE' }).catch(() => null);
        mlyToken.current = DEFAULT_MAPILLARY_TOKEN;
        setMlyTokenState(DEFAULT_MAPILLARY_TOKEN);
        void loadRound(round, results);
        return;
      }
      if (err instanceof MapillaryTokenError) {
        // Even the built-in token is rejected (revoked?) → setup card, with the reason.
        mlyToken.current = null;
        setMlyTokenState(null);
        void api('/api/mapillary', { method: 'DELETE' }).catch(() => null);
        setGeo({ round: 1, totalRounds: 5, results: [], status: 'setup', item: null, guess: null, error: err.message });
        return;
      }
      setGeo({ round, totalRounds: 5, results, status: 'error', item: null, guess: null, error: (err as Error).message });
    }
  };

  const startGeo = async () => {
    if (morphing.current) return;
    if (viewRef.current === 'flat') await toggleFlat();
    setPlay(null);
    exitQuiz();
    setSelected(null);
    setHighlighted([]);
    setDockOpen(false);
    setAutoRotate(false);
    seen.current = [];
    prefetch.current = null;
    geoAbort.current = new AbortController();
    // Answer the click at once: the loader is up while we fetch the token and a location.
    setGeo({ round: 1, totalRounds: 5, results: [], status: 'loading', item: null, guess: null });
    // The street view covers the whole screen — stop rendering the globe meanwhile.
    window.setTimeout(() => { if (geoRef.current) globe.current?.pause(); }, 450);
    // A token saved via the setup card wins; otherwise use the built-in one.
    try {
      const d = await api('/api/mapillary').then((r) => r.json());
      mlyToken.current = d.token ?? DEFAULT_MAPILLARY_TOKEN;
    } catch {
      mlyToken.current = DEFAULT_MAPILLARY_TOKEN; // e.g. hosted as a static site, no API server
    }
    if (!geoRef.current) return; // exited while the token was loading
    setMlyTokenState(mlyToken.current);
    if (!mlyToken.current && !useOpenImagery.current) {
      setGeo({ round: 1, totalRounds: 5, results: [], status: 'setup', item: null, guess: null });
      return;
    }
    void loadRound(1, []);
  };

  const connectMapillary = (token: string) => {
    mlyToken.current = token;
    setMlyTokenState(token);
    useOpenImagery.current = false;
    prefetch.current = null;
    void loadRound(1, []);
  };
  const playOpenImagery = () => {
    useOpenImagery.current = true;
    prefetch.current = null;
    void loadRound(1, []);
  };

  const exitGeo = () => {
    geoAbort.current?.abort();
    geoAbort.current = null;
    prefetch.current = null;
    setGeo(null);
    globe.current?.resume();
    globe.current?.reset();
  };

  const placeGuess = (lat: number, lng: number) => {
    setGeo((g) => (g && g.status === 'play' ? { ...g, guess: { lat, lng } } : g));
  };

  const submitGuess = () => {
    const g = geoRef.current;
    if (!g || g.status !== 'play' || !g.guess || !g.item) return;
    const answer = { lat: g.item.lat, lng: g.item.lng };
    const km = haversineKm(g.guess, answer);
    const result = { km, score: scoreFor(km), answer, guess: g.guess, country: countryAt(answer.lat, answer.lng), guessCountry: countryAt(g.guess.lat, g.guess.lng) };
    setGeo({ ...g, status: 'result', results: [...g.results, result] });
  };

  const nextGeo = () => {
    const g = geoRef.current;
    if (!g || g.status !== 'result') return;
    if (g.round >= g.totalRounds) { setGeo({ ...g, status: 'final', item: null }); return; }
    void loadRound(g.round + 1, g.results);
  };

  const skipGeo = () => {
    const g = geoRef.current;
    if (!g) return;
    void loadRound(g.round, g.results);
  };

  const restartGeo = () => { seen.current = []; void loadRound(1, []); };

  // ── Word games (Top 5, Capitals) ───────────────────────
  const startPlay = (g: 'top5' | 'capitals' | 'trivia') => {
    if (geoRef.current) exitGeo();
    if (antiRef.current) exitAntipode();
    exitQuiz();
    setSelected(null);
    setHighlighted([]);
    setDockOpen(false);
    setAutoRotate(false);
    setPlay(g);
  };
  const exitPlay = () => { setPlay(null); setHighlighted([]); };
  // Trivia answers that are places light up on the map.
  const revealTrivia = useCallback((answer: string) => {
    const at = placeFor(answer);
    if (!at) return;
    if ('cca3' in at) { setHighlighted([at.cca3]); cam.flyTo(at.cca3); }
    else if (viewRef.current === 'globe') { setHighlighted([]); globe.current?.frame(at.lat, at.lng, at.alt); }
  }, [cam]);

  // ── Antipode finder ────────────────────────────────────
  // (pins: where you start, and — once you've surfaced — where you came out)
  const [anti, setAnti] = useState<{ stage: AntipodeStage; from: Place | null; to: Place | null } | null>(null);
  const antiRef = useRef(anti);
  antiRef.current = anti;
  const diveRun = useRef<{ cancel: () => void } | null>(null);
  const diveTick = useRef<(p: number) => void>(() => {});
  const antiPins = useMemo(() => {
    if (!anti) return [];
    const pins: { lat: number; lng: number; kind: 'from' | 'to' }[] = [];
    if (anti.from) pins.push({ lat: anti.from.lat, lng: anti.from.lng, kind: 'from' });
    if (anti.to && anti.stage === 'result') pins.push({ lat: anti.to.lat, lng: anti.to.lng, kind: 'to' });
    return pins;
  }, [anti]);

  const startAntipode = async () => {
    if (morphing.current) return;
    if (geoRef.current) exitGeo();
    if (viewRef.current === 'flat') await toggleFlat(); // the dig needs the 3D globe
    setPlay(null);
    exitQuiz();
    setSelected(null);
    setHighlighted([]);
    setDockOpen(false);
    setAutoRotate(false);
    setAnti({ stage: 'pick', from: null, to: null });
  };
  const exitAntipode = () => {
    diveRun.current?.cancel();
    diveRun.current = null;
    setAnti(null);
  };
  const pickAntipode = (lat: number, lng: number, name?: string) => {
    setAnti({ stage: 'pick', from: describePlace(lat, lng, name), to: null });
    globe.current?.frame(lat, lng, 1.45);
  };
  const dig = async (from: Place) => {
    const run = globe.current?.dive(from, { onTick: (p) => diveTick.current(p) });
    if (!run) return;
    diveRun.current = run;
    setAnti({ stage: 'dive', from, to: null });
    await run.finished;
    if (diveRun.current !== run) return; // exited mid-dive
    diveRun.current = null;
    const a = antipodeOf(from.lat, from.lng);
    const to = describePlace(a.lat, a.lng);
    setAnti({ stage: 'result', from, to });
    if (to.cca3) confetti({ particleCount: 70, spread: 70, origin: { y: 0.25 }, colors: ['#5eead4', '#fde68a', '#34d399'], disableForReducedMotion: true });
  };

  // ── Keyboard shortcuts ─────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.('input, textarea');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); return; }
      if (typing) return;
      if (antiRef.current) {
        // Esc skips a running dig, otherwise closes; P toggles the finder.
        if (e.key === 'Escape') { if (antiRef.current.stage === 'dive') diveRun.current?.cancel(); else exitAntipode(); }
        else if (e.key.toLowerCase() === 'p') exitAntipode();
        return;
      }
      if (e.key.toLowerCase() === 'p') { void startAntipode(); return; }
      if (geoRef.current) {
        if (e.key === 'Escape') exitGeo();
        else if (e.key === 'Enter') { if (geoRef.current.status === 'play') submitGuess(); else if (geoRef.current.status === 'result') nextGeo(); }
        return;
      }
      if (e.key.toLowerCase() === 'g') { void startGeo(); return; }
      if (e.key.toLowerCase() === 't') { if (play === 'top5') exitPlay(); else startPlay('top5'); return; }
      if (e.key.toLowerCase() === 'c') { if (play === 'capitals') exitPlay(); else startPlay('capitals'); return; }
      if (e.key.toLowerCase() === 'i') { if (play === 'trivia') exitPlay(); else startPlay('trivia'); return; }
      if (e.key === '[') { setSbCollapsed(true); return; }
      if (e.key === ']') { setSbCollapsed(false); return; }
      if (e.key === '?') { setShortcutsOpen((v) => !v); return; }
      if (e.key === '/') { e.preventDefault(); setSearchOpen(true); }
      else if (e.key === 'Escape') { if (shortcutsOpen) setShortcutsOpen(false); else if (drawerOpen) setDrawerOpen(false); else if (play) exitPlay(); else if (searchOpen) setSearchOpen(false); else if (dockOpen) setDockOpen(false); else if (quiz) exitQuiz(); else if (feature) setFeature(null); else { setSelected(null); setHighlighted([]); } }
      else if (e.key.toLowerCase() === 'r' && !quiz) random();
      else if (e.key.toLowerCase() === 'a') { e.preventDefault(); setDockOpen(true); }
      else if (e.key.toLowerCase() === 'q') { if (quiz) exitQuiz(); else startQuiz(); }
      else if (e.key.toLowerCase() === 'f') void toggleFlat();
      else if (e.key === ' ' && !quiz && view === 'globe') { e.preventDefault(); setAutoRotate((v) => !v); }
      else if (e.key.toLowerCase() === 'n') toggleNature();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });


  // Reserve the sidebar's space from the start, so nothing shifts when it slides in.
  const leftInset = mobile || geo ? 0 : sbCollapsed ? SIDEBAR_W.rail : SIDEBAR_W.open;
  const rightInset = !mobile && (country || feature) && !quiz && !geo && !play ? 420 : 0;

  return (
    <div
      className={`app ${ready ? 'ready' : ''}`}
      style={{ '--li': `${leftInset}px`, '--ri': `${rightInset}px` } as React.CSSProperties}
    >
      <div className="space-glow" />
      <GlobeView
        ref={globe}
        selected={selected}
        highlighted={highlighted}
        style={style}
        autoRotate={autoRotate}
        feedback={feedback}
        quiz={!!quiz}
        liftUp={dockOpen && !quiz}
        dropDown={!!play || (!!anti && anti.stage !== 'dive')}
        pickMode={!!anti && anti.stage !== 'dive'}
        onPick={pickAntipode}
        pins={antiPins}
        leftInset={leftInset}
        nature={nature}
        hidden={globeHidden || !!geo}
        onSelect={(c) => { if (anti) return; if (quiz) quizClick(c); else if (c) select(c); else { setSelected(null); setHighlighted([]); setFeature(null); } }}
        onFeature={(f) => { if (!anti && !quiz) void openFeature(f); }}
        feature={feature}
        onInteract={() => setAutoRotate(false)}
        onReady={() => setTimeout(() => setReady(true), 300)}
      />

      {atlasFrom && (
        <div className={`atlas-layer ${atlasLeaving ? 'leaving' : ''}`}>
          <FlatAtlas
            ref={atlas}
            from={atlasFrom}
            fadeIn={style !== 'political'}
            selected={selected}
            highlighted={highlighted}
            feedback={feedback}
            quiz={!!quiz}
            panelOpen={(!!country || !!feature) && !quiz}
            leftInset={leftInset}
            nature={nature}
            feature={feature}
            onFeature={(f) => { if (!quiz) void openFeature(f); }}
            onSelect={(c) => (quiz ? quizClick(c) : c ? select(c) : (setSelected(null), setHighlighted([]), setFeature(null)))}
            onInteract={() => setAutoRotate(false)}
            onReady={() => { morphing.current = false; }}
          />
        </div>
      )}


      {/* Top bar */}
      <AnimatePresence>
        {geo && (
          <Suspense key="street" fallback={<StreetSkeleton />}>
          <StreetGame game={geo} mlyToken={mlyTokenState} onPick={placeGuess} onGuess={submitGuess} onNext={nextGeo} onExit={exitGeo} onRestart={restartGeo} onSkip={skipGeo} onMapillary={connectMapillary} onFallback={playOpenImagery} />
          </Suspense>
        )}
      </AnimatePresence>

      <Sidebar
        collapsed={sbCollapsed}
        setCollapsed={setSbCollapsed}
        mobile={mobile}
        drawerOpen={drawerOpen}
        setDrawerOpen={setDrawerOpen}
        hidden={!chrome || !!geo}
        view={view}
        style={style}
        autoRotate={autoRotate}
        quizOn={!!quiz}
        playOn={play}
        selected={selected}
        recents={recents}
        ai={ai}
        hosted={hosted}
        user={user}
        onSignOut={signOut}
        onPeople={role === 'owner' ? () => setPeopleOpen(true) : undefined}
        onSearch={() => setSearchOpen(true)}
        onRandom={() => { if (quiz) exitQuiz(); random(); }}
        onAsk={() => { if (quiz) exitQuiz(); setDockOpen(true); }}
        onConnect={() => { if (quiz) exitQuiz(); setDockOpen(true); setKeyReq((n) => n + 1); }}
        onQuiz={() => (quiz ? exitQuiz() : startQuiz())}
        onStreet={() => void startGeo()}
        antipodeOn={!!anti}
        onAntipode={() => (anti ? exitAntipode() : void startAntipode())}
        onTop5={() => (play === 'top5' ? exitPlay() : startPlay('top5'))}
        onCapitals={() => (play === 'capitals' ? exitPlay() : startPlay('capitals'))}
        onTrivia={() => (play === 'trivia' ? exitPlay() : startPlay('trivia'))}
        onToggleView={() => void toggleFlat()}
        onStyle={setStyle}
        onAutoRotate={() => setAutoRotate((v) => !v)}
        nature={nature}
        onNature={toggleNature}
        onReset={() => { setSelected(null); setHighlighted([]); cam.reset(); }}
        onPick={(c) => { if (quiz) exitQuiz(); select(c); }}
        onShortcuts={() => setShortcutsOpen(true)}
      />
      <ShortcutsSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <PeoplePanel open={peopleOpen} onClose={() => setPeopleOpen(false)} />


      {/* Onboarding hint */}
      <AnimatePresence>
        {chrome && !selected && !quiz && !dockOpen && !geo && !play && !anti && (
          <motion.div className="hint" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} transition={{ delay: 0.9 }}>
            <span className="pulse-dot" />{' '}
            {view === 'globe' && style === 'daynight'
              ? 'Live: the lit side is in daylight right now, the dark side is night · ☀ marks midday'
              : <>{view === 'globe' ? 'Drag to spin' : 'Drag to pan'} · Scroll to zoom · Click any country</>}
          </motion.div>
        )}
      </AnimatePresence>


      <AnimatePresence>
        {play === 'top5' && <Suspense key="top5" fallback={<GameCardSkeleton />}><Top5Game ai={ai} onHighlight={(ids) => (ids.length ? highlight(ids) : setHighlighted([]))} onExit={exitPlay} /></Suspense>}
        {play === 'trivia' && <Suspense key="trivia" fallback={<GameCardSkeleton />}><TriviaGame onReveal={revealTrivia} onExit={exitPlay} /></Suspense>}
        {play === 'capitals' && <Suspense key="capitals" fallback={<GameCardSkeleton />}><CapitalsGame onReveal={(c) => { setHighlighted([c]); cam.flyTo(c); }} onExit={exitPlay} /></Suspense>}
      </AnimatePresence>
      <QuizBar quiz={quiz} onMode={(m) => startQuiz(m)} onSkip={skip} onExit={exitQuiz} />
      <AnimatePresence>
        {anti && (
          <AntipodeCard
            key="antipode"
            stage={anti.stage}
            from={anti.from}
            to={anti.to}
            tick={diveTick}
            onPick={pickAntipode}
            onDig={() => anti.from && void dig(anti.from)}
            onSkip={() => diveRun.current?.cancel()}
            onDigBack={() => anti.to && void dig({ ...anti.to })}
            onAgain={() => setAnti({ stage: 'pick', from: null, to: null })}
            onExplore={(c) => { exitAntipode(); select(c); }}
            onExit={exitAntipode}
          />
        )}
      </AnimatePresence>
      <FeaturePanel feature={quiz || geo || play || anti ? null : feature} onClose={() => setFeature(null)} onSelectCountry={select} onAsk={ask} />
      <CountryPanel country={quiz || geo || play || anti ? null : country} onClose={() => setSelected(null)} onSelect={select} onAsk={ask} />
      {chrome && !quiz && !geo && !play && !anti && <AskDock open={dockOpen} setOpen={setDockOpen} country={country} request={askReq} keyRequest={keyReq} onAiChange={setAi} onHosted={setHosted} onHighlight={highlight} onSelect={select} />}
      <CustomCursor />
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} onPick={(c) => { if (quiz) exitQuiz(); select(c); }} />
    </div>
  );
}
