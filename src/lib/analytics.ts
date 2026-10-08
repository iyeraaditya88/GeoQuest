// Usage analytics (seen only by the owner, in Activity). One record per visit: when, how long the
// app was actually in use, the device, and a short list of what happened — sent as a summary
// every few minutes and when the tab is hidden, never per click.
import { api } from './api';

type Data = Record<string, string | number>;
type Event = [at: number, name: string, data?: Data];

const TICK = 15_000; // active-time resolution
const IDLE = 90_000; // no input for this long = not counted as in use
const EVERY = 5 * 60_000; // routine send
const NEW_VISIT = 30 * 60_000; // away this long = the next return is a new visit
const MAX_EVENTS = 400;

const id = () => Math.random().toString(36).slice(2, 12).padEnd(10, '0');
let s = { sid: id(), start: Date.now(), active: 0, events: [] as Event[] };
let lastInput = Date.now();
let lastSent = 0;
let hiddenAt = 0;
let dirty = false;
let started = false;

function device() {
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
  lastSent = Date.now();
  dirty = false;
  // keepalive: still delivered when the tab is closing.
  void api('/api/analytics', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...s, ...device() }) }).catch(() => null);
}

/** Record something the player did (kept short: a name and a few small values). */
export function track(name: string, data?: Data) {
  if (!started) return;
  const at = Math.round((Date.now() - s.start) / 1000);
  const prev = s.events[s.events.length - 1];
  if (prev && prev[1] === name && JSON.stringify(prev[2]) === JSON.stringify(data)) return; // same thing twice in a row
  if (s.events.length >= MAX_EVENTS) return;
  s.events.push(data ? [at, name, data] : [at, name]);
  dirty = true;
}

/** Start measuring this visit (once). */
export function startAnalytics() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const input = () => { lastInput = Date.now(); };
  for (const e of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(e, input, { passive: true, capture: true });
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - lastInput < IDLE) { s.active += TICK / 1000; dirty = true; }
    if (dirty && Date.now() - lastSent > EVERY) send();
  }, TICK);
  window.setTimeout(send, 20_000); // so even a short visit is recorded
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      if (dirty && Date.now() - lastSent > 60_000) send();
    } else if (hiddenAt && Date.now() - hiddenAt > NEW_VISIT) {
      if (dirty) send();
      s = { sid: id(), start: Date.now(), active: 0, events: [] };
      lastInput = Date.now();
      dirty = true;
    }
  });
  window.addEventListener('pagehide', () => { if (dirty) send(); });
}
