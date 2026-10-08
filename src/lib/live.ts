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
    authCallback: (_params, cb) => {
      api('/api/realtime/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tickets }) })
        .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `Token request failed (${r.status})`); return r.json(); })
        .then((tr) => cb(null, tr), (err: Error) => cb(err.message, null));
    },
  });
  return {
    me,
    mode: 'ably',
    channel(name) {
      const ch = rt.channels.get(name);
      return {
        publish: async (n, d) => { await ch.publish(n, d ?? null); },
        subscribe(cb) {
          const l = (m: { name?: string; data?: unknown; clientId?: string }) => cb(m.name ?? '', m.data, m.clientId ?? '');
          void ch.subscribe(l);
          return () => ch.unsubscribe(l);
        },
        enter: (d) => ch.presence.enter(d ?? null),
        update: (d) => ch.presence.update(d),
        leave: () => ch.presence.leave(),
        members(cb) {
          let live = true;
          const sync = () => ch.presence.get().then((ms) => { if (live) cb(ms.map((m) => ({ name: m.clientId, data: m.data }))); }).catch(() => null);
          const l = () => void sync();
          void ch.presence.subscribe(l);
          void sync();
          return () => { live = false; ch.presence.unsubscribe(l); };
        },
        release() { void ch.detach().then(() => rt.channels.release(name)).catch(() => null); },
      };
    },
    async addTicket(t) {
      tickets.push(t);
      if (tickets.length > 8) tickets.shift();
      await rt.auth.authorize();
    },
    onState(cb) {
      const l = (s: { current: string }) => cb(s.current);
      rt.connection.on(l);
      return () => rt.connection.off(l);
    },
    close() { rt.close(); },
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
