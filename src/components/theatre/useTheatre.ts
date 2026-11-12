import { useEffect, useRef, useState, type TouchEvent } from 'react';

/** How much of the screen a panel covers: a bottom sheet (phones) or a column on the left. */
export interface Inset { left: number; bottom: number }

/**
 * Theatre mode for a panel that plays something on the map (a war, a battle, a voyage). On a
 * phone the sheet "peeks": just a slim now-playing card, so the map has the screen; swipe it up
 * (or tap the handle) for the details, down to watch again. Larger screens ignore `peek` (CSS).
 *
 * Also reports how much of the screen the panel covers, so the map frames what's left.
 */
export function useTheatre(active: boolean, onInset?: (i: Inset) => void) {
  const ref = useRef<HTMLElement>(null);
  const [peek, setPeek] = useState(true);
  const startY = useRef<number | null>(null);
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) { setWasActive(active); if (active) setPeek(true); }

  useEffect(() => {
    const el = ref.current;
    if (!el || !onInset) return;
    let last = '';
    // Layout sizes, not the on-screen box: they ignore the panel's entrance animation.
    const measure = () => {
      const sheet = el.offsetWidth >= window.innerWidth - 4;
      // (Never more than the screen: a long list, before its sheet settles, can measure taller.)
      const i: Inset = sheet ? { left: 0, bottom: Math.min(el.offsetHeight, window.innerHeight) } : { left: el.offsetLeft + el.offsetWidth, bottom: 0 };
      const key = `${i.left},${i.bottom}`;
      if (key !== last) { last = key; onInset(i); }
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [onInset]);

  const swipe = {
    onTouchStart: (e: TouchEvent) => {
      const t = e.target as HTMLElement;
      const scroll = t.closest('.voy-scroll');
      // Not from a slider; and in the details, only from the top (otherwise it's a scroll).
      startY.current = active && !t.closest('input[type="range"]') && (peek || !scroll || scroll.scrollTop <= 0) ? e.touches[0].clientY : null;
    },
    onTouchEnd: (e: TouchEvent) => {
      if (startY.current === null) return;
      const dy = e.changedTouches[0].clientY - startY.current;
      startY.current = null;
      if (peek && dy < -40) setPeek(false);
      else if (!peek && dy > 60) setPeek(true);
    },
  };
  return { ref, peek: active && peek, setPeek, swipe };
}
