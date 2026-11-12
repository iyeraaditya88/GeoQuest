import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { wikiPhoto } from '../../lib/wiki';
import type { Mark } from '../../lib/narrator';

type Person = Extract<Mark, { t: 'person' }>;
const SIDE = { a: '#2f6fe8', b: '#dc3b3b' } as const;

/** A portrait, fetched once (and kept) from the person's Wikipedia page. */
function Portrait({ p }: { p: Person }) {
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  useEffect(() => { let live = true; void wikiPhoto(p.wiki).then((s) => { if (live) setSrc(s); }); return () => { live = false; }; }, [p.wiki]);
  const initials = p.name.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join('');
  return (
    <span className="pc-photo">
      {src ? <img src={src} alt="" onError={() => setSrc(null)} /> : <i aria-hidden>{src === null ? initials : ''}</i>}
    </span>
  );
}

/** Start fetching the portraits of everyone in a clip, so a card has its picture as it arrives. */
export function prefetchPortraits(marks: Mark[]) {
  for (const m of marks) if (m.t === 'person') void wikiPhoto(m.wiki).then((s) => { if (s) new Image().src = s; });
}

/**
 * Who George is talking about: a caption over the top of the map, as a documentary names the
 * person on screen. It comes in as they're named and leaves a sentence later.
 */
export function PersonCards({ people, left }: { people: Person[]; left: number }) {
  return (
    <div className="pc-stack" style={{ ['--pc-left' as string]: `${left}px` }} aria-live="polite">
      <AnimatePresence initial={false}>
        {people.map((p) => (
          <motion.div key={p.wiki} className="pc-card" style={{ ['--c' as string]: p.side ? SIDE[p.side] : '#d9b588' }} layout
            initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10, transition: { duration: 0.35 } }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}>
            <Portrait p={p} />
            <span className="pc-text">
              <b>{p.name}</b>
              <span>{p.role}</span>
              <small>Portrait · Wikipedia</small>
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
