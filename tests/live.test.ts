// The hosted live connection (Ably), against a simulated Ably that drops connections and fails
// sends: it must reconnect promptly, retry what didn't go through, and never give up.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Fn = (...a: unknown[]) => void;
const sim = vi.hoisted(() => ({ rt: null as unknown as { connection: { state: string; connects: number; set: (s: string) => void } }, failPublishes: 0, failEnters: 0, published: [] as string[], entered: 0 }));

vi.mock('ably', () => {
  class Emitter {
    private h = new Map<string, Set<Fn>>();
    on(ev: string | Fn, fn?: Fn) { const [k, f] = typeof ev === 'function' ? ['*', ev] : [ev, fn!]; (this.h.get(k) ?? this.h.set(k, new Set()).get(k)!).add(f); }
    once(ev: string, fn: Fn) { const w = (...a: unknown[]) => { this.off(ev, w); fn(...a); }; this.on(ev, w); }
    off(ev: string | Fn, fn?: Fn) { const [k, f] = typeof ev === 'function' ? ['*', ev] : [ev, fn!]; this.h.get(k)?.delete(f); }
    emit(ev: string, arg?: unknown) { for (const k of [ev, '*']) for (const f of [...(this.h.get(k) ?? [])]) f(arg); }
  }
  class Connection extends Emitter {
    state = 'connected'; connects = 0;
    set(s: string) { this.state = s; this.emit(s, { current: s }); }
    connect() { this.connects++; this.set('connected'); }
  }
  class Channel extends Emitter {
    state = 'attached';
    constructor(public name: string) { super(); }
    async publish(n: string) { if (sim.failPublishes > 0) { sim.failPublishes--; throw new Error('not connected'); } sim.published.push(n); }
    async subscribe() {}
    unsubscribe() {}
    async attach() { this.state = 'attached'; }
    async detach() {}
    presence = {
      enter: async () => { if (sim.failEnters > 0) { sim.failEnters--; throw new Error('channel suspended'); } sim.entered++; },
      update: async () => {}, leave: async () => {}, get: async () => [], subscribe: async () => {}, unsubscribe: () => {},
    };
  }
  class Realtime {
    connection = new Connection();
    channels = { m: new Map<string, Channel>(), get(n: string) { return this.m.get(n) ?? this.m.set(n, new Channel(n)).get(n)!; }, release() {} };
    auth = { authorize: async () => ({}) };
    constructor() { sim.rt = this as never; }
    close() { this.connection.set('closed'); }
  }
  return { default: { Realtime }, Realtime };
});

const { connectLive } = await import('../src/lib/live');

beforeEach(() => { sim.failPublishes = 0; sim.failEnters = 0; sim.published = []; sim.entered = 0; });
afterEach(() => { vi.useRealTimers(); });

describe('live connection (hosted)', () => {
  it('retries a send that failed while the connection was down', async () => {
    const live = await connectLive('ably', 'ann');
    sim.failPublishes = 2;
    await live.channel('match:x').publish('ans', { i: 0 });
    expect(sim.published).toEqual(['ans']);
    live.close();
  });

  it('doesn\'t retry (stale) sync beats', async () => {
    const live = await connectLive('ably', 'ann');
    sim.failPublishes = 1;
    await live.channel('match:x').publish('sync', {});
    expect(sim.published).toEqual([]);
    live.close();
  });

  it('keeps trying to be present (that\'s how a match knows you joined)', async () => {
    const live = await connectLive('ably', 'ann');
    sim.failEnters = 3;
    await live.channel('match:x').enter({});
    expect(sim.entered).toBe(1);
    live.close();
  });

  it('reconnects at once when the app is back on screen or back online', async () => {
    const live = await connectLive('ably', 'ann');
    const conn = sim.rt.connection;
    conn.set('disconnected');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(conn.state).toBe('connected');
    conn.set('suspended');
    window.dispatchEvent(new Event('online'));
    expect(conn.state).toBe('connected');
    live.close();
  });

  it('never gives up after a "failed" connection', async () => {
    vi.useFakeTimers();
    const live = await connectLive('ably', 'ann');
    const conn = sim.rt.connection;
    const before = conn.connects;
    conn.set('failed');
    await vi.advanceTimersByTimeAsync(5100);
    expect(conn.connects).toBe(before + 1);
    expect(conn.state).toBe('connected');
    live.close();
  });

  it('stays closed once the app closes it', async () => {
    const live = await connectLive('ably', 'ann');
    const conn = sim.rt.connection;
    live.close();
    window.dispatchEvent(new Event('online'));
    expect(conn.state).toBe('closed');
  });
});
