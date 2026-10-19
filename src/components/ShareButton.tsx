import { useState, type MouseEvent } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { shareText, type ShareGame } from '../lib/share';

interface Props {
  game: ShareGame;
  text: () => string;          // built on tap (so it's always current)
  kind?: 'invite' | 'result';
  label?: string;              // omit for an icon-only button
  className?: string;
}

/** One share button for every game: share sheet or clipboard, with a "Copied" confirmation. */
export function ShareButton({ game, text, kind = 'result', label, className = 'ghost-cta' }: Props) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const canSheet = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const go = async (e: MouseEvent) => {
    e.stopPropagation();
    const r = await shareText(game, text(), kind);
    if (r === 'copied' || r === 'failed') { setState(r); window.setTimeout(() => setState('idle'), 1800); }
  };
  const Icon = state === 'copied' ? Check : canSheet || !label ? Share2 : Copy; // icon-only: always the share icon
  const words = label && (state === 'copied' ? 'Copied' : state === 'failed' ? 'Couldn’t copy' : label);
  return (
    <button type="button" className={className} onClick={(e) => void go(e)} aria-label={label ? undefined : `Share ${kind === 'invite' ? 'this game' : 'your result'}`} title={label ? undefined : 'Share'}>
      <Icon size={15} />{words && <span>{words}</span>}
    </button>
  );
}
