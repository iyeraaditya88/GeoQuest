import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Play } from 'lucide-react';

const ROOM = 180; // the button and its label need about this much clear map
const TOP = 64; // (the app's own buttons along the top)

/**
 * Where the button goes: the middle of the map that's still showing beside or above the story's
 * panel, or nowhere when the panel has the screen (its player's own play button is right there).
 */
function useSpot() {
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const panel = document.querySelector<HTMLElement>('.voy-panel.theatre');
    const put = (n: { x: number; y: number } | null) => setSpot((o) => (o && n && Math.abs(o.x - n.x) < 2 && Math.abs(o.y - n.y) < 2) || (!o && !n) ? o : n);
    const place = () => {
      const W = window.innerWidth, H = window.innerHeight;
      const p = panel?.getBoundingClientRect();
      if (!p) { put({ x: W / 2, y: H * 0.38 }); return; }
      if (p.left < W * 0.25 && p.right > W * 0.75) {
        // A sheet along the bottom (phones): above it, clear of its back and close buttons.
        const bottom = p.top - 54;
        put(bottom - TOP < ROOM ? null : { x: W / 2, y: (TOP + bottom) / 2 });
      } else {
        // A column at the side: the middle of the rest.
        const left = p.right, right = W;
        put(right - left < ROOM ? null : { x: (left + right) / 2, y: H * 0.45 });
      }
    };
    place();
    const ro = panel ? new ResizeObserver(place) : null;
    if (panel) ro!.observe(panel);
    window.addEventListener('resize', place);
    // (The sheet slides between its sizes: look again once it has settled.)
    const t = window.setInterval(place, 400);
    return () => { ro?.disconnect(); window.removeEventListener('resize', place); window.clearInterval(t); };
  }, []);
  return spot;
}

/**
 * A story, just opened: it waits here, like a video, and the tap starts George and the map
 * together (and from a shared link, it's the tap browsers need before sound can start).
 * (Over the map, outside the panel, which moves.)
 */
export function StartStory({ onStart, narrated = true }: { onStart: () => void; narrated?: boolean }) {
  const spot = useSpot();
  if (!spot) return null;
  return createPortal(
    <motion.button className="start-story" onClick={onStart} aria-label={narrated ? 'Play the story, narrated' : 'Play the story'} style={{ left: spot.x, top: spot.y }}
      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.4 }}>
      <i><Play size={30} fill="currentColor" /></i>
      <span>Play the story{narrated && <small>narrated</small>}</span>
    </motion.button>,
    document.body,
  );
}
