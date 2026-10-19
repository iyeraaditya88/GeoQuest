import { useEffect, useRef, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Binoculars, Brain, CalendarDays, Check, Gamepad2, Grid3x3, HatGlasses, Landmark, ListOrdered, Shapes, Swords, X } from 'lucide-react';
import { track } from '../lib/analytics';
import { inviteText, isShareGame } from '../lib/share';
import { ShareButton } from './ShareButton';

export type GameKey = 'daily' | 'quiz' | 'street' | 'wordle' | 'mystery' | 'shapes' | 'capitals' | 'trivia' | 'top5' | 'duel';

interface Props {
  daily: { done: boolean; streak: number };
  /** Signed in with live play (Duel opens the panel), or a guest (Duel asks them to sign in) */
  duel: 'play' | 'sign-in' | null;
  onPick: (g: GameKey) => void;
  onClose: () => void;
}

/** Every game, one tap away: what the Play button opens. */
export function GamesSheet({ daily, duel, onPick, onClose }: Props) {
  const startY = useRef<number | null>(null);
  useEffect(() => { track('open', { w: 'games' }); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = (g: GameKey) => { track('launch', { g, v: 'sheet' }); onPick(g); };
  const games: { key: GameKey; icon: typeof Gamepad2; name: string; line: string; tone: string; badge?: ReactNode }[] = [
    {
      key: 'daily', icon: CalendarDays, name: 'Daily challenge', tone: 'gold',
      line: daily.done ? `Done today${daily.streak > 1 ? ` · 🔥 ${daily.streak}` : ''} · see result` : `5 new countries today${daily.streak > 1 ? ` · 🔥 ${daily.streak}` : ''}`,
      badge: daily.done ? <span className="gs-done" aria-label="Done today"><Check size={12} /></span> : <span className="gs-new">New</span>,
    },
    { key: 'wordle', icon: Grid3x3, name: 'Geo Wordle', line: 'Wordle, but it’s a country', tone: 'lime' },
    { key: 'mystery', icon: HatGlasses, name: 'Solve the Mystery', line: 'Chase a thief across the world', tone: 'indigo', badge: <span className="gs-new">New</span> },
    { key: 'quiz', icon: Gamepad2, name: 'Map quiz', line: 'Find countries, flags or clues', tone: 'blue' },
    { key: 'top5', icon: ListOrdered, name: 'Name the Top 5', line: 'Rivers, peaks, populations…', tone: 'teal' },
    { key: 'trivia', icon: Brain, name: 'Geo Trivia', line: 'Gets harder as you get better', tone: 'violet' },
    { key: 'shapes', icon: Shapes, name: 'Guess the Country', line: 'Name it from its outline', tone: 'rose' },
    { key: 'street', icon: Binoculars, name: 'Street View', line: 'Where in the world are you?', tone: 'green' },
    { key: 'capitals', icon: Landmark, name: 'Capitals', line: 'Country ↔ capital, 10 a round', tone: 'amber' },
  ];
  if (duel) games.push({ key: 'duel', icon: Swords, name: 'Duel a friend', line: duel === 'play' ? 'Live, head-to-head' : 'Sign in to play friends live', tone: 'pink' });

  return (
    <motion.div className="people-backdrop gs-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section className="gs-sheet" role="dialog" aria-modal="true" aria-labelledby="gs-title" onClick={(e) => e.stopPropagation()}
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} transition={{ type: 'spring', stiffness: 340, damping: 32 }}
        onTouchStart={(e) => { startY.current = (e.target as HTMLElement).closest('.gs-grid') ? null : e.touches[0].clientY; }}
        onTouchEnd={(e) => { if (startY.current !== null && e.changedTouches[0].clientY - startY.current > 60) onClose(); startY.current = null; }}>
        <span className="gs-grab" aria-hidden />
        <header className="gs-head">
          <h2 id="gs-title">Play</h2>
          <span>Pick a game — they all start right here on the globe</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="gs-grid">
          {games.map(({ key, icon: Icon, name, line, tone, badge }) => (
            <div key={key} className={`gs-item ${key === 'daily' ? 'wide' : ''}`}>
              <button className={`gs-card t-${tone} ${key === 'daily' ? 'wide' : ''}`} onClick={() => pick(key)}>
                <span className="gs-icon"><Icon size={20} /></span>
                <span className="gs-text"><b>{name}</b><span>{line}</span></span>
                {badge}
              </button>
              {isShareGame(key) && <ShareButton game={key} kind="invite" text={() => inviteText(key)} className="gs-share" />}
            </div>
          ))}
        </div>
      </motion.section>
    </motion.div>
  );
}
