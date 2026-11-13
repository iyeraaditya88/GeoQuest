import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from 'lucide-react';
import { track } from '../../lib/analytics';
import { narrator } from '../../lib/narrator';

export interface StorySeg { id: string; label: string }

const SKIP_MS = 10_000;
const clock = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/**
 * The story's player: play and pause, ten seconds back or on, and one scrubber over the whole
 * telling (a tick at each chapter or port), with where George is and how long it runs. A move
 * inside the clip being told just moves the voice; one into another chapter goes to `onJump`.
 */
export function StoryBar({ segs, k, playing, ended, onToggle, onJump, note, children }: {
  segs: StorySeg[]; k: number; playing: boolean; ended: boolean;
  onToggle: () => void; onJump: (k: number, ms: number) => void;
  /** Something to say in place of the time (George couldn't be loaded). */
  note?: string;
  /** More buttons, at the end of the controls (the voice, the story). */
  children?: ReactNode;
}) {
  const lens = useSyncExternalStore(narrator.subscribe, () => segs.map((s) => narrator.clipMs(s.id)).join(','));
  const ms = lens.split(',').map(Number);
  const starts = ms.reduce<number[]>((a, m, i) => [...a, (a[i] ?? 0) + m], [0]);
  const total = starts[segs.length];
  const here = Math.min(k, segs.length - 1);
  const at = useSyncExternalStore(narrator.onTime, () => narrator.pos(segs[here]?.id ?? ''));
  const now = ended ? total : starts[here] + at;
  const [drag, setDrag] = useState<number | null>(null);
  // Where a jump is headed, until George is there: the thumb waits on it rather than sliding back
  // to the start of a chapter that's still loading (and a second tap of ±10 goes on from it).
  const [aim, setAim] = useState<number | null>(null);
  useEffect(() => { if (aim !== null && Math.abs(now - aim) < 1500) setAim(null); }, [aim, now]);
  useEffect(() => {
    if (aim === null) return;
    const t = window.setTimeout(() => setAim(null), 5000); // (it couldn't go there after all)
    return () => window.clearTimeout(t);
  }, [aim]);
  const shown = drag ?? aim ?? now;
  // (Noted as the finger goes down: by the click, a tap the phone was waiting for has started the voice.)
  const wasWaiting = useRef(false);

  const segAt = (t: number) => { let j = segs.length - 1; while (j > 0 && starts[j] > t) j--; return j; };
  const go = (g: number) => {
    const t = Math.max(0, Math.min(g, total - 300));
    const j = segAt(t);
    const into = t - starts[j];
    setAim(t);
    if (j === here && !ended && narrator.seek(segs[j].id, into)) return;
    onJump(j, into);
  };
  const commit = () => { if (drag !== null) go(drag); setDrag(null); };
  const pct = (x: number) => `${total ? (x / total) * 100 : 0}%`;
  const label = segs[drag !== null ? segAt(drag) : here]?.label;

  if (!total) return null;
  return (
    <div className="story-bar">
      <div className={`bw-scrub sb-scrub ${drag !== null ? 'drag' : ''}`}>
        <div className="bw-track" aria-hidden>
          <i className="bw-fill" style={{ width: pct(shown) }} />
          {starts.slice(1, -1).map((s, j) => <i key={segs[j].id} className={`bw-tick ${s <= shown ? 'past' : ''}`} style={{ left: pct(s) }} />)}
          <i className="bw-thumb" style={{ left: pct(shown) }} />
        </div>
        <input type="range" aria-label="Seek the story" aria-valuetext={`${clock(shown)} of ${clock(total)}${label ? `, ${label}` : ''}`} min={0} max={total} step={1000} value={shown}
          onChange={(e) => setDrag(Number(e.target.value))}
          onPointerUp={commit} onPointerCancel={() => setDrag(null)} onKeyUp={commit} onBlur={() => setDrag(null)} />
      </div>
      <div className={`sb-time ${note ? 'sb-note' : ''}`} role={note ? 'status' : undefined}>{note ? <span>{note}</span> : <><span><b>{label}</b> · {clock(shown)}</span><span>{clock(total)}</span></>}</div>
      <div className="sb-row">
        <button className="icon-btn" onClick={() => go((aim ?? now) - SKIP_MS)} aria-label="Back 10 seconds"><RotateCcw size={17} /><i>10</i></button>
        <button className="bw-play" onPointerDown={() => { wasWaiting.current = narrator.blocked(); }}
          onClick={() => { if (wasWaiting.current) { wasWaiting.current = false; return; } onToggle(); }}
          aria-label={playing ? 'Pause' : ended ? 'Play again' : 'Play'}>
          {playing ? <Pause size={18} fill="currentColor" /> : ended ? <RotateCcw size={18} /> : <Play size={18} fill="currentColor" />}
        </button>
        <button className="icon-btn" onClick={() => go((aim ?? now) + SKIP_MS)} disabled={ended} aria-label="Forward 10 seconds"><RotateCw size={17} /><i>10</i></button>
        <span className="sb-more">{children}</span>
      </div>
    </div>
  );
}

/** George on or off (remembered on this device). */
export function VoiceToggle({ on }: { on: boolean }) {
  return (
    <button className={`bw-speed bw-voice ${on ? 'on' : ''}`} onClick={() => { track('narration', { on: on ? 0 : 1 }); narrator.setOn(!on); }} aria-pressed={on} aria-label="Narration">
      {on ? <Volume2 size={14} /> : <VolumeX size={14} />}
    </button>
  );
}
