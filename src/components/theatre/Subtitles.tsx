import { useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { narrator } from '../../lib/narrator';

/**
 * What George is saying, a sentence at a time, in time with his voice. Without narration (off,
 * not recorded, or the clip couldn't play) it shows `fallback`, the event's short summary.
 */
export function Subtitles({ id, fallback }: { id: string; fallback: string }) {
  const snap = useSyncExternalStore(narrator.onTime, () => {
    const l = narrator.line(id);
    return l ? (narrator.blocked() ? 'tap' : `${l.k}`) : '';
  });
  const line = snap ? narrator.line(id) : null;
  if (!line) return <p className="sub-fallback">{fallback}</p>;
  if (snap === 'tap') return <div className="subs"><p className="subs-tap">Tap anywhere to hear the narration</p></div>;
  const k = Number(snap);
  const text = line.lines[k] ?? '';
  return (
    <div className="subs" aria-live="off">
      <AnimatePresence mode="wait" initial={false}>
        <motion.p key={k} className={text.length > 150 ? 'long' : undefined}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.28 }}>
          {text}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
