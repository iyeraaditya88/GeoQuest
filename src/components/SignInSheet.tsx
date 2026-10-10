import { useEffect } from 'react';
import { motion } from 'motion/react';
import { BellRing, CalendarDays, MapPin, Sparkles, Swords, X } from 'lucide-react';
import type { SignInReason } from '../lib/session';
import { track } from '../lib/analytics';

const COPY: Record<SignInReason, { title: string; sub: string }> = {
  friends: { title: 'Challenge your friends', sub: 'Play live, head-to-head — the same questions at the same moment, with a live scoreboard and chat.' },
  places: { title: 'Save your places', sub: 'Pin home, friends and favourite spots on the globe — kept safely with your account.' },
  daily: { title: 'Keep your streak', sub: 'Save today’s score, build a daily streak and see how your friends did.' },
  reminders: { title: 'Get a morning nudge', sub: 'A gentle reminder each morning with the new Daily challenge.' },
  atlas: { title: 'Keep asking the Atlas', sub: 'Guests get a few questions a day — with an account you can ask much more.' },
  expired: { title: 'Please sign in again', sub: 'Your sign-in has expired. Everything you saved is still there.' },
  general: { title: 'Do more with a free account', sub: 'GeoQuest is free to explore. Sign in to play with friends and keep your progress.' },
};
const PERKS = [
  { icon: Swords, text: 'Challenge friends to live matches' },
  { icon: CalendarDays, text: 'Daily streaks and today’s leaderboard' },
  { icon: MapPin, text: 'Save your places on the globe' },
  { icon: BellRing, text: 'Morning reminders' },
  { icon: Sparkles, text: 'More questions for the Atlas' },
];

/** "Sign in to …": shown when a guest reaches for something that needs an account. */
export function SignInSheet({ reason, onClose }: { reason: SignInReason; onClose: () => void }) {
  const c = COPY[reason];
  const back = location.pathname + location.search;
  const next = back !== '/' ? `&next=${encodeURIComponent(back)}` : '';
  useEffect(() => {
    track('signin_prompt', { r: reason });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reason, onClose]);

  return (
    <motion.div className="people-backdrop si-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section className="si-sheet" role="dialog" aria-modal="true" aria-labelledby="si-title" onClick={(e) => e.stopPropagation()}
        initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
        <button className="icon-btn si-close" onClick={onClose} aria-label="Not now"><X size={17} /></button>
        <div className="si-globe" aria-hidden><span /></div>
        <h2 id="si-title">{c.title}</h2>
        <p className="si-sub">{c.sub}</p>
        {reason !== 'expired' && (
          <ul className="si-perks">
            {PERKS.map(({ icon: Icon, text }) => <li key={text}><Icon size={15} /> {text}</li>)}
          </ul>
        )}
        <div className="si-actions">
          {reason === 'expired' ? (
            <a className="primary si-go" href={`/login?tab=signin${next}`}>Sign in</a>
          ) : (
            <>
              <a className="primary si-go" href={`/login?tab=signup${next}`}>Create free account</a>
              <a className="si-alt" href={`/login?tab=signin${next}`}>I have an account — <b>Sign in</b></a>
            </>
          )}
        </div>
        <button className="si-later" onClick={onClose}>Not now — keep exploring</button>
      </motion.section>
    </motion.div>
  );
}
