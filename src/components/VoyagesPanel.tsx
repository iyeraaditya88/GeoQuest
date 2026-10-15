import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Anchor, ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Pause, Play, Route, Ship, Sparkles, Users, X } from 'lucide-react';
import { flagUrl } from '../lib/data';
import { VOYAGES, BY_VOYAGE, voyageKm, type Voyage } from '../lib/voyages';
import { track } from '../lib/analytics';

interface Props {
  active: string | null;
  stop: number | null;
  onPick: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onStop: (i: number | null) => void;
  onClose: () => void;
}

const fmtKm = (n: number) => `≈ ${(Math.round(n / 500) * 500).toLocaleString('en-US')} km`;
const TOUR_MS = 3200;

// Portraits from Wikipedia (once per voyager).
const photos = new Map<string, Promise<string | null>>();
function photoFor(page: string) {
  if (!photos.has(page)) {
    photos.set(page, fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { thumbnail?: { source?: string } } | null) => j?.thumbnail?.source ?? null)
      .catch(() => null));
  }
  return photos.get(page)!;
}
function Portrait({ v }: { v: Voyage }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { let live = true; setSrc(null); void photoFor(v.wiki).then((s) => { if (live) setSrc(s); }); return () => { live = false; }; }, [v.wiki]);
  return (
    <span className="vy-portrait" style={{ ['--c' as string]: v.color }}>
      {src ? <img src={src} alt={v.voyager} /> : <Ship size={26} />}
    </span>
  );
}

/** Famous voyages: a timeline of them, and each one's story — routes and stops on the globe. */
export function VoyagesPanel({ active, stop, onPick, onHover, onStop, onClose }: Props) {
  const v = active ? BY_VOYAGE.get(active) ?? null : null;
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [active]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target as HTMLElement)?.closest?.('input, textarea')) return;
      e.stopPropagation();
      if (active) onPick(null); else onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active, onPick, onClose]);

  return (
    <motion.aside className="voy-panel" role="dialog" aria-label="Famous voyages"
      initial={{ opacity: 0, x: -24, y: 0 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
      <span className="voy-grab" aria-hidden />
      <header className="gc-head">
        {v ? (
          <button className="vy-back" onClick={() => onPick(null)}><ArrowLeft size={16} /> All voyages</button>
        ) : (
          <>
            <span className="gc-badge vy-badge"><Ship size={15} /></span>
            <div className="gc-title"><b>Famous voyages</b><span>{VOYAGES.length} journeys that redrew the map</span></div>
          </>
        )}
        <span className="gc-spacer" />
        <button className="icon-btn" onClick={onClose} aria-label="Close voyages"><X size={17} /></button>
      </header>
      <div className="voy-scroll" ref={scroller}>
        <AnimatePresence mode="wait" initial={false}>
          {v
            ? <Detail key={v.id} v={v} stop={stop} onStop={onStop} onPick={onPick} />
            : <List key="list" onPick={onPick} onHover={onHover} />}
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}

function List({ onPick, onHover }: { onPick: (id: string) => void; onHover: (id: string | null) => void }) {
  return (
    <motion.ol className="vy-list" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.18 }} onMouseLeave={() => onHover(null)}>
      {VOYAGES.map((v, i) => (
        <motion.li key={v.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i }}>
          <button className="vy-row" style={{ ['--c' as string]: v.color }} onClick={() => { track('voyage', { v: v.id }); onPick(v.id); }}
            onMouseEnter={() => onHover(v.id)} onFocus={() => onHover(v.id)}>
            <span className="vy-year">{v.years.replace(/ – .*/, '')}</span>
            <span className="vy-line" aria-hidden />
            <span className="vy-text">
              <b>{v.voyager}</b>
              <span>{v.tagline}</span>
            </span>
            <img className="vy-flag" src={flagUrl(v.flag, 80)} alt={v.sailedFor} title={`Sailed for ${v.sailedFor}`} />
            <ChevronRight size={16} className="vy-go" />
          </button>
        </motion.li>
      ))}
    </motion.ol>
  );
}

function Detail({ v, stop, onStop, onPick }: { v: Voyage; stop: number | null; onStop: (i: number | null) => void; onPick: (id: string) => void }) {
  const idx = VOYAGES.indexOf(v);
  const prev = VOYAGES[idx - 1], next = VOYAGES[idx + 1];
  const dist = useMemo(() => voyageKm(v), [v]);
  const [touring, setTouring] = useState(false);
  const stopRefs = useRef<(HTMLLIElement | null)[]>([]);

  // "Follow the voyage": fly from stop to stop.
  useEffect(() => {
    if (!touring) return;
    const at = stop ?? -1;
    if (at >= v.stops.length - 1) { const t = window.setTimeout(() => { setTouring(false); onStop(null); }, TOUR_MS); return () => window.clearTimeout(t); }
    const t = window.setTimeout(() => onStop(at + 1), at < 0 ? 0 : TOUR_MS);
    return () => window.clearTimeout(t);
  }, [touring, stop, v, onStop]);
  useEffect(() => { if (stop !== null) stopRefs.current[stop]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [stop]);

  const tour = () => {
    if (touring) { setTouring(false); return; }
    track('voyage', { v: v.id, m: 'tour' });
    onStop(null);
    setTouring(true);
  };

  return (
    <motion.div className="vy-detail" style={{ ['--c' as string]: v.color }} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 14 }} transition={{ duration: 0.2 }}>
      <div className="vy-hero">
        <Portrait v={v} />
        <div className="vy-who">
          <b>{v.voyager}</b>
          <span>{v.life}</span>
          <span className="vy-for"><img src={flagUrl(v.flag, 80)} alt="" /> Sailed for {v.sailedFor}</span>
        </div>
      </div>
      <h2 className="vy-title">{v.title}</h2>

      <div className="vy-facts">
        <span><CalendarDays size={14} /> {v.years}</span>
        <span><Route size={14} /> {fmtKm(dist)}</span>
        <span><Anchor size={14} /> {v.ships}</span>
        <span><Users size={14} /> {v.crew}</span>
      </div>

      <p className="vy-story">{v.story}</p>

      <button className={`vy-tour ${touring ? 'on' : ''}`} onClick={tour}>
        {touring ? <><Pause size={15} /> Pause the journey</> : <><Play size={15} /> Follow the voyage</>}
        <em>{touring && stop !== null ? `${stop + 1} / ${v.stops.length}` : `${v.stops.length} stops`}</em>
      </button>

      <ol className="vy-stops">
        {v.stops.map((s, i) => (
          <li key={i} ref={(el) => { stopRefs.current[i] = el; }} className={stop === i ? 'on' : ''}>
            <button onClick={() => { setTouring(false); onStop(stop === i ? null : i); }}>
              <i>{i + 1}</i>
              <span className="vs-body">
                <span className="vs-top"><b>{s.name}</b><em>{s.when}</em></span>
                <span className="vs-note">{s.note}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="fr-label"><Sparkles size={12} /> Why it mattered</div>
      <ul className="vy-mattered">{v.mattered.map((m) => <li key={m}>{m}</li>)}</ul>

      <div className="fr-label">About {v.short}</div>
      <p className="vy-bio">{v.bio}</p>
      <a className="vy-wiki" href={`https://en.wikipedia.org/wiki/${v.wiki}`} target="_blank" rel="noopener noreferrer">Read more on Wikipedia <ExternalLink size={13} /></a>

      <nav className="vy-nav" aria-label="More voyages">
        {prev ? <button onClick={() => onPick(prev.id)}><ChevronLeft size={16} /><span><em>Earlier</em>{prev.voyager}</span></button> : <span />}
        {next ? <button className="nx" onClick={() => onPick(next.id)}><span><em>Later</em>{next.voyager}</span><ChevronRight size={16} /></button> : <span />}
      </nav>
    </motion.div>
  );
}
