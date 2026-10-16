// Usage analytics (seen only by the owner, in Activity). One record per visit: when, how long the
// app was actually in use, the device, and a short list of what happened — sent as a summary
// every few minutes and when the tab is hidden, never per click.
import { api } from './api';
import { isBotAgent } from './bots';

type Data = Record<string, string | number>;
type Event = [at: number, name: string, data?: Data];

const TICK = 5_000; // how often time in use is added up
const IDLE = 90_000; // no input for this long = not counted as in use
// Each send is a storage write, so: once a minute in (so even short visits count), then every
// 15 minutes, and when they leave — not every time a phone flicks to another app and back.
const FIRST = 60_000;
const EVERY = 15 * 60_000; // routine send
const AWAY_SEND = 3 * 60_000; // on switching away: only if the last send is older than this
const NEW_VISIT = 30 * 60_000; // away this long = the next return is a new visit
const MAX_EVENTS = 400;

const id = () => Math.random().toString(36).slice(2, 12).padEnd(10, '0');

/**
 * Where this visit came from, read once as the page loads (before the app tidies the address bar):
 * a ?ref= tag on the link (yt, reddit, wa…; utm_source works too), and the site that linked here.
 */
const ORIGIN = (() => {
  if (typeof location === 'undefined') return {};
  const q = new URLSearchParams(location.search);
  const src = (q.get('ref') ?? q.get('utm_source') ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
  let from = '';
  try { const h = new URL(document.referrer).hostname.replace(/^www\./, ''); if (h && h !== location.hostname) from = h.slice(0, 60); } catch { /* none */ }
  return { ...(src ? { src } : {}), ...(from ? { from } : {}) };
})();

const BOT = typeof navigator !== 'undefined' && isBotAgent(navigator.userAgent, navigator.webdriver === true);

let s = { sid: id(), start: Date.now(), active: 0, events: [] as Event[] };
// Time "in use" only counts once the visitor has done something (a tap, click, key or scroll) —
// an open tab nobody touches isn't engagement.
let lastInput = 0;
let touched = false;
// Time in use, measured exactly: from each tap/click/key/scroll until the next one — or until
// IDLE passes with none — while the app is on screen. (Not rounded to ticks: a 10-second visit
// that ends by switching to the share sheet still counts its 10 seconds.)
let activeMs = 0;
let accruedAt = 0;
function accrue(now = Date.now(), onScreen = document.visibilityState === 'visible') {
  const ms = onScreen ? activeSpan(accruedAt, now, lastInput, IDLE) : 0;
  if (ms > 0) { activeMs += ms; s.active = Math.round(activeMs / 1000); dirty = true; }
  accruedAt = now;
}
/** Milliseconds in use between `from` and `now`: up to `idle` after the last input (none before any input). */
export const activeSpan = (from: number, now: number, lastInput: number, idle: number) =>
  from && lastInput ? Math.max(0, Math.min(now, lastInput + idle) - from) : 0;
let lastSent = 0;
let hiddenAt = 0;
let dirty = false;
let started = false;

/** This device, roughly: phone/tablet/desktop, OS, browser, installed app or not. */
export function device() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iOS'
    : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux|CrOS/.test(ua) ? 'Linux' : 'Other';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Other';
  const touch = matchMedia('(pointer: coarse)').matches;
  const kind = !touch ? 'desktop' : Math.min(screen.width, screen.height) >= 700 ? 'tablet' : 'phone';
  const pwa = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  return { device: kind, os, browser, pwa };
}

function send() {
  if (!started) return;
  accrue();
  const first = !lastSent;
  lastSent = Date.now();
  dirty = false;
  // keepalive: still delivered when the tab is closing.
  void api('/api/analytics', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...s, ...device(), ...ORIGIN, first }) }).catch(() => null);
}

/** Record something the player did (kept short: a name and a few small values). */
export function track(name: string, data?: Data) {
  if (BOT) return; // (events before analytics starts are kept, and sent with the first report)
  const at = Math.round((Date.now() - s.start) / 1000);
  const prev = s.events[s.events.length - 1];
  if (prev && prev[1] === name && JSON.stringify(prev[2]) === JSON.stringify(data)) return; // same thing twice in a row
  if (s.events.length >= MAX_EVENTS) return;
  s.events.push(data ? [at, name, data] : [at, name]);
  dirty = true;
}

/** Start measuring this visit (once). */
export function startAnalytics() {
  if (started || BOT || typeof window === 'undefined') return;
  started = true;
  window.setInterval(() => {
    accrue();
    if (dirty && Date.now() - lastSent > EVERY) send();
  }, TICK);
  window.setTimeout(() => { if (!lastSent) send(); }, FIRST); // so even a short visit is recorded
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // (the event fires after the page is hidden: count up to now as on screen, then stop)
      accrue(Date.now(), true);
      hiddenAt = Date.now();
      if (dirty && (!lastSent || Date.now() - lastSent > AWAY_SEND)) send();
    } else if (hiddenAt && Date.now() - hiddenAt > NEW_VISIT) {
      if (dirty) send();
      s = { sid: id(), start: Date.now(), active: 0, events: [] };
      lastInput = 0;
      touched = false;
      activeMs = 0;
      dirty = true;
    }
    if (document.visibilityState === 'visible') accruedAt = Date.now(); // time away never counts
  });
  window.addEventListener('pagehide', () => { if (dirty) send(); });
}

// Input is watched from the moment the app loads (before analytics starts), so the first tap counts.
if (typeof window !== 'undefined' && !BOT) {
  const input = () => {
    accrue();
    lastInput = Date.now();
    if (!touched) { touched = true; track('touch'); }
  };
  for (const e of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(e, input, { passive: true, capture: true });
}
