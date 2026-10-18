import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, ExternalLink, Hourglass, Lightbulb, MapPin, Sparkles, Users, X } from 'lucide-react';
import { ERAS, BY_ERA, type Era } from '../lib/eras';
import { track } from '../lib/analytics';

interface Props {
  active: string | null;
  place: string | null;        // 'heart' or 'hub:<i>'
  onPick: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onPlace: (place: string | null) => void;
  onClose: () => void;
}

// World population on a log scale (4 million → 8 billion), for the bars in the list.
const LOG_MIN = Math.log10(1e6), LOG_MAX = Math.log10(1e10);
const popWidth = (n: number) => `${Math.max(6, ((Math.log10(n) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100)}%`;
const REGIONS: { key: 'asia' | 'europe' | 'africa' | 'americas' | 'oceania'; name: string; color: string }[] = [
  { key: 'asia', name: 'Asia', color: '#f59e0b' },
  { key: 'europe', name: 'Europe', color: '#60a5fa' },
  { key: 'africa', name: 'Africa', color: '#34d399' },
  { key: 'americas', name: 'Americas', color: '#f472b6' },
  { key: 'oceania', name: 'Oceania', color: '#a78bfa' },
];

/** Eras of civilization: a timeline from the Stone Age to today, and each era in depth, on the globe. */
export function ErasPanel({ active, place, onPick, onHover, onPlace, onClose }: Props) {
  const era = active ? BY_ERA.get(active) ?? null : null;
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
    <motion.aside className="voy-panel eras-panel" role="dialog" aria-label="Eras of civilization"
      initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
      <span className="voy-grab" aria-hidden />
      <header className="gc-head">
        {era ? (
          <button className="vy-back" onClick={() => onPick(null)}><ArrowLeft size={16} /> All eras</button>
        ) : (
          <>
            <span className="gc-badge er-badge"><Hourglass size={15} /></span>
            <div className="gc-title"><b>Eras of civilization</b><span>From the first stone tools to today</span></div>
          </>
        )}
        <span className="gc-spacer" />
        <button className="icon-btn" onClick={onClose} aria-label="Close eras"><X size={17} /></button>
      </header>
      <div className="voy-scroll" ref={scroller}>
        <AnimatePresence mode="wait" initial={false}>
          {era
            ? <Detail key={era.id} e={era} place={place} onPlace={onPlace} onPick={onPick} />
            : <List key="list" onPick={onPick} onHover={onHover} />}
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}

function List({ onPick, onHover }: { onPick: (id: string) => void; onHover: (id: string | null) => void }) {
  return (
    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.18 }} onMouseLeave={() => onHover(null)}>
      <p className="er-intro">Nine chapters of the human story. Each glowing marker on the globe shows where the heart of the human world lay.</p>
      <ol className="er-list">
        {ERAS.map((e, i) => (
          <motion.li key={e.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.035 * i }}>
            <button className="er-row" style={{ ['--c' as string]: e.color }} onClick={() => { onPick(e.id); }}
              onMouseEnter={() => onHover(e.id)} onFocus={() => onHover(e.id)}>
              <span className="er-dot" aria-hidden><b>{e.emoji}</b></span>
              <span className="er-text">
                <span className="er-top"><b>{e.name}</b><em>{e.span}</em></span>
                <span className="er-tag">{e.tagline}</span>
                <span className="er-pop" title={`World population: ${e.population}`}>
                  <i style={{ width: popWidth(e.pop) }} /><small><Users size={11} /> {e.population}</small>
                </span>
              </span>
              <ChevronRight size={16} className="vy-go" />
            </button>
          </motion.li>
        ))}
      </ol>
      <p className="vy-legend">Population bars use a log scale — each step is ten times more people.</p>
    </motion.div>
  );
}

function Detail({ e, place, onPlace, onPick }: { e: Era; place: string | null; onPlace: (p: string | null) => void; onPick: (id: string) => void }) {
  const i = ERAS.indexOf(e);
  const prev = ERAS[i - 1], next = ERAS[i + 1];
  const pick = (p: string) => onPlace(place === p ? null : p);
  return (
    <motion.div className="vy-detail er-detail" style={{ ['--c' as string]: e.color }} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 14 }} transition={{ duration: 0.2 }}>
      <div className="er-hero">
        <span className="er-emoji" aria-hidden>{e.emoji}</span>
        <div className="vy-who">
          <span className="er-kicker">Era {i + 1} of {ERAS.length}</span>
          <b>{e.name}</b>
          <span>{e.span}</span>
        </div>
      </div>
      <div className="vy-facts">
        <span><Hourglass size={14} /> {e.lasted}</span>
        <span><Users size={14} /> {e.population} people</span>
      </div>
      <p className="vy-story">{e.summary}</p>

      <div className="fr-label"><MapPin size={12} /> Where people lived</div>
      <button className={`er-heart ${place === 'heart' ? 'on' : ''}`} onClick={() => pick('heart')}>
        <span className="er-heart-dot" aria-hidden />
        <span><em>Heart of the human world</em><b>{e.heart.name}</b><small>{e.heart.note}</small></span>
      </button>
      {e.share && (
        <div className="er-share" aria-label={`Share of world population, ${e.share.year}`}>
          <div className="er-share-bar">
            {REGIONS.filter((r) => e.share![r.key] > 0).map((r) => <i key={r.key} style={{ width: `${e.share![r.key]}%`, background: r.color }} title={`${r.name}: ${e.share![r.key]}%`} />)}
          </div>
          <div className="er-share-key">
            {REGIONS.map((r) => <span key={r.key}><i style={{ background: r.color }} />{r.name} <b>{e.share![r.key] || '<1'}%</b></span>)}
          </div>
          <small>Share of world population, about {e.share.year} (estimates)</small>
        </div>
      )}
      <ul className="er-hubs">
        {e.hubs.map((h, k) => (
          <li key={h.name}>
            <button className={place === `hub:${k}` ? 'on' : ''} onClick={() => pick(`hub:${k}`)}>
              <i aria-hidden />
              <span><b>{h.name}</b><small>{h.note}</small></span>
            </button>
          </li>
        ))}
      </ul>

      <div className="fr-label"><Users size={12} /> How people lived</div>
      <ul className="vy-mattered">{e.life.map((l) => <li key={l}>{l}</li>)}</ul>

      <div className="fr-label"><Lightbulb size={12} /> Inventions</div>
      <div className="er-inv">
        {e.inventions.map((v) => <span key={v.name}><b aria-hidden>{v.emoji}</b><span><strong>{v.name}</strong><small>{v.when}</small></span></span>)}
      </div>

      <div className="fr-label"><Sparkles size={12} /> Key events</div>
      <ol className="er-events">
        {e.events.map((ev) => <li key={ev.text}><em>{ev.when}</em><span>{ev.text}</span></li>)}
      </ol>

      <div className="fr-label"><ArrowRight size={12} /> {next ? `What came next: ${next.name}` : 'What comes next'}</div>
      <div className="er-next">
        <p>{e.next}</p>
        {next && <button onClick={() => onPick(next.id)} style={{ ['--n' as string]: next.color }}><span aria-hidden>{next.emoji}</span> Continue to the {next.name} <ArrowRight size={15} /></button>}
      </div>

      <a className="vy-wiki" onClick={() => track('wiki', { k: 'era', id: e.id })} href={`https://en.wikipedia.org/wiki/${e.wiki}`} target="_blank" rel="noopener noreferrer">Read more on Wikipedia <ExternalLink size={13} /></a>

      <nav className="vy-nav" aria-label="More eras">
        {prev ? <button onClick={() => onPick(prev.id)}><ChevronLeft size={16} /><span><em>Earlier</em>{prev.name}</span></button> : <span />}
        {next ? <button className="nx" onClick={() => onPick(next.id)}><span><em>Later</em>{next.name}</span><ChevronRight size={16} /></button> : <span />}
      </nav>
    </motion.div>
  );
}
