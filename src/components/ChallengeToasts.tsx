import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Binoculars, Brain, Gamepad2, Landmark, ListOrdered, Swords, Users } from 'lucide-react';
import { GAMES, INVITE_MS, QUIZ_MODES, type GameId, type Invite } from '../lib/match';
import { music } from '../lib/music';
import { buzz } from '../lib/touch';

interface Props {
  invites: Invite[];
  onAccept: (inv: Invite) => void;
  onDecline: (inv: Invite) => void;
  onExpire: (inv: Invite) => void;
}

const ICONS: Record<GameId, typeof Swords> = { quiz: Gamepad2, capitals: Landmark, trivia: Brain, top5: ListOrdered, street: Binoculars };

/**
 * Incoming challenges: a modal in the middle of the screen, so it can't be missed — one at a time
 * (others wait their turn), each with a ring that runs out after 30 s.
 */
export function ChallengeToasts({ invites, onAccept, onDecline, onExpire }: Props) {
  const inv = invites[0];
  return (
    <AnimatePresence>
      {inv && (
        <motion.div key="ch" className="ch-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <AnimatePresence mode="wait">
            <Challenge key={inv.id} inv={inv} waiting={invites.length - 1} onAccept={onAccept} onDecline={onDecline} onExpire={onExpire} />
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Challenge({ inv, waiting, onAccept, onDecline, onExpire }: { inv: Invite; waiting: number } & Omit<Props, 'invites'>) {
  // Time left, measured on this device from when the invite arrived (clocks can differ).
  const [end] = useState(() => Date.now() + Math.min(INVITE_MS, Math.max(5000, INVITE_MS - (Date.now() - inv.at))));
  const [left, setLeft] = useState(1);
  const accept = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let raf = 0;
    const total = end - Date.now();
    const tick = () => {
      const l = (end - Date.now()) / total;
      setLeft(Math.max(0, l));
      if (l <= 0) { onExpire(inv); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // A hidden tab doesn't animate — still expire on time.
    const t = window.setTimeout(() => onExpire(inv), total + 50);
    // Get their attention: a chime and (phones) a buzz. Enter accepts (focused), Esc is "not now".
    music.sfx('good');
    buzz('good');
    accept.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onDecline(inv); } };
    window.addEventListener('keydown', onKey, true);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(t); window.removeEventListener('keydown', onKey, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const secs = Math.max(0, Math.ceil((end - Date.now()) / 1000));
  const g = GAMES[inv.game];
  const Icon = ICONS[inv.game];
  const detail = inv.game === 'quiz' ? QUIZ_MODES.find((m) => m.id === inv.opts?.mode)?.label : inv.game === 'capitals' ? (inv.opts?.level === 'all' ? 'All countries' : 'Big countries') : null;
  const R = 46, C = 2 * Math.PI * R;
  return (
    <motion.section className="ch-modal" role="alertdialog" aria-modal="true" aria-labelledby="ch-title" aria-describedby="ch-game"
      initial={{ y: 24, scale: 0.92, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: -12, scale: 0.96, opacity: 0 }} transition={{ type: 'spring', stiffness: 340, damping: 26 }}>
      <span className="ch-ring">
        <svg viewBox="0 0 100 100" aria-hidden><circle cx="50" cy="50" r={R} className="bg" /><circle cx="50" cy="50" r={R} className="fg" strokeDasharray={C} strokeDashoffset={C * (1 - left)} /></svg>
        <span className="pp-avatar member">{inv.from[0]?.toUpperCase()}</span>
        <motion.span className="ch-swords" initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.2, type: 'spring', stiffness: 400, damping: 14 }}><Swords size={14} /></motion.span>
      </span>
      <h2 id="ch-title"><b>{inv.from}</b> challenges you!</h2>
      <div className="ch-game" id="ch-game">
        <span className="ch-game-icon"><Icon size={18} /></span>
        <div>
          <b>{g.label}{detail ? ` · ${detail}` : ''}</b>
          <span>{g.blurb}</span>
        </div>
      </div>
      {inv.players.length > 2 && <p className="ch-players"><Users size={13} /> {inv.players.length}-player match</p>}
      <div className="ch-actions">
        <button className="ghost-cta" onClick={() => onDecline(inv)}>Not now</button>
        <button className="primary" ref={accept} onClick={() => onAccept(inv)}><Swords size={15} /> Accept &amp; play</button>
      </div>
      <p className="ch-left">{secs > 0 ? `${secs}s to answer` : 'Time’s up'}{waiting > 0 ? ` · ${waiting} more challenge${waiting === 1 ? '' : 's'} waiting` : ''}</p>
    </motion.section>
  );
}
