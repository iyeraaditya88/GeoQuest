// Light, upbeat background music for live matches — generated on the fly with Web Audio
// (no audio files, nothing to license). A warm pad, a plucked arpeggio, soft bass and hats,
// in a I–vi–IV–V loop. Intensity rises in the last seconds of a question.
//
//   0 = calm (countdown, reveals)   1 = playing   2 = hurry (last 5 s)

const KEY = 'gq-music';
export const musicMuted = () => { try { return localStorage.getItem(KEY) === 'off'; } catch { return false; } };

const BPM = 104;
const STEP = 60 / BPM / 4; // a 16th note, in seconds
const VOLUME = 0.16;
// C major: C, Am, F, G — as MIDI chord tones (root, third, fifth).
const CHORDS = [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]];
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

class Engine {
  private ctx: AudioContext;
  private master: GainNode;
  private filter: BiquadFilterNode;
  private delaySend: GainNode;
  private noise: AudioBuffer;
  private timer = 0;
  private stopTimer = 0;
  private step = 0;
  private nextTime = 0;
  intensity = 0;

  constructor() {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 2400;
    this.filter.connect(this.master);
    this.master.connect(this.ctx.destination);
    // A soft echo for space.
    const delay = this.ctx.createDelay(1);
    delay.delayTime.value = STEP * 3;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.28;
    this.delaySend = this.ctx.createGain();
    this.delaySend.gain.value = 0.22;
    this.delaySend.connect(delay).connect(fb).connect(delay);
    delay.connect(this.filter);
    // One second of white noise for hats.
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  start() {
    window.clearTimeout(this.stopTimer);
    void this.ctx.resume();
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(VOLUME, t + 1.5);
    if (this.timer) return;
    this.nextTime = t + 0.05;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop(fade = 1.2) {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + fade);
    window.clearTimeout(this.stopTimer);
    this.stopTimer = window.setTimeout(() => { window.clearInterval(this.timer); this.timer = 0; void this.ctx.suspend(); }, fade * 1000 + 100);
  }

  setIntensity(n: number) {
    this.intensity = n;
    const t = this.ctx.currentTime;
    this.filter.frequency.setTargetAtTime(n >= 2 ? 5200 : n === 1 ? 2800 : 1500, t, 0.4);
  }

  /** A short chime: up for right, down for wrong. */
  sfx(kind: 'good' | 'bad') {
    void this.ctx.resume();
    const t = this.ctx.currentTime + 0.01;
    const notes = kind === 'good' ? [76, 81] : [64, 60];
    notes.forEach((n, i) => this.voice(hz(n), t + i * 0.09, 0.32, 'triangle', 0.16, this.ctx.destination));
  }

  private schedule() {
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.play(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step = (this.step + 1) % 64; // 4 bars of 16ths
    }
  }

  private play(step: number, t: number) {
    const chord = CHORDS[Math.floor(step / 16)];
    const beat = step % 16;
    const I = this.intensity;
    // Pad: each bar, a soft chord.
    if (beat === 0) for (const n of chord) this.voice(hz(n + 12), t, STEP * 16, 'sine', 0.035, this.filter, 0.5);
    // Bass: beats 1 and 3 (+ a pickup when it's busy).
    if (I >= 1 && (beat === 0 || beat === 8 || (I >= 2 && beat === 14))) this.voice(hz(chord[0] - 12), t, STEP * 3, 'sine', 0.11, this.filter, 0.01);
    // Arpeggio: 8ths when playing, 16ths in the last seconds.
    if (I >= 1 && (I >= 2 || beat % 2 === 0)) {
      const tones = [...chord.map((n) => n + 24), chord[1] + 36];
      const n = tones[(beat / (I >= 2 ? 1 : 2)) % tones.length | 0];
      const v = this.voice(hz(n), t, STEP * 1.6, 'triangle', I >= 2 ? 0.05 : 0.045, this.filter, 0.005);
      v.connect(this.delaySend);
    }
    // Hats on the off-beats; a soft kick when it's busy.
    if (I >= 1 && beat % 4 === 2) this.hat(t, 0.035);
    if (I >= 2 && beat % 4 === 0) this.kick(t);
    if (I === 0 && beat === 8) this.voice(hz(chord[2] + 24), t, STEP * 6, 'sine', 0.02, this.filter, 0.2).connect(this.delaySend);
  }

  private voice(freq: number, t: number, dur: number, type: OscillatorType, peak: number, out: AudioNode, attack = 0.01) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.02, dur));
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
    return g;
  }

  private hat(t: number, peak: number) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(hp).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5, 0.06);
  }

  private kick(t: number) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.2);
  }
}

let engine: Engine | null = null;
const get = () => {
  if (!engine) { try { engine = new Engine(); } catch { return null; } }
  return engine;
};

export const music = {
  start() { if (!musicMuted()) get()?.start(); },
  stop() { engine?.stop(); },
  intensity(n: number) { if (engine && engine.intensity !== n) engine.setIntensity(n); },
  sfx(kind: 'good' | 'bad') { if (!musicMuted()) get()?.sfx(kind); },
  setMuted(off: boolean) {
    try { localStorage.setItem(KEY, off ? 'off' : 'on'); } catch { /* ignore */ }
    if (off) engine?.stop(0.4); else get()?.start();
  },
};
