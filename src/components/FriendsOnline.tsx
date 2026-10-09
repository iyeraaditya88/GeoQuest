import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Star, Swords, Users } from 'lucide-react';
import { useFavorites } from '../lib/favorites';

interface Props {
  me: string;
  /** Who's online now (lobby presence), with whether they're in a game */
  online: Map<string, { s?: string }>;
  className?: string;
  /** Challenge this friend (opens the challenge panel with them picked) */
  onDuel: (name: string) => void;
  /** Open the full friends / challenge panel */
  onManage: () => void;
}

/** Top-right, next to the music: which favourite friends are online — one tap to challenge them. */
export function FriendsOnline({ me, online, className = '', onDuel, onManage }: Props) {
  const { favs } = useFavorites(me);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const rows = favs
    .map((name) => ({ name, here: online.has(name), playing: online.get(name)?.s === 'playing' }))
    .sort((a, b) => Number(b.here) - Number(a.here) || Number(a.playing) - Number(b.playing) || a.name.localeCompare(b.name));
  const count = rows.filter((r) => r.here).length;

  // Close on a click elsewhere, or Esc.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div className={`fo ${className}`} ref={root}>
      <button className={`music-btn fo-btn ${count ? 'live' : ''}`} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-label={count ? `${count} favourite${count === 1 ? '' : 's'} online` : 'Favourite friends'} aria-expanded={open} title="Favourites online">
        <Users size={17} />
        {count > 0 && <span className="fo-count">{count}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="fo-pop" role="dialog" aria-label="Favourite friends" onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
            <header><b>Favourites</b><span>{count ? `${count} online` : 'nobody online'}</span></header>
            {rows.length ? (
              <ul>
                {rows.map((r) => (
                  <li key={r.name} className={r.here ? 'on' : ''}>
                    <span className="pp-avatar member">{r.name[0]?.toUpperCase()}<i className={r.playing ? 'busy' : r.here ? 'on' : ''} /></span>
                    <span className="fo-who"><b>{r.name}</b><span>{r.playing ? 'In a game' : r.here ? 'Online' : 'Offline'}</span></span>
                    {r.here && !r.playing && <button className="fo-duel" onClick={() => { setOpen(false); onDuel(r.name); }}><Swords size={13} /> Duel</button>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="fo-empty"><Star size={14} /> Star friends in Challenge and they’ll show up here.</p>
            )}
            <button className="fo-manage" onClick={() => { setOpen(false); onManage(); }}>{rows.length ? 'All friends & challenges' : 'Find friends'}</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
