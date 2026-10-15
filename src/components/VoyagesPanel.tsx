import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Anchor, ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Pause, Route, Sailboat, Ship, Sparkles, Users, Waves, X } from 'lucide-react';
import { flagUrl } from '../lib/data';
import { VOYAGES, BY_VOYAGE, voyageKm, type Voyage } from '../lib/voyages';
import { track } from '../lib/analytics';

interface Props {
  active: string | null;
  hover?: string | null;   // a route hovered on the globe
  stop: number | null;
  sailing: boolean;
  onPick: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onStop: (i: number | null) => void;
  onSail: (on: boolean) => void;
  onClose: () => void;
}

const fmtKm = (n: number) => `≈ ${(Math.round(n / 500) * 500).toLocaleString('en-US')} km`;
// The timeline's chapters.
const ERAS = [
  { to: 1450, name: 'Early voyagers', sub: 'By the stars, the swells and the sagas' },
  { to: 1600, name: 'The Age of Discovery', sub: 'Europe sails for the spice trade — and finds the Americas' },
  { to: 1800, name: 'Charting the oceans', sub: 'Empires, science and the great Pacific' },
  { to: Infinity, name: 'Ice, science & adventure', sub: 'The poles, the Galápagos and a balsa raft' },
];
const eraOf = (year: number) => ERAS.findIndex((e) => year < e.to);

// Portraits from Wikipedia (once per page).
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
const Flag = ({ v, w = 80, className }: { v: Voyage; w?: 80 | 160; className?: string }) =>
  v.flag ? <img className={className} src={flagUrl(v.flag, w)} alt={v.sailedFor} title={`Sailed for ${v.sailedFor}`} /> : <Waves className={className} size={16} aria-label={v.sailedFor} />;

/** Famous voyages: a timeline of them, and each one's story — routes and stops on the globe. */
export function VoyagesPanel({ active, hover = null, stop, sailing, onPick, onHover, onStop, onSail, onClose }: Props) {
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
      initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
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
            ? <Detail key={v.id} v={v} stop={stop} sailing={sailing} onStop={onStop} onSail={onSail} onPick={onPick} />
            : <List key="list" hover={hover} onPick={onPick} onHover={onHover} />}
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}

function List({ hover, onPick, onHover }: { hover: string | null; onPick: (id: string) => void; onHover: (id: string | null) => void }) {
  return (
    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.18 }} onMouseLeave={() => onHover(null)}>
      <ol className="vy-list">
        {VOYAGES.map((v, i) => {
          const era = eraOf(v.year);
          const newEra = i === 0 || eraOf(VOYAGES[i - 1].year) !== era;
          const died = v.deaths?.map((d) => d.who).join(', ');
          return (
            <Fragment key={v.id}>
              {newEra && (
                <li className="vy-era" aria-hidden={false}>
                  <b>{ERAS[era].name}</b><span>{ERAS[era].sub}</span>
                </li>
              )}
              <motion.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(0.4, 0.025 * i) }}>
                <button className={`vy-row ${hover === v.id ? 'hl' : ''}`} style={{ ['--c' as string]: v.color }} onClick={() => { track('voyage', { v: v.id }); onPick(v.id); }}
                  onMouseEnter={() => onHover(v.id)} onFocus={() => onHover(v.id)}>
                  <span className="vy-year">{v.years.replace(/ – .*/, '')}</span>
                  <span className="vy-line" aria-hidden />
                  <span className="vy-text">
                    <b>{v.voyager}{died && <em className="vy-dagger" title={`Died on this voyage: ${died}`}>†</em>}</b>
                    <span>{v.tagline}</span>
                  </span>
                  <Flag v={v} className="vy-flag" />
                  <ChevronRight size={16} className="vy-go" />
                </button>
              </motion.li>
            </Fragment>
          );
        })}
      </ol>
      <p className="vy-legend"><em>†</em> a life lost on the voyage</p>
    </motion.div>
  );
}

function Detail({ v, stop, sailing, onStop, onSail, onPick }: { v: Voyage; stop: number | null; sailing: boolean; onStop: (i: number | null) => void; onSail: (on: boolean) => void; onPick: (id: string) => void }) {
  const idx = VOYAGES.indexOf(v);
  const prev = VOYAGES[idx - 1], next = VOYAGES[idx + 1];
  const dist = useMemo(() => voyageKm(v), [v]);
  const deathAt = useMemo(() => new Map((v.deaths ?? []).map((d) => [d.stop, d])), [v]);
  const stopRefs = useRef<(HTMLLIElement | null)[]>([]);
  useEffect(() => { if (stop !== null) stopRefs.current[stop]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [stop]);

  const sail = () => {
    if (!sailing) track('voyage', { v: v.id, m: 'sail' });
    onSail(!sailing);
  };
  const atEnd = stop === v.stops.length - 1;

  return (
    <motion.div className="vy-detail" style={{ ['--c' as string]: v.color }} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 14 }} transition={{ duration: 0.2 }}>
      <div className="vy-hero">
        <Portrait v={v} />
        <div className="vy-who">
          <b>{v.voyager}</b>
          <span>{v.life}</span>
          <span className="vy-for"><Flag v={v} /> Sailed for {v.sailedFor}</span>
        </div>
      </div>
      <h2 className="vy-title">{v.title}</h2>

      <div className="vy-facts">
        <span><CalendarDays size={14} /> {v.years}</span>
        <span><Route size={14} /> {fmtKm(dist)}</span>
        <span><Anchor size={14} /> {v.ships}</span>
        <span><Users size={14} /> {v.crew}</span>
      </div>

      {v.deaths?.map((d) => (
        <button key={d.stop} className="vy-death" onClick={() => onStop(d.stop)}>
          <em>†</em>
          <span><b>{d.who}</b> — lost on this voyage<small>{v.stops[d.stop].name} · {v.stops[d.stop].when}</small></span>
        </button>
      ))}

      <p className="vy-story">{v.story}</p>

      <button className={`vy-tour ${sailing ? 'on' : ''}`} onClick={sail}>
        {sailing ? <><Pause size={15} /> Pause the voyage</> : <><Sailboat size={16} /> {stop !== null && !atEnd ? 'Sail on' : 'Follow the voyage'}</>}
        <em>{stop !== null ? `${stop + 1} / ${v.stops.length}` : `${v.stops.length} stops`}</em>
      </button>

      <ol className="vy-stops">
        {v.stops.map((s, i) => {
          const death = deathAt.get(i);
          return (
            <li key={i} ref={(el) => { stopRefs.current[i] = el; }} className={`${stop === i ? 'on' : ''} ${death ? 'dead' : ''}`}>
              <button onClick={() => onStop(stop === i && !sailing ? null : i)}>
                <i>{death ? '†' : i + 1}</i>
                <span className="vs-body">
                  <span className="vs-top"><b>{s.name}</b><em>{s.when}</em></span>
                  <span className="vs-note">{s.note}</span>
                  {death && <span className="vs-death">{death.text}</span>}
                </span>
              </button>
            </li>
          );
        })}
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
