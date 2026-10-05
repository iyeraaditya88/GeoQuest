import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Swords, X } from 'lucide-react';
import { GAMES, INVITE_MS, QUIZ_MODES, type Invite } from '../lib/match';

interface Props {
  invites: Invite[];
  onAccept: (inv: Invite) => void;
  onDecline: (inv: Invite) => void;
  onExpire: (inv: Invite) => void;
}

/** Incoming challenges, top-right, each with a ring that runs out after 30 s. */
export function ChallengeToasts({ invites, onAccept, onDecline, onExpire }: Props) {
  return (
    <div className="ch-toasts" aria-live="polite">
      <AnimatePresence>
        {invites.map((inv) => <Toast key={inv.id} inv={inv} onAccept={onAccept} onDecline={onDecline} onExpire={onExpire} />)}
      </AnimatePresence>
    </div>
  );
}

function Toast({ inv, onAccept, onDecline, onExpire }: { inv: Invite } & Omit<Props, 'invites'>) {
  // Time left, measured on this device from when the invite arrived (clocks can differ).
  const [end] = useState(() => Date.now() + Math.min(INVITE_MS, Math.max(5000, INVITE_MS - (Date.now() - inv.at))));
  const [left, setLeft] = useState(1);
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
    return () => { cancelAnimationFrame(raf); window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const others = inv.players.filter((p) => p !== inv.from).length - 1;
  const g = GAMES[inv.game];
  const detail = inv.game === 'quiz' ? QUIZ_MODES.find((m) => m.id === inv.opts?.mode)?.label : inv.game === 'capitals' ? (inv.opts?.level === 'all' ? 'All countries' : 'Big countries') : null;
  const R = 17, C = 2 * Math.PI * R;
  return (
    <motion.div className="ch-toast" layout initial={{ x: 60, opacity: 0, scale: 0.96 }} animate={{ x: 0, opacity: 1, scale: 1 }} exit={{ x: 60, opacity: 0, scale: 0.96 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
      <span className="ch-ring">
        <svg viewBox="0 0 40 40" aria-hidden><circle cx="20" cy="20" r={R} className="bg" /><circle cx="20" cy="20" r={R} className="fg" strokeDasharray={C} strokeDashoffset={C * (1 - left)} /></svg>
        <span className="pp-avatar member">{inv.from[0]?.toUpperCase()}</span>
      </span>
      <div className="ch-text">
        <b><Swords size={12} /> {inv.from} challenges you</b>
        <span>{g.label}{detail ? ` · ${detail}` : ''}{others > 0 ? ` · with ${others} more` : ''}</span>
      </div>
      <button className="ch-btn no" onClick={() => onDecline(inv)} aria-label="Decline"><X size={15} /></button>
      <button className="ch-btn yes" onClick={() => onAccept(inv)}><Check size={15} /> Play</button>
    </motion.div>
  );
}
