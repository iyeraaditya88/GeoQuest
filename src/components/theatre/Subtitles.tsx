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
    // (Another of the story's clips still on screen while George is on his way to this one — a jump,
    // or the next chapter loading: the words fade out and wait for him, not the summary.)
    if (!l) return narrator.heading() === id && narrator.shownId() ? 'wait' : '';
    return narrator.blocked() ? 'tap' : `${l.k}`;
  });
  const line = snap && snap !== 'wait' ? narrator.line(id) : null;
  if (!line && snap !== 'wait') return <p className="sub-fallback">{fallback}</p>;
  if (snap === 'tap') return <div className="subs"><p className="subs-tap">Tap anywhere to hear the narration</p></div>;
  const k = Number(snap);
  const text = line?.lines[k];
  return (
    <div className="subs" aria-live="off">
      <AnimatePresence mode="wait" initial={false}>
        {text !== undefined && (
          <motion.p key={`${id}#${k}`} className={text.length > 150 ? 'long' : undefined}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.28 }}>
            {text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
