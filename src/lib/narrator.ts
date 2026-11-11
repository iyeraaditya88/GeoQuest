// The narrator: George's recorded voice telling a war (and later battles and voyages), with a quiet
// bed of sound underneath (distant guns, wind, waves) and the odd single sound (a whistle, bells).
// Recorded once with scripts/narrate.mts; served from /narration/ (in dev straight from
// narration/out and narration/sfx; in production a rewrite to the public Blob store).
//
// The voice is a plain <audio> element at full volume, so it keeps playing with the screen off.
// The beds are Web Audio buffers, because iPhones won't let a page set an <audio> element's volume.
// Background music dips while the voice speaks.
import { music, silentWav } from './music';
import { lineAt } from './subtitles';
import { track } from './analytics';

const BASE = '/narration';
const KEY = 'gq-narration';
const BED_VOL = 0.24, HIT_VOL = 0.33; // under the voice: the mix approved at the audition
/** Where in a clip its single sound lands (share of the clip): bells at the end, a whistle at the start. */
const HIT_AT: Record<string, number> = { whistle: 0.1, 'church-bells': 0.72, 'crowd-cheer': 0.45, 'air-raid-siren': 0.55 };

export interface Clip { file: string; ms: number; lines?: string[]; cues?: number[]; bed?: string; hit?: string }
export type SayResult = 'ended' | 'stopped' | 'failed';

/** The pause after a clip before the story moves on: room to look at the map. */
export const breathMs = (fast: boolean) => (fast ? 500 : 1300);

export const narrationOn = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };

let manifest: Promise<Record<string, Clip> | null> | null = null;
let available = false;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

function load() {
  manifest ??= fetch(`${BASE}/manifest.json`)
    .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? r.json() : null))
    .then((m: Record<string, Clip> | null) => { available = !!m; emit(); return m; })
    .catch(() => null);
  return manifest;
}

// ── The voice ──
let el: HTMLAudioElement | null = null;
let current: { id: string; done: (r: SayResult) => void; hit?: string; hitAt: number; hitDone: boolean } | null = null;
let unduck = 0;
/** The tap's unlock under way (a moment of silence): a clip waits for it, or it would cut it off. */
let priming: Promise<void> | null = null;
/** The phone refused a clip (no tap yet): the next tap anywhere starts it. */
let blocked = false;
/** The voice has played from a tap at least once: the phone lets it play by itself from now on. */
let unlocked = false;
/** The clip on screen for subtitles: stays after it ends (through the breath before the next). */
let shown: { id: string; clip: Clip } | null = null;
const timeListeners = new Set<() => void>();
const tick = () => { for (const l of timeListeners) l(); };

function voice() {
  if (el) return el;
  el = new Audio();
  el.preload = 'auto';
  el.setAttribute('playsinline', '');
  el.addEventListener('ended', () => finish('ended'));
  el.addEventListener('error', () => {
    if (!current || !el?.src.includes(BASE)) return;
    track('narration_err', { why: `media${el.error?.code ?? ''}`, id: current.id });
    finish('failed');
  });
  el.addEventListener('timeupdate', () => {
    tick();
    const c = current;
    if (!c || c.hitDone || !c.hit || !el?.duration) return;
    if (el.currentTime >= c.hitAt * el.duration) { c.hitDone = true; void playHit(c.hit); }
  });
  return el;
}

function finish(r: SayResult) {
  const c = current;
  current = null;
  if (r === 'failed' && shown?.id === c?.id) { shown = null; tick(); } // the summary shows instead
  // Music comes back up only if nothing follows shortly (between clips it stays low).
  window.clearTimeout(unduck);
  unduck = window.setTimeout(() => music.duck(false), r === 'ended' ? 2600 : 300);
  c?.done(r);
}

// ── The sound beds ──
let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
let bed: { id: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;

function audio() {
  if (ctx) return ctx;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  try { ctx = new Ctx({ latencyHint: 'playback' }); } catch { return null; }
  return ctx;
}

function sound(id: string) {
  let b = buffers.get(id);
  if (!b) {
    const c = audio();
    b = !c ? Promise.resolve(null) : fetch(`${BASE}/sfx/${id}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((a) => c.decodeAudioData(a))
      .catch(() => null);
    buffers.set(id, b);
  }
  return b;
}

function fade(g: GainNode, to: number, secs: number) {
  const t = ctx!.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(g.gain.value, t);
  g.gain.linearRampToValueAtTime(to, t + secs);
}

function dropBed(secs = 1.6) {
  const b = bed;
  bed = null;
  if (!b || !ctx) return;
  fade(b.gain, 0, secs);
  b.src.stop(ctx.currentTime + secs + 0.05);
}

async function setBed(id: string | undefined) {
  if (bed?.id === id) return; // the same ground carries on under the next clip
  dropBed();
  if (!id) return;
  const buf = await sound(id);
  const c = ctx;
  if (!buf || !c || current === null || bed) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const gain = c.createGain();
  gain.gain.value = 0;
  src.connect(gain).connect(c.destination);
  src.start();
  bed = { id, src, gain };
  fade(gain, BED_VOL, 2);
}

async function playHit(id: string) {
  const buf = await sound(id);
  const c = ctx;
  if (!buf || !c) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  const gain = c.createGain();
  gain.gain.value = HIT_VOL;
  src.connect(gain).connect(c.destination);
  src.start();
}

export const narrator = {
  /** Fetch the clip list (cheap, once). The toggle only shows when narration is there. */
  load,
  available: () => available,
  /**
   * Call during a tap: phones only let audio start from one. Primes the voice element and the
   * sound beds so a clip can begin later, when the story moves on by itself.
   */
  unlock(e?: Event) {
    void load();
    // iPhone only counts a finished tap (touchend / click), not the pointerup just before it: an
    // attempt there is refused, and would only get in the way of the one that counts.
    if (e?.type === 'pointerup' && (e as PointerEvent).pointerType !== 'mouse') return;
    const c = audio();
    if (c && c.state !== 'running') void c.resume().catch(() => null);
    const v = voice();
    if (blocked && current) { // a clip is waiting for this tap
      blocked = false;
      tick();
      void v.play().then(() => { unlocked = true; }).catch(() => { blocked = true; tick(); });
      return;
    }
    if (unlocked || current || priming) return;
    v.muted = true;
    v.src = silentWav();
    priming = v.play()
      .then(() => { unlocked = true; if (!current) v.pause(); })
      .catch(() => {}) // (refused: the next tap tries again)
      .finally(() => { v.muted = false; priming = null; });
  },
  /**
   * Speak a clip; resolves when it ends (or is stopped, or can't play). Saying the clip that is
   * paused picks it up where it stopped.
   */
  async say(id: string, opt: { rate?: number; title?: string; album?: string; prefetch?: string } = {}): Promise<SayResult> {
    const m = await load();
    const clip = m?.[id];
    if (!clip) return 'failed';
    const v = voice();
    if (priming) await priming;
    const resuming = current?.id === id && v.paused && v.currentTime > 0;
    if (!resuming) {
      current?.done('stopped');
      v.src = `${BASE}/${clip.file}`;
      shown = { id, clip };
      tick();
    }
    const done = new Promise<SayResult>((res) => {
      const prev = resuming ? current : null;
      current = { id, done: res, hit: clip.hit, hitAt: HIT_AT[clip.hit ?? ''] ?? 0.35, hitDone: prev?.hitDone ?? false };
    });
    const mine = current; // (a later say or a pause can overtake this one: it only answers for itself)
    v.playbackRate = opt.rate ?? 1;
    v.preservesPitch = true;
    window.clearTimeout(unduck);
    music.duck(true);
    const c = audio();
    if (c && c.state !== 'running') void c.resume().catch(() => null);
    void setBed(clip.bed);
    session(opt.title, opt.album, true);
    v.muted = false;
    try {
      await v.play();
      blocked = false;
      unlocked = true;
    } catch (e) {
      const why = (e as DOMException)?.name;
      if (current === mine && why !== 'AbortError') track('narration_err', { why: why ?? 'unknown', id, unlocked: unlocked ? 1 : 0 });
      // Interrupted (paused, or another clip took over): not a failure — whoever interrupted carries on.
      if (current !== mine || why === 'AbortError') { /* nothing to do */ }
      // iPhone: sound has to start from a tap. Wait a moment for one (any tap starts the clip);
      // without one, the story carries on by the clock.
      else if (why !== 'NotAllowedError') finish('failed');
      else {
        blocked = true;
        tick();
        window.setTimeout(() => { if (blocked && current?.id === id) { blocked = false; tick(); finish('failed'); } }, 6000);
      }
    }
    if (opt.prefetch && m?.[opt.prefetch]) {
      const next = m[opt.prefetch];
      void fetch(`${BASE}/${next.file}`, { priority: 'low' } as RequestInit).catch(() => null);
      if (next.bed) void sound(next.bed);
    }
    return done;
  },
  /** Hold the voice where it is (and the beds); `say` with the same id carries on. */
  pause() {
    if (!current) return;
    el?.pause();
    if (ctx?.state === 'running') void ctx.suspend();
    music.duck(false);
    session(undefined, undefined, false);
  },
  /** Stop for good: the voice ends, the beds fade, the music comes back. */
  stop() {
    el?.pause();
    if (current) finish('stopped');
    shown = null;
    tick();
    if (ctx?.state === 'suspended') void ctx.resume();
    dropBed(1.2);
    clearSession();
  },
  /**
   * The subtitle for a clip: its sentences and which one George is on (null if that clip isn't
   * the one playing). After a clip ends its last sentence stays until the next begins.
   */
  line(id: string): { lines: string[]; k: number } | null {
    if (shown?.id !== id || !shown.clip.lines?.length) return null;
    const { lines, cues = [0] } = shown.clip;
    const k = current?.id === id && el ? lineAt(cues, el.currentTime * 1000) : lines.length - 1;
    return { lines, k };
  },
  /** The phone is waiting for a tap before George can speak. */
  blocked: () => blocked,
  /** Called as the voice moves on (a few times a second while speaking). */
  onTime(cb: () => void) { timeListeners.add(cb); return () => { timeListeners.delete(cb); }; },
  setOn(on: boolean) {
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
    if (!on) narrator.stop();
    emit();
  },
  /** Lock-screen play/pause (phones): the player that's narrating hands its own controls in. */
  controls(h: { play: () => void; pause: () => void } | null) { handlers = h; bindSession(); },
  subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; },
};

// ── Lock screen (Media Session) ──
let handlers: { play: () => void; pause: () => void } | null = null;
const ms = () => (typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null);
function bindSession() {
  const s = ms();
  if (!s) return;
  try {
    s.setActionHandler('play', handlers ? () => handlers?.play() : null);
    s.setActionHandler('pause', handlers ? () => handlers?.pause() : null);
  } catch { /* unsupported action */ }
}
function session(title: string | undefined, album: string | undefined, playing: boolean) {
  const s = ms();
  if (!s) return;
  try {
    if (title) s.metadata = new MediaMetadata({ title, artist: 'GeoQuest', album: album ?? '', artwork: [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }] });
    s.playbackState = playing ? 'playing' : 'paused';
  } catch { /* unsupported */ }
}
function clearSession() {
  const s = ms();
  if (!s) return;
  try { s.metadata = null; s.playbackState = 'none'; } catch { /* unsupported */ }
}

// For browser tests in development: what's playing.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __narr: unknown }).__narr = { voice: () => el, bed: () => bed?.id ?? null, ctx: () => ctx?.state ?? null, id: () => current?.id ?? null };
}
