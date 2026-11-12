import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Play } from 'lucide-react';

/**
 * A story, just opened: it waits here, like a video, and the tap starts George and the map
 * together (and from a shared link, it's the tap browsers need before sound can start).
 * (Over the map, outside the panel, which moves.)
 */
export function StartStory({ onStart, narrated = true }: { onStart: () => void; narrated?: boolean }) {
  return createPortal(
    <motion.button className="start-story" onClick={onStart} aria-label={narrated ? 'Play the story, narrated' : 'Play the story'}
      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.4 }}>
      <i><Play size={30} fill="currentColor" /></i>
      <span>Play the story{narrated && <small>narrated</small>}</span>
    </motion.button>,
    document.body,
  );
}
