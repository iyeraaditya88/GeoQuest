// Real-time messaging for live matches, behind one small interface with two transports:
//  • Ably on the hosted site (tokens from /api/realtime/token, scoped by match tickets)
//  • a BroadcastChannel locally, so two tabs on this machine can play each other — no keys needed.
// Both echo your own messages back to you, so match logic treats everyone the same way.
import { api } from './api';
import { fresh } from './chunks';

export interface Member { name: string; data: unknown }
export type Listener = (name: string, data: unknown, from: string) => void;

export interface LiveChannel {
  publish(name: string, data?: unknown): Promise<void>;
  subscribe(cb: Listener): () => void;
  /** Join presence (with optional data), update it, or leave it. */
  enter(data?: unknown): Promise<void>;
  update(data: unknown): Promise<void>;
  leave(): Promise<void>;
  /** Everyone present, now and on every change. */
  members(cb: (m: Member[]) => void): () => void;
  release(): void;
}

export interface Live {
  me: string;
  mode: 'ably' | 'local';
  channel(name: string): LiveChannel;
  /** Allow this connection onto a match channel (hosted: refreshes the token). */
  addTicket(ticket: string): Promise<void>;
  /** Connection state changes ('connected' | 'disconnected' | …). */
  onState(cb: (s: string) => void): () => void;
  close(): void;
}

// ── Ably ──
async function connectAbly(me: string): Promise<Live> {
  const mod = await fresh(import('ably'));
  const Ably = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod;
  const tickets: string[] = [];
  const rt = new Ably.Realtime({
    clientId: me,
    echoMessages: true,
    closeOnUnload: true,
    // Phones drop connections a lot (tunnels, lifts, the app going to the background): retry
    // quickly instead of Ably's default 15 s / 30 s.
    disconnectedRetryTimeout: 3000,
    suspendedRetryTimeout: 8000,
    authCallback: (_params, cb) => {
      api('/api/realtime/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tickets }) })
        .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `Token request failed (${r.status})`); return r.json(); })
        .then((tr) => cb(null, tr), (err: Error) => cb(err.message, null));
    },
  });
  // ── Keeping the connection up ──
  // Ably reconnects by itself; on top of that: reconnect the moment the device is back online or
  // the app is back on screen (a phone in the background loses its socket), after a page comes
  // back from the back/forward cache, and even after a "failed" connection — never give up while
  // the app is open.
  let closed = false;
  const nudge = () => {
    if (closed) return;
    const st = rt.connection.state;
    if (st === 'disconnected' || st === 'suspended' || st === 'failed' || st === 'closed') rt.connection.connect();
  };
  const onVisible = () => { if (!document.hidden) nudge(); };
  const onShow = (e: PageTransitionEvent) => { if (e.persisted) nudge(); };
  window.addEventListener('online', nudge);
  window.addEventListener('focus', nudge);
  window.addEventListener('pageshow', onShow);
  document.addEventListener('visibilitychange', onVisible);
  let failTimer = 0;
  rt.connection.on('failed', () => { window.clearTimeout(failTimer); failTimer = window.setTimeout(nudge, 5000); });

  /** Resolves once connected (or after `ms`, whichever comes first). */
  const connected = (ms = 10_000) => new Promise<void>((resolve) => {
    if (rt.connection.state === 'connected') { resolve(); return; }
    nudge();
    const done = () => { window.clearTimeout(t); rt.connection.off('connected', done); resolve(); };
    const t = window.setTimeout(done, ms);
    rt.connection.once('connected', done);
  });
  /** Try `fn` until it works (a few times, waiting for the connection in between). */
  const retry = async <T,>(fn: () => Promise<T>, tries = 5): Promise<T> => {
    for (let i = 0; ; i++) {
      try { return await fn(); } catch (err) {
        if (i >= tries - 1 || closed) throw err;
        await connected();
        await new Promise((r) => setTimeout(r, Math.min(4000, 400 * 2 ** i)));
      }
    }
  };
  const quiet = (what: string) => (err: unknown) => { console.warn(`[live] ${what} failed`, (err as Error)?.message ?? err); };

  return {
    me,
    mode: 'ably',
    channel(name) {
      const ch = rt.channels.get(name);
      // A channel that failed (e.g. a token hiccup) is re-attached rather than left dead.
      const reattach = () => { if (!closed) window.setTimeout(() => { if (ch.state === 'failed' || ch.state === 'detached') void ch.attach().catch(() => null); }, 2000); };
      ch.on('failed', reattach);
      return {
        // Fire-and-forget for callers, but retried across short drops (a match also re-syncs).
        // ('sync' beats are only worth sending now — a fresh one follows shortly — so no retries.)
        publish: (n, d) => retry(async () => { await ch.publish(n, d ?? null); }, n === 'sync' ? 1 : 5).catch(quiet(`publish ${n}`)),
        subscribe(cb) {
          const l = (m: { name?: string; data?: unknown; clientId?: string }) => cb(m.name ?? '', m.data, m.clientId ?? '');
          void ch.subscribe(l);
          return () => ch.unsubscribe(l);
        },
        // Being present is how others see you (and how a match knows you joined): keep at it.
        enter: (d) => retry(() => ch.presence.enter(d ?? null), 8).catch(quiet('enter')),
        update: (d) => retry(() => ch.presence.update(d)).catch(quiet('presence update')),
        leave: () => ch.presence.leave(),
        members(cb) {
          let live = true;
          const sync = () => ch.presence.get().then((ms) => { if (live) cb(ms.map((m) => ({ name: m.clientId, data: m.data }))); }).catch(() => null);
          const l = () => void sync();
          void ch.presence.subscribe(l);
          // Re-read the members after every (re)attach — events may have been missed meanwhile.
          ch.on('attached', l);
          void sync();
          return () => { live = false; ch.presence.unsubscribe(l); ch.off('attached', l); };
        },
        release() { ch.off('failed', reattach); void ch.detach().then(() => rt.channels.release(name)).catch(() => null); },
      };
    },
    async addTicket(t) {
      tickets.push(t);
      if (tickets.length > 8) tickets.shift();
      // New token with access to this match; retried — without it the match can't be joined.
      await retry(() => rt.auth.authorize(), 6);
    },
    onState(cb) {
      const l = (s: { current: string }) => cb(s.current);
      rt.connection.on(l);
      return () => rt.connection.off(l);
    },
    close() {
      closed = true;
      window.clearTimeout(failTimer);
      window.removeEventListener('online', nudge);
      window.removeEventListener('focus', nudge);
      window.removeEventListener('pageshow', onShow);
      document.removeEventListener('visibilitychange', onVisible);
      rt.close();
    },
  };
}

// ── Local (BroadcastChannel between tabs) ──
type Envelope = { ch: string; k: 'msg' | 'enter' | 'beat' | 'leave'; from: string; tab: string; name?: string; data?: unknown };
const BEAT = 2000, GONE = 6500;

function connectLocal(me: string): Live {
  const bc = new BroadcastChannel('geoquest-live');
  const tab = Math.random().toString(36).slice(2);
  const subs = new Map<string, Set<Listener>>();
  const presence = new Map<string, Map<string, { data: unknown; at: number; tab: string }>>();
  const presSubs = new Map<string, Set<(m: Member[]) => void>>();
  const mine = new Map<string, unknown>(); // channels I'm present on → my data
  const stateSubs = new Set<(s: string) => void>();

  const post = (e: Omit<Envelope, 'from' | 'tab'>) => bc.postMessage({ ...e, from: me, tab });
  const membersOf = (ch: string): Member[] => {
    const out = [...(presence.get(ch) ?? new Map()).entries()].map(([name, v]) => ({ name, data: v.data }));
    if (mine.has(ch) && !out.some((m) => m.name === me)) out.push({ name: me, data: mine.get(ch) });
    return out;
  };
  const notify = (ch: string) => { for (const cb of presSubs.get(ch) ?? []) cb(membersOf(ch)); };
  const deliver = (ch: string, name: string, data: unknown, from: string) => { for (const cb of subs.get(ch) ?? []) cb(name, data, from); };

  bc.onmessage = (ev: MessageEvent<Envelope>) => {
    const e = ev.data;
    if (!e || e.tab === tab) return;
    if (e.k === 'msg') { deliver(e.ch, e.name ?? '', e.data, e.from); return; }
    const m = presence.get(e.ch) ?? new Map();
    presence.set(e.ch, m);
    if (e.k === 'leave') { if (m.get(e.from)?.tab === e.tab) m.delete(e.from); notify(e.ch); return; }
    const prev = m.get(e.from);
    m.set(e.from, { data: e.data, at: Date.now(), tab: e.tab });
    if (e.k === 'enter' && mine.has(e.ch)) post({ ch: e.ch, k: 'beat', data: mine.get(e.ch) }); // say hi back
    if (!prev || e.k === 'enter' || JSON.stringify(prev.data) !== JSON.stringify(e.data)) notify(e.ch);
  };
  const timer = window.setInterval(() => {
    for (const [ch, data] of mine) post({ ch, k: 'beat', data });
    const now = Date.now();
    for (const [ch, m] of presence) {
      let changed = false;
      for (const [name, v] of m) if (now - v.at > GONE) { m.delete(name); changed = true; }
      if (changed) notify(ch);
    }
  }, BEAT);
  const bye = () => { for (const ch of mine.keys()) post({ ch, k: 'leave' }); };
  window.addEventListener('pagehide', bye);
  queueMicrotask(() => { for (const cb of stateSubs) cb('connected'); });

  return {
    me,
    mode: 'local',
    channel(ch) {
      return {
        async publish(name, data) {
          post({ ch, k: 'msg', name, data });
          await Promise.resolve();
          deliver(ch, name, data, me); // echo, like Ably
        },
        subscribe(cb) {
          const set = subs.get(ch) ?? new Set();
          subs.set(ch, set);
          set.add(cb);
          return () => set.delete(cb);
        },
        async enter(data) { mine.set(ch, data ?? null); post({ ch, k: 'enter', data: data ?? null }); notify(ch); },
        async update(data) { mine.set(ch, data); post({ ch, k: 'beat', data }); notify(ch); },
        async leave() { if (!mine.delete(ch)) return; post({ ch, k: 'leave' }); notify(ch); },
        members(cb) {
          const set = presSubs.get(ch) ?? new Set();
          presSubs.set(ch, set);
          set.add(cb);
          cb(membersOf(ch));
          return () => set.delete(cb);
        },
        release() { subs.delete(ch); presSubs.delete(ch); },
      };
    },
    async addTicket() { /* no access control between local tabs */ },
    onState(cb) { stateSubs.add(cb); cb('connected'); return () => stateSubs.delete(cb); },
    close() { bye(); window.clearInterval(timer); window.removeEventListener('pagehide', bye); bc.close(); },
  };
}

export function connectLive(mode: 'ably' | 'local', me: string): Promise<Live> {
  return mode === 'ably' ? connectAbly(me) : Promise.resolve(connectLocal(me));
}

/** Who you are when playing locally (no sign-in): ?as=<name>, remembered per tab. */
export function localName() {
  const q = new URLSearchParams(location.search).get('as');
  const clean = (s: string | null) => (s ?? '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32);
  if (q && clean(q).length >= 2) { try { sessionStorage.setItem('gq-as', clean(q)); } catch { /* ignore */ } return clean(q); }
  try { const s = sessionStorage.getItem('gq-as'); if (s) return s; } catch { /* ignore */ }
  return 'you';
}
