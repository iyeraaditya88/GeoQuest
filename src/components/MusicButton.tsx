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
      {muted ? <VolumeX size={17} /> : <span className="eq" aria-hidden><i /><i /><i /><i /></span>}
      {status === 'waiting' && <span className="music-hint" aria-hidden>Tap anywhere for music</span>}
    </button>
  );
}
