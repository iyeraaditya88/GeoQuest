// Background music on phones, with a simulated audio engine: iPhones keep Web Audio silent if the
// media session starts after the music did — so when it starts, the music must restart.
import { describe, it, expect, vi, beforeAll } from 'vitest';

const calls: string[] = [];
const param = () => ({ value: 0, setTargetAtTime() {}, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
// Any audio node: every property is a param, connect() chains, start/stop do nothing.
const node = (): unknown => new Proxy({}, {
  get: (t: Record<string, unknown>, k: string) => {
    if (k === 'connect') return (n: unknown) => n;
    if (k in t) return t[k];
    if (['start', 'stop', 'disconnect'].includes(k)) return () => {};
    if (k === 'buffer' || k === 'type' || k === 'loop' || k === 'onended') return undefined;
    return (t[k] = param());
  },
  set: (t: Record<string, unknown>, k: string, v) => { t[k] = v; return true; },
});
class FakeContext {
  state = 'suspended';
  currentTime = 0;
  sampleRate = 8000;
  destination = node();
  resume() { this.state = 'running'; calls.push('resume'); return Promise.resolve(); }
  suspend() { this.state = 'suspended'; calls.push('suspend'); return Promise.resolve(); }
  createBuffer(_c: number, n: number) { return { getChannelData: () => new Float32Array(n) }; }
}
for (const m of ['createGain', 'createBiquadFilter', 'createDynamicsCompressor', 'createDelay', 'createOscillator', 'createBufferSource', 'createStereoPanner'])
  (FakeContext.prototype as unknown as Record<string, () => unknown>)[m] = node;

let plays = 0;
beforeAll(() => {
  Object.assign(window, { AudioContext: FakeContext });
  // The silent <audio> loop: "starts playing" a moment later, like on an iPhone.
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    plays++;
    Object.defineProperty(this, 'paused', { value: false, configurable: true });
    setTimeout(() => this.dispatchEvent(new Event('playing')), 10);
    return Promise.resolve();
  });
  vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});

describe('background music', () => {
  it('restarts once the media session is up, then stays put on later taps', async () => {
    const { music } = await import('../src/lib/music');
    music.unlock(); // first tap
    expect(music.running()).toBe(true);
    await new Promise((r) => setTimeout(r, 30)); // the silent loop starts playing…
    expect(calls.slice(-3)).toEqual(['resume', 'suspend', 'resume']); // …and the music is restarted through it
    expect(music.running()).toBe(true);

    const before = [calls.length, plays];
    for (let i = 0; i < 5; i++) music.unlock(); // every later tap: nothing to do
    expect([calls.length, plays]).toEqual(before);
    music.setMuted(true);
  });

  it('doesn\'t restart the music on phones that can set "playback" up front (a restart outside a tap would leave it paused)', async () => {
    const { music } = await import('../src/lib/music');
    music.setMuted(false);
    Object.defineProperty(navigator, 'audioSession', { value: { type: 'auto' }, configurable: true });
    const before = calls.length;
    document.querySelector('audio')?.dispatchEvent(new Event('playing'));
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.slice(before)).not.toContain('suspend');
    expect(music.status()).toBe('on');
    delete (navigator as unknown as { audioSession?: unknown }).audioSession;
    music.setMuted(true);
  });
});
