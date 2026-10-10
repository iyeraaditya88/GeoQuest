import { useSyncExternalStore } from 'react';
import { VolumeX } from 'lucide-react';
import { music, musicMuted } from '../lib/music';

/**
 * Music on/off. Little dancing bars while it plays; a crossed speaker when muted. Until the first
 * tap (phones won't play sound before one) it pulses gently with "Tap anywhere for music".
 */
export function MusicButton({ className = '' }: { className?: string }) {
  const muted = useSyncExternalStore(music.subscribe, musicMuted);
  const status = useSyncExternalStore(music.subscribe, music.status);
  return (
    <button
      className={`music-btn ${muted ? 'off' : ''} ${status === 'waiting' ? 'waiting' : ''} ${className}`}
      onClick={(e) => { e.stopPropagation(); music.setMuted(!muted); }}
      aria-label={muted ? 'Turn music on' : 'Mute music'}
      aria-pressed={!muted}
      title={muted ? 'Music off — tap to turn on' : 'Music on — tap to mute'}
    >
      {muted ? <VolumeX size={18} /> : (
        // A speaker whose sound waves ripple while the music plays (bars looked like a chart).
        <svg className="spk" viewBox="0 0 24 24" width="19" height="19" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" fillOpacity="0.25" />
          <path className="w1" d="M15.5 9.5a4 4 0 0 1 0 5" />
          <path className="w2" d="M18.5 7a8 8 0 0 1 0 10" />
        </svg>
      )}
      {status === 'waiting' && <span className="music-hint" aria-hidden>Tap anywhere for music</span>}
    </button>
  );
}
