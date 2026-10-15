import { useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Castle, ChevronLeft, ChevronRight, Crown, ExternalLink, Landmark, MapPin, Maximize2, Sparkles, TrendingDown, Users, X } from 'lucide-react';
import { BY_CCA3, flagUrl } from '../lib/data';
import { EMPIRES, BY_EMPIRE, fmtYear, type Empire } from '../lib/empires';
import { track } from '../lib/analytics';

interface Props {
  active: string | null;
  hover?: string | null;
  place: string | null;        // 'capital' or 'place:<i>'
  onPick: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onPlace: (place: string | null) => void;
  onClose: () => void;
}

// The shared time axis for the timeline bars.
const T0 = -1600, T1 = 2025;
const pos = (y: number) => ((y - T0) / (T1 - T0)) * 100;
const TICKS = [-1500, -1000, -500, 1, 500, 1000, 1500, 2000];
const LABELS = [-1000, 1, 1000, 2000]; // fewer labels than gridlines, so they never crowd
const tickLabel = (y: number) => (y === 1 ? '1 CE' : y < 0 ? `${-y} BCE` : String(y));

/** Empires of the world: a timeline of them, and each one's map and story. */
export function EmpiresPanel({ active, hover = null, place, onPick, onHover, onPlace, onClose }: Props) {
  const emp = active ? BY_EMPIRE.get(active) ?? null : null;
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
    <motion.aside className="voy-panel emp-panel" role="dialog" aria-label="Empires of the world"
      initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
      <span className="voy-grab" aria-hidden />
      <header className="gc-head">
        {emp ? (
          <button className="vy-back" onClick={() => onPick(null)}><ArrowLeft size={16} /> All empires</button>
        ) : (
          <>
            <span className="gc-badge em-badge"><Castle size={15} /></span>
            <div className="gc-title"><b>Empires of the world</b><span>{EMPIRES.length} empires across 3,500 years</span></div>
          </>
        )}
        <span className="gc-spacer" />
        <button className="icon-btn" onClick={onClose} aria-label="Close empires"><X size={17} /></button>
      </header>
      <div className="voy-scroll" ref={scroller}>
        <AnimatePresence mode="wait" initial={false}>
          {emp
            ? <Detail key={emp.id} e={emp} place={place} onPlace={onPlace} onPick={onPick} />
            : <List key="list" hover={hover} onPick={onPick} onHover={onHover} />}
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}

function List({ hover, onPick, onHover }: { hover: string | null; onPick: (id: string) => void; onHover: (id: string | null) => void }) {
  return (
    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.18 }} onMouseLeave={() => onHover(null)}>
      <p className="er-intro">Each bar shows how long an empire lasted. Hover to see its lands at their height on the globe; tap for its story.</p>
      <div className="em-axis" aria-hidden>
        {LABELS.map((t) => <span key={t} style={{ left: `${pos(t)}%` }}>{tickLabel(t)}</span>)}
      </div>
      <ol className="em-list">
        {EMPIRES.map((e, i) => (
          <motion.li key={e.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(0.4, 0.03 * i) }}>
            <button className={`em-row ${hover === e.id ? 'hl' : ''}`} style={{ ['--c' as string]: e.color }} onClick={() => { track('empire', { e: e.id }); onPick(e.id); }}
              onMouseEnter={() => onHover(e.id)} onFocus={() => onHover(e.id)}>
              <span className="em-top">
                <b><span aria-hidden>{e.emoji}</span> {e.name}</b>
                <em>{e.span}</em>
              </span>
              <span className="em-track" aria-hidden>
                {TICKS.map((t) => <i key={t} className="em-grid" style={{ left: `${pos(t)}%` }} />)}
                <i className="em-bar" style={{ left: `${pos(e.from)}%`, width: `${Math.max(1.2, pos(e.to) - pos(e.from))}%` }} />
              </span>
            </button>
          </motion.li>
        ))}
      </ol>
      <p className="vy-legend">Maps show today’s countries that lay mostly within each empire at its height — an approximation.</p>
    </motion.div>
  );
}

function Detail({ e, place, onPlace, onPick }: { e: Empire; place: string | null; onPlace: (p: string | null) => void; onPick: (id: string) => void }) {
  const i = EMPIRES.indexOf(e);
  const prev = EMPIRES[i - 1], next = EMPIRES[i + 1];
  const pick = (p: string) => onPlace(place === p ? null : p);
  const years = e.to - e.from;
  const countries = useMemo(() => e.countries.map((c) => BY_CCA3.get(c)).filter((c) => !!c), [e]);
  return (
    <motion.div className="vy-detail em-detail" style={{ ['--c' as string]: e.color }} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 14 }} transition={{ duration: 0.2 }}>
      <div className="er-hero">
        <span className="er-emoji" aria-hidden>{e.emoji}</span>
        <div className="vy-who">
          <span className="er-kicker">{fmtYear(e.from)} – {fmtYear(e.to)} · {years.toLocaleString('en-US')} years</span>
          <b>{e.name}</b>
          <span>{e.tagline}</span>
        </div>
      </div>
      <div className="vy-facts">
        <span><Crown size={14} /> Height: {e.peak}</span>
        <span><Maximize2 size={14} /> {e.area}</span>
        <span><Users size={14} /> {e.population}</span>
      </div>
      <p className="vy-story">{e.summary}</p>

      <div className="fr-label"><MapPin size={12} /> On the map</div>
      <button className={`er-heart ${place === 'capital' ? 'on' : ''}`} onClick={() => pick('capital')}>
        <span className="er-heart-dot" aria-hidden />
        <span><em>Capital</em><b>{e.capital.name}</b><small>{e.capital.note}</small></span>
      </button>
      <ul className="er-hubs">
        {e.places.map((p, k) => (
          <li key={p.name}>
            <button className={place === `place:${k}` ? 'on' : ''} onClick={() => pick(`place:${k}`)}>
              <i aria-hidden />
              <span><b>{p.name}</b><small>{p.note}</small></span>
            </button>
          </li>
        ))}
      </ul>
      <div className="em-today">
        <span className="em-today-label">At its height it covered all or most of {countries.length} of today’s countries:</span>
        <div className="em-flags">
          {countries.map((c) => <span key={c!.cca3} title={c!.name}><img src={flagUrl(c!.cca2, 80)} alt="" />{c!.name}</span>)}
        </div>
        {e.mapNote && <small>{e.mapNote}</small>}
      </div>

      <div className="fr-label"><Crown size={12} /> Notable rulers</div>
      <ol className="em-rulers">
        {e.rulers.map((r) => <li key={r.name}><span><b>{r.name}</b><em>{r.when}</em></span><small>{r.note}</small></li>)}
      </ol>

      <div className="fr-label"><Landmark size={12} /> Achievements & legacy</div>
      <ul className="vy-mattered">{e.achievements.map((a) => <li key={a}>{a}</li>)}</ul>

      <div className="fr-label"><Sparkles size={12} /> Key events</div>
      <ol className="er-events">
        {e.events.map((ev) => <li key={ev.text}><em>{ev.when}</em><span>{ev.text}</span></li>)}
      </ol>

      <div className="fr-label"><TrendingDown size={12} /> How it ended</div>
      <div className="er-next"><p>{e.fall}</p></div>

      <a className="vy-wiki" href={`https://en.wikipedia.org/wiki/${e.wiki}`} target="_blank" rel="noopener noreferrer">Read more on Wikipedia <ExternalLink size={13} /></a>

      <nav className="vy-nav" aria-label="More empires">
        {prev ? <button onClick={() => onPick(prev.id)}><ChevronLeft size={16} /><span><em>Earlier</em>{prev.name}</span></button> : <span />}
        {next ? <button className="nx" onClick={() => onPick(next.id)}><span><em>Later</em>{next.name}</span><ChevronRight size={16} /></button> : <span />}
      </nav>
    </motion.div>
  );
}
