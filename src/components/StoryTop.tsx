import { motion } from 'motion/react';
import { Play } from 'lucide-react';
import type { StoryPick } from '../lib/historyIndex';
import { localDate } from '../lib/daily';

const KEY = 'gq-story-day';

/** Today's story has been opened on this device (it then leaves the home screen until tomorrow). */
export function storySeenToday() {
  try { return localStorage.getItem(KEY) === localDate(); } catch { return false; }
}
export function noteStorySeen() {
  try { localStorage.setItem(KEY, localDate()); } catch { /* private mode: it just stays */ }
}

/**
 * Today's story, next to the Daily: a quieter pill (glass, a bronze play disc, no pulse), so the
 * Daily still leads. Wide screens show it beside the Daily with its length; phones, one line under it.
 */
export function StoryTop({ story, onPlay }: { story: StoryPick & { min: number | null }; onPlay: () => void }) {
  return (
    <motion.button className="story-top" onClick={onPlay}
      aria-label={`Today’s story: ${story.title}. Play it, narrated${story.min ? `, ${story.min} minute${story.min === 1 ? '' : 's'}` : ''}`}
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      transition={{ delay: 0.75, type: 'spring', stiffness: 300, damping: 28 }}>
      <span className="st-disc" aria-hidden><Play size={11} fill="currentColor" /></span>
      <span className="st-text">
        <small>Today’s story{story.min ? <span className="st-min"> · {story.min} min</span> : null}</small>
        <b>{story.title}</b>
      </span>
    </motion.button>
  );
}
