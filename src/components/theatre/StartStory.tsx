import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Play } from 'lucide-react';

/**
 * A story opened from a shared link: browsers only let sound start from a tap, so instead of
 * playing in silence it waits here, like a video, and the tap starts George and the map together.
 * (Over the map, outside the panel, which moves.)
 */
export function StartStory({ onStart }: { onStart: () => void }) {
  return createPortal(
    <motion.button className="start-story" onClick={onStart} aria-label="Play the story, narrated"
      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.4 }}>
      <i><Play size={30} fill="currentColor" /></i>
      <span>Play the story<small>narrated</small></span>
    </motion.button>,
    document.body,
  );
}
