// Background music, generated on the fly with Web Audio (no audio files, nothing to license).
//
//   explore — while you browse the globe: gentle, mildly upbeat (88 BPM), soft pads, a light
//             plucked arpeggio, a whisper of shaker; three chord progressions in rotation and the
//             odd melody note, so it doesn't loop noticeably.
//   match   — live challenges: livelier (104 BPM); intensity 0 calm (countdown, reveals),
//             1 playing, 2 hurry (last 5 s of a question).
//
// Browsers only allow sound after the user has interacted with the page, so the app calls
// `music.unlock()` on the first tap/click/key. Muting is remembered per browser.

const KEY = 'gq-music';
export const musicMuted = () => { try { return localStorage.getItem(KEY) === 'off'; } catch { return false; } };

export type MusicMode = 'explore' | 'match';
const MODES: Record<MusicMode, { bpm: number; volume: number }> = {
  explore: { bpm: 88, volume: 0.122 },
  match: { bpm: 104, volume: 0.23 },
};
// Chord progressions (MIDI root, third, fifth): I–vi–IV–V, vi–IV–I–V, IV–V–iii–vi in C major.
const PROGRESSIONS = [
  [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]],
  [[45, 48, 52], [41, 45, 48], [48, 52, 55], [43, 47, 50]],
  [[41, 45, 48], [43, 47, 50], [40, 43, 47], [45, 48, 52]],
];
const PENTATONIC = [72, 74, 76, 79, 81, 84];
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

class Engine {
  private ctx: AudioContext;
  private master: GainNode;
  private filter: BiquadFilterNode;
  private delay: DelayNode;
  private delaySend: GainNode;
  private noise: AudioBuffer;
  private timer = 0;
  private stopTimer = 0;
  private step = 0; // 16th notes since start
  private nextTime = 0;
  private bpm = MODES.explore.bpm;
  mode: MusicMode = 'explore';
  intensity = 1;
  playing = false;

  constructor() {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 2200;
    this.filter.connect(this.master);
    // A gentle compressor: louder overall on small speakers, without clipping.
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    this.master.connect(comp).connect(this.ctx.destination);
    // A soft echo for space.
    this.delay = this.ctx.createDelay(1.5);
    this.delay.delayTime.value = this.stepLen() * 3;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.28;
    this.delaySend = this.ctx.createGain();
    this.delaySend.gain.value = 0.22;
    this.delaySend.connect(this.delay).connect(fb).connect(this.delay);
    this.delay.connect(this.filter);
    // One second of white noise for hats / shaker.
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  private stepLen() { return 60 / this.bpm / 4; }
  get running() { return this.ctx.state === 'running'; }

  start() {
    window.clearTimeout(this.stopTimer);
    void this.ctx.resume();
    this.fadeTo(MODES[this.mode].volume, 1.8);
    this.playing = true;
    if (this.timer) return;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop(fade = 1.2) {
    this.playing = false;
    this.fadeTo(0, fade);
    window.clearTimeout(this.stopTimer);
    this.stopTimer = window.setTimeout(() => { window.clearInterval(this.timer); this.timer = 0; void this.ctx.suspend(); }, fade * 1000 + 100);
  }

  /**
   * Restart the audio clock. iPhone: when the page's audio session switches to "playback" after
   * the music has started (the silent <audio> below begins playing a moment later, especially in
   * the installed app), Web Audio keeps reporting "running" but stays silent until it's suspended
   * and resumed — which is why muting and unmuting used to fix it.
   */
  restart() {
    if (!this.playing) return;
    void this.ctx.suspend().then(() => this.ctx.resume()).catch(() => null);
  }

  /** Pause/resume the audio clock (e.g. while the tab is hidden) without changing state. */
  suspend(on: boolean) {
    if (on) void this.ctx.suspend();
    else if (this.playing) void this.ctx.resume();
  }

  setMode(mode: MusicMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.bpm = MODES[mode].bpm;
    this.delay.delayTime.setTargetAtTime(this.stepLen() * 3, this.ctx.currentTime, 0.3);
    if (this.playing) this.fadeTo(MODES[mode].volume, 1.2);
    this.setIntensity(1);
  }

  setIntensity(n: number) {
    this.intensity = n;
    const f = this.mode === 'explore' ? 2200 : n >= 2 ? 5200 : n === 1 ? 2800 : 1500;
    this.filter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.4);
  }

  /** A short chime: up for right, down for wrong. */
  sfx(kind: 'good' | 'bad') {
    void this.ctx.resume();
    const t = this.ctx.currentTime + 0.01;
    const notes = kind === 'good' ? [76, 81] : [64, 60];
    notes.forEach((n, i) => this.voice(hz(n), t + i * 0.09, 0.32, 'triangle', 0.19, this.ctx.destination));
  }

  private fadeTo(v: number, secs: number) {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(v, t + secs);
  }

  private schedule() {
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      if (this.mode === 'explore') this.playExplore(this.step, this.nextTime);
      else this.playMatch(this.step, this.nextTime);
      this.nextTime += this.stepLen();
      this.step += 1;
    }
  }

  private chordAt(step: number) {
    const bar = Math.floor(step / 16);
    const prog = PROGRESSIONS[Math.floor(bar / 4) % PROGRESSIONS.length];
    return prog[bar % 4];
  }

  private playExplore(step: number, t: number) {
    const S = this.stepLen();
    const chord = this.chordAt(step);
    const beat = step % 16;
    const bar = Math.floor(step / 16);
    // Pad: a soft chord each bar.
    if (beat === 0) for (const n of chord) this.voice(hz(n + 12), t, S * 16, 'sine', 0.04, this.filter, 0.6);
    // Bass: a round note on the downbeat, a lighter one on beat 3.
    // (triangle, not sine: its overtones are what a phone speaker can actually play)
    if (beat === 0) this.voice(hz(chord[0] - 12), t, S * 6, 'triangle', 0.09, this.filter, 0.02);
    if (beat === 8) this.voice(hz(chord[0] - 12), t, S * 4, 'triangle', 0.05, this.filter, 0.02);
    // Arpeggio: 8th notes, the odd one left out so it breathes.
    if (beat % 2 === 0 && (beat === 0 || Math.random() > 0.18)) {
      const tones = [chord[0] + 24, chord[1] + 24, chord[2] + 24, chord[1] + 36];
      const n = tones[(beat / 2 + (bar % 2)) % tones.length];
      this.voice(hz(n), t, S * 1.8, 'triangle', 0.028, this.filter, 0.006).connect(this.delaySend);
    }
    // Shaker: a whisper on the off-beats.
    if (beat % 4 === 2) this.hat(t, 0.014);
    // Now and then, a melody note from the pentatonic scale.
    if ((beat === 6 || beat === 12) && Math.random() < 0.22) {
      const n = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
      this.voice(hz(n), t, S * 6, 'sine', 0.03, this.filter, 0.03).connect(this.delaySend);
    }
  }

  private playMatch(step: number, t: number) {
    const S = this.stepLen();
    const chord = PROGRESSIONS[0][Math.floor((step % 64) / 16)];
    const beat = step % 16;
    const I = this.intensity;
    if (beat === 0) for (const n of chord) this.voice(hz(n + 12), t, S * 16, 'sine', 0.035, this.filter, 0.5);
    if (I >= 1 && (beat === 0 || beat === 8 || (I >= 2 && beat === 14))) this.voice(hz(chord[0] - 12), t, S * 3, 'triangle', 0.11, this.filter, 0.01);
    if (I >= 1 && (I >= 2 || beat % 2 === 0)) {
      const tones = [...chord.map((n) => n + 24), chord[1] + 36];
      const n = tones[(beat / (I >= 2 ? 1 : 2)) % tones.length | 0];
      this.voice(hz(n), t, S * 1.6, 'triangle', I >= 2 ? 0.05 : 0.045, this.filter, 0.005).connect(this.delaySend);
    }
    if (I >= 1 && beat % 4 === 2) this.hat(t, 0.035);
    if (I >= 2 && beat % 4 === 0) this.kick(t);
    if (I === 0 && beat === 8) this.voice(hz(chord[2] + 24), t, S * 6, 'sine', 0.02, this.filter, 0.2).connect(this.delaySend);
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
let unlocked = false; // the user has interacted, so sound is allowed
const get = () => {
  if (!engine) { try { engine = new Engine(); } catch { return null; } }
  return engine;
};
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

// A hidden tab doesn't need music (and phones thank you for it).
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    engine?.suspend(document.hidden);
    // Back from the background: phones may have paused the silent loop; pick it up again.
    if (!document.hidden && engine?.playing && silentEl?.paused) void silentEl.play().catch(() => null);
  });
}

// iPhone: web audio is silenced by the ring/silent switch unless the page plays "media". Declare
// playback (Safari 16.4+) and keep a silent <audio> loop going — the long-standing workaround.
let silentEl: HTMLAudioElement | null = null;
function silentWav() {
  const n = 4000, buf = new Uint8Array(44 + n), v = new DataView(buf.buffer);
  const str = (o: number, t: string) => { for (let i = 0; i < t.length; i++) buf[o + i] = t.charCodeAt(i); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, 'data'); v.setUint32(40, n, true);
  buf.fill(128, 44); // 8-bit silence
  let bin = '';
  for (const b of buf) bin += String.fromCharCode(b);
  return `data:audio/wav;base64,${btoa(bin)}`;
}
function mediaPlayback(on: boolean) {
  try { const s = (navigator as unknown as { audioSession?: { type: string } }).audioSession; if (s && on) s.type = 'playback'; } catch { /* unsupported */ }
  try {
    if (!on) { silentEl?.pause(); return; }
    if (!silentEl) {
      silentEl = new Audio(silentWav());
      silentEl.loop = true;
      silentEl.setAttribute('playsinline', '');
      // Each time the media session (re)starts, restart the music so it's routed through it.
      silentEl.addEventListener('playing', () => engine?.restart());
    }
    void silentEl.play().catch(() => null);
  } catch { /* no <audio> */ }
}

export const music = {
  /**
   * Call on user interactions (tap / click / key): starts the music unless it's muted. Safe to call
   * repeatedly — some browsers (iPhone) only allow audio from certain gestures, so keep calling
   * until `running()`.
   */
  unlock() {
    unlocked = true;
    if (musicMuted()) { emit(); return; }
    if (engine?.running && engine.playing && silentEl && !silentEl.paused) return; // already playing
    mediaPlayback(true);
    get()?.start();
    emit();
  },
  /** Is sound actually flowing (the browser allowed it)? */
  running() { return !!engine?.running; },
  /** Explore while browsing, match during live challenges. */
  setMode(mode: MusicMode) {
    get()?.setMode(mode);
    if (unlocked && !musicMuted()) engine?.start();
  },
  intensity(n: number) { if (engine && engine.intensity !== n) engine.setIntensity(n); },
  sfx(kind: 'good' | 'bad') { if (!musicMuted()) get()?.sfx(kind); },
  stop() { engine?.stop(); },
  setMuted(off: boolean) {
    try { localStorage.setItem(KEY, off ? 'off' : 'on'); } catch { /* ignore */ }
    unlocked = true;
    if (off) { engine?.stop(0.4); mediaPlayback(false); } else { mediaPlayback(true); get()?.start(); }
    emit();
  },
  subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; },
};
