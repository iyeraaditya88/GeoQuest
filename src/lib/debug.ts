// Debug mode: an easter egg (seven quick taps on the GeoQuest logo) that turns this device into a
// reporter. While it's on, what the app sees — the narrator's state each second while it's busy,
// errors, a few key moments — goes to /api/debug every few seconds, tagged with a short code for
// this device (shown in a small badge), so a problem on someone's phone can be read, not guessed.
// Nothing personal is sent; turning it off stops it.

const KEY = 'gq-debug';
type Entry = [at: number, kind: string, msg: string];

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };

let on = read(KEY) === 'on';
const code = read(`${KEY}-id`) ?? (() => { const c = Math.random().toString(36).slice(2, 7); write(`${KEY}-id`, c); return c; })();
const buf: Entry[] = [];
const watchers = new Map<string, () => string | null>();
const last = new Map<string, string>();
const listeners = new Set<() => void>();
let first = true, timers: number[] = [];

/** Note something (only kept while debug mode is on). */
export function dlog(kind: string, msg: string) {
  if (!on) return;
  buf.push([Date.now(), kind, msg.slice(0, 400)]);
  if (buf.length > 300) buf.shift();
}

/** A state to sample every second; logged when it changes (null: nothing to say right now). */
export function dwatch(name: string, fn: () => string | null) { watchers.set(name, fn); }

function sample() {
  for (const [name, fn] of watchers) {
    let v: string | null;
    try { v = fn(); } catch (e) { v = `(failed: ${(e as Error).message})`; }
    if (v !== null && v !== last.get(name)) { last.set(name, v); dlog(name, v); }
  }
}

function send() {
  if (!buf.length && !first) return;
  const entries = buf.splice(0, buf.length);
  const body = JSON.stringify({
    code, entries, first,
    ua: navigator.userAgent,
    screen: `${window.innerWidth}×${window.innerHeight}@${window.devicePixelRatio}`,
    app: `${import.meta.env.VITE_BUILD?.slice(0, 7) ?? 'dev'}${window.matchMedia('(display-mode: standalone)').matches ? ' · installed' : ''}`,
  });
  first = false;
  void fetch('/api/debug', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body }).catch(() => null);
}

const onError = (e: ErrorEvent) => dlog('error', `${e.message} @ ${e.filename?.split('/').pop()}:${e.lineno}`);
const onReject = (e: PromiseRejectionEvent) => dlog('reject', String((e.reason as Error)?.message ?? e.reason));
const onHide = () => { dlog('page', document.visibilityState); if (document.visibilityState === 'hidden') send(); };
const consoleError = console.error;

function start() {
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onReject);
  document.addEventListener('visibilitychange', onHide);
  console.error = (...a: unknown[]) => { dlog('console', a.map((x) => (x instanceof Error ? x.message : String(x))).join(' ')); consoleError.apply(console, a); };
  dlog('debug', 'on');
  timers = [window.setInterval(sample, 1000), window.setInterval(send, 4000)];
  send();
}
function stopAll() {
  dlog('debug', 'off');
  send();
  window.removeEventListener('error', onError);
  window.removeEventListener('unhandledrejection', onReject);
  document.removeEventListener('visibilitychange', onHide);
  console.error = consoleError;
  for (const t of timers) window.clearInterval(t);
  timers = [];
}

export const debug = {
  on: () => on,
  code,
  toggle() {
    on = !on;
    write(KEY, on ? 'on' : null);
    if (on) { first = true; start(); } else stopAll();
    for (const l of listeners) l();
  },
  subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; },
};

if (on && typeof window !== 'undefined') start();
