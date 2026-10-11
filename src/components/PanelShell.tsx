import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { sidePanel } from '../lib/layout';

const subscribe = (fn: () => void) => { window.addEventListener('resize', fn); return () => window.removeEventListener('resize', fn); };
/** True when the info panel is a bottom sheet (phones held upright). */
export const useIsSheet = () => useSyncExternalStore(subscribe, () => !sidePanel(window.innerWidth, window.innerHeight));

/**
 * The info panel's frame: a side panel on wide screens; on phones a bottom sheet that slides up,
 * grows to full height when you scroll or swipe up, and swipes down to shrink (or close).
 * `id` is what's showing — a new country starts at the normal height again.
 */
export function PanelShell({ id, onClose, children }: { id: string; onClose: () => void; children: ReactNode }) {
  const sheet = useIsSheet();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const expanded = sheet && expandedId === id;
  const startY = useRef<number | null>(null);
  const off = sheet ? { y: '100%' } : { x: '100%' };

  return (
    <motion.aside
      className={`panel ${expanded ? 'expanded' : ''}`}
      initial={off}
      animate={{ x: 0, y: 0 }}
      exit={off}
      transition={{ type: 'spring', stiffness: 300, damping: 36, mass: 0.9 }}
      onScrollCapture={(e) => {
        const t = e.target as HTMLElement;
        if (sheet && !expanded && t.classList?.contains('panel-scroll') && t.scrollTop > 12) setExpandedId(id);
      }}
      onTouchStart={(e) => { startY.current = sheet && !(e.target as HTMLElement).closest('.panel-scroll, .panel-foot') ? e.touches[0].clientY : null; }}
      onTouchEnd={(e) => {
        if (startY.current === null) return;
        const dy = e.changedTouches[0].clientY - startY.current;
        startY.current = null;
        if (dy > 60) { if (expanded) setExpandedId(null); else onClose(); }
        else if (dy < -40) setExpandedId(id);
      }}
    >
      {sheet && (
        <button className="sheet-grab" onClick={() => setExpandedId(expanded ? null : id)} aria-label={expanded ? 'Show less' : 'Show more'}><i /></button>
      )}
      {children}
    </motion.aside>
  );
}
