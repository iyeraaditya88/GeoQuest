import { useEffect, useMemo, useRef, useState } from 'react';
import { prefetchCountry } from '../lib/globeOverlays';
import { AnimatePresence, motion } from 'motion/react';
import Fuse from 'fuse.js';
import { Search, CornerDownLeft } from 'lucide-react';
import { COUNTRIES, MAPPABLE, flagUrl, fmtCompact } from '../lib/data';

const fuse = new Fuse(COUNTRIES.filter((c) => MAPPABLE.has(c.cca3)), {
  keys: [{ name: 'name', weight: 3 }, { name: 'official', weight: 1 }, { name: 'capital', weight: 1.5 }, { name: 'cca3', weight: 1 }, { name: 'cca2', weight: 0.5 }],
  threshold: 0.32,
});

export function SearchPalette({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (cca3: string) => void }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setQ(''); setIdx(0); setTimeout(() => input.current?.focus(), 30); }
  }, [open]);

  const results = useMemo(() => {
    if (!q.trim()) return [...COUNTRIES].filter((c) => MAPPABLE.has(c.cca3)).sort((a, b) => b.population - a.population).slice(0, 8);
    return fuse.search(q).slice(0, 8).map((r) => r.item);
  }, [q]);

  const pick = (cca3: string) => { onPick(cca3); onClose(); };

  // Warm the highlighted result's provinces + flag so picking it feels instant.
  const active = results[idx];
  useEffect(() => {
    if (!open || !active) return;
    const t = window.setTimeout(() => prefetchCountry(active.cca3, active.cca2), 150);
    return () => window.clearTimeout(t);
  }, [open, active]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.div
            className="palette"
            initial={{ y: -20, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: -10, scale: 0.98, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="palette-input">
              <Search size={18} />
              <input
                ref={input}
                value={q}
                placeholder="Search a country, capital or code…"
                onChange={(e) => { setQ(e.target.value); setIdx(0); }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
                  if (e.key === 'Enter' && results[idx]) pick(results[idx].cca3);
                  if (e.key === 'Escape') onClose();
                }}
              />
              <kbd>esc</kbd>
            </div>
            {!q.trim() && <div className="palette-hint">Most populous</div>}
            <ul className="palette-list">
              {results.map((c, i) => (
                <li key={c.cca3} className={i === idx ? 'on' : ''} onMouseEnter={() => setIdx(i)} onClick={() => pick(c.cca3)}>
                  <img src={flagUrl(c.cca2, 80)} alt="" />
                  <div className="pl-main">
                    <b>{c.name}</b>
                    <span>{c.capital[0] ?? '—'} · {c.subregion || c.region}</span>
                  </div>
                  <span className="pl-pop">{fmtCompact(c.population)}</span>
                  {i === idx && <CornerDownLeft size={14} className="pl-enter" />}
                </li>
              ))}
              {results.length === 0 && <li className="empty">No matches for “{q}”</li>}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
