import { useEffect, useRef } from 'react';
import { cursor } from '../lib/cursor';
import { flagUrl } from '../lib/data';

// The cursor itself is a native CSS cursor (drawn by the OS, so it never lags);
// this component only swaps its state via classes and moves a small name card
// that sits exactly at the pointer — no easing, no trailing.
export function CustomCursor() {
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const html = document.documentElement;
    const c = card.current!;
    let x = 0, y = 0, raf = 0, last = '';

    const place = () => { raf = 0; c.style.transform = `translate3d(${x + 18}px, ${y + 14}px, 0)`; };
    const move = (e: PointerEvent) => {
      x = e.clientX; y = e.clientY;
      if (!raf) raf = requestAnimationFrame(place);
    };
    const sync = () => {
      const s = cursor.get();
      html.classList.toggle('cur-country', !!s.country && !s.dragging);
      html.classList.toggle('cur-drag', s.dragging);
      const show = !!s.country && !s.dragging && !s.hideLabel;
      c.classList.toggle('on', show);
      const key = s.country ? s.country.cca2 + s.country.name : '';
      if (key && key !== last) {
        last = key;
        c.innerHTML = `<img src="${flagUrl(s.country!.cca2, 80)}" alt="" /><b>${s.country!.name}</b><span>${s.country!.sub}</span>`;
      }
    };

    window.addEventListener('pointermove', move, { passive: true });
    const unsub = cursor.subscribe(sync);
    html.classList.add('custom-cursor');
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      unsub();
      html.classList.remove('custom-cursor', 'cur-country', 'cur-drag');
    };
  }, []);

  return <div ref={card} className="cursor-card" aria-hidden />;
}
