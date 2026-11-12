import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Anchor, ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, ChevronUp, ExternalLink, Pause, Route, Sailboat, Ship, Sparkles, Users, Volume2, VolumeX, Waves, X } from 'lucide-react';
import { flagUrl } from '../lib/data';
import { VOYAGES, BY_VOYAGE, VOYAGE_ERAS, voyageKm, voyagesIn, type Voyage } from '../lib/voyages';
import { track } from '../lib/analytics';
import { wikiPhoto } from '../lib/wiki';
import { useTheatre, type Inset } from './theatre/useTheatre';
import { Subtitles } from './theatre/Subtitles';
import { ShareStory } from './theatre/ShareStory';
import { StartStory } from './theatre/StartStory';
import { narrationOn, narrator } from '../lib/narrator';

/** Narration for this voyage: is it there, is it on, and which of its clips is on screen. */
function useVoice(voyage: string) {
  const snap = useSyncExternalStore(narrator.subscribe, () => `${narrator.available() ? 1 : 0}${narrationOn() ? 1 : 0}`);
  const shown = useSyncExternalStore(narrator.onTime, narrator.shownId);
  useEffect(() => { void narrator.load(); }, []);
  return { available: snap[0] === '1', on: snap[1] === '1', shown: shown?.startsWith(`voyage:${voyage}:`) ? shown : null };
}

interface Props {
  active: string | null;
  hover?: string | null;   // the route in the spotlight
  era: number;
  onEra: (era: number) => void;
  stop: number | null;
  sailing: boolean;
  onPick: (id: string | null) => void;
  onHover: (id: string) => void;
  onStop: (i: number | null) => void;
  onSail: (on: boolean) => void;
  onClose: () => void;
  /** How much of the screen the panel covers (the cinema map frames the rest). */
  onInset?: (i: Inset) => void;
  /** Opened from a shared link and not yet started: show the big play button. */
  linked?: boolean;
  onPlay?: () => void;
}

const fmtKm = (n: number) => `≈ ${(Math.round(n / 500) * 500).toLocaleString('en-US')} km`;
function Portrait({ v }: { v: Voyage }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { let live = true; setSrc(null); void wikiPhoto(v.wiki).then((s) => { if (live) setSrc(s); }); return () => { live = false; }; }, [v.wiki]);
  return (
    <span className="vy-portrait" style={{ ['--c' as string]: v.color }}>
      {src ? <img src={src} alt={v.voyager} /> : <Ship size={26} />}
    </span>
  );
}
const Flag = ({ v, w = 80, className }: { v: Voyage; w?: 80 | 160; className?: string }) =>
  v.flag ? <img className={className} src={flagUrl(v.flag, w)} alt={v.sailedFor} title={`Sailed for ${v.sailedFor}`} /> : <Waves className={className} size={16} aria-label={v.sailedFor} />;

/** Famous voyages: a timeline of them, and each one's story — routes and stops on the globe. */
export function VoyagesPanel({ active, hover = null, era, onEra, stop, sailing, onPick, onHover, onStop, onSail, onClose, onInset, linked = false, onPlay }: Props) {
  const v = active ? BY_VOYAGE.get(active) ?? null : null;
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [active, era]);
  // An open voyage plays on the map: on a phone the panel shrinks to a now-playing card.
  const { ref: sheetRef, peek, setPeek, swipe } = useTheatre(!!v, onInset);
  const phone = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches, []);
  useEffect(() => { if (sailing) setPeek(true); }, [sailing, setPeek]);
  // The phone held George back (no tap yet): the same play button; the tap starts him.
  const held = useSyncExternalStore(narrator.onTime, narrator.blocked);

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
    <motion.aside ref={sheetRef} className={`voy-panel ${v ? 'theatre' : ''} ${peek ? 'peek' : ''}`} role="dialog" aria-label="Famous voyages"
      initial={phone ? { opacity: 0, y: 40 } : { opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0, y: 0 }} exit={phone ? { opacity: 0, y: 40 } : { opacity: 0, x: -24 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      {...swipe}>
      {v ? (
        <button className="voy-grab theatre-grab" onClick={() => setPeek((p) => !p)} aria-label={peek ? 'Show the details' : 'Back to the map'} aria-expanded={!peek}><i /></button>
      ) : <span className="voy-grab" aria-hidden />}
      {v && (linked || (held && sailing)) && <StartStory onStart={() => { if (linked) onPlay?.(); }} />}
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
        {v && <ShareStory kind="voyages" id={v.id} />}
        <button className="icon-btn" onClick={onClose} aria-label="Close voyages"><X size={17} /></button>
      </header>
      <div className="voy-scroll" ref={scroller}>
        <AnimatePresence mode="wait" initial={false}>
          {v
            ? <Detail key={v.id} v={v} stop={stop} sailing={sailing} onStop={onStop} onSail={onSail} onPick={onPick} onMore={() => setPeek(false)} />
            : <List key="list" hover={hover} era={era} onEra={onEra} scroller={scroller} onPick={onPick} onHover={onHover} />}
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}

/** One era at a time, one route in the spotlight: pointing at a row spotlights it, or on a phone, scrolling the list. */
function List({ hover, era, onEra, scroller, onPick, onHover }: { hover: string | null; era: number; onEra: (era: number) => void; scroller: React.RefObject<HTMLDivElement | null>; onPick: (id: string) => void; onHover: (id: string) => void }) {
  const rows = voyagesIn(era);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    const el = scroller.current;
    if (!el || !window.matchMedia('(hover: none)').matches) return;
    const onScroll = () => {
      const room = el.scrollHeight - el.clientHeight;
      if (room > 0) onHover(rows[Math.round((el.scrollTop / room) * (rows.length - 1))].id);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scroller, rows, onHover]);
  // A route pointed at on the globe: bring its row into view.
  useEffect(() => { if (hover && window.matchMedia('(hover: hover)').matches) rowRefs.current.get(hover)?.scrollIntoView({ block: 'nearest' }); }, [hover]);
  return (
    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.18 }}>
      <div className="vy-eras" role="tablist" aria-label="Eras">
        {VOYAGE_ERAS.map((e, i) => (
          <button key={e.short} role="tab" aria-selected={i === era} className={i === era ? 'on' : ''} onClick={() => onEra(i)}>
            <b>{e.short}</b><span>{e.range}</span>
          </button>
        ))}
      </div>
      <p className="vy-era">{VOYAGE_ERAS[era].sub}</p>
      <ol className="vy-list" key={era}>
        {rows.map((v, i) => {
          const died = v.deaths?.map((d) => d.who).join(', ');
          return (
            <motion.li key={v.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(0.3, 0.025 * i) }}>
              <button ref={(el) => { if (el) rowRefs.current.set(v.id, el); else rowRefs.current.delete(v.id); }} className={`vy-row ${hover === v.id ? 'hl' : ''}`} style={{ ['--c' as string]: v.color }} onClick={() => { onPick(v.id); }}
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
          );
        })}
      </ol>
      {rows.some((v) => v.deaths?.length) && <p className="vy-legend"><em>†</em> a life lost on the voyage</p>}
    </motion.div>
  );
}

function Detail({ v, stop, sailing, onStop, onSail, onPick, onMore }: { v: Voyage; stop: number | null; sailing: boolean; onStop: (i: number | null) => void; onSail: (on: boolean) => void; onPick: (id: string) => void; onMore: () => void }) {
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
  const voice = useVoice(v.id);
  const intro = voice.shown === `voyage:${v.id}:intro`;
  const here = stop !== null && !intro ? v.stops[stop] : null;
  const tour = (
    <button className={`vy-tour ${sailing ? 'on' : ''}`} onClick={sail}>
      {sailing ? <><Pause size={15} /> Pause the voyage</> : <><Sailboat size={16} /> {stop !== null && !atEnd ? 'Sail on' : 'Follow the voyage'}</>}
      <em>{stop !== null ? `${stop + 1} / ${v.stops.length}` : `${v.stops.length} stops`}</em>
    </button>
  );

  return (
    <motion.div className="vy-detail" style={{ ['--c' as string]: v.color }} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 14 }} transition={{ duration: 0.2 }}>
      {/* The now-playing card (phones, while the voyage has the map): who, where the ship is, and sail. */}
      <div className="vy-now">
        <span className="er-kicker">{v.voyager} · {v.years}</span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={stop ?? -1} className="vy-now-body" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.25 }}>
            {here ? (
              <><b><i>{deathAt.has(stop!) ? '†' : stop! + 1}</i>{here.name}<em>{here.when}</em></b>
                <Subtitles id={voice.shown ?? `voyage:${v.id}:${stop}`} fallback={deathAt.get(stop!)?.text ?? here.note} /></>
            ) : (
              <><b className="vy-now-title">{v.title}</b>{intro ? <Subtitles id={voice.shown!} fallback={v.tagline} /> : <p>{v.tagline}</p>}</>
            )}
          </motion.div>
        </AnimatePresence>
        <div className="vy-now-row">{tour}
          {voice.available && (
            <button className={`bw-speed bw-voice ${voice.on ? 'on' : ''}`} onClick={() => { track('narration', { on: voice.on ? 0 : 1 }); narrator.setOn(!voice.on); }} aria-pressed={voice.on} aria-label="Narration">
              {voice.on ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
          )}
          <button className="peek-more" onClick={onMore}><ChevronUp size={15} /> Story</button></div>
      </div>

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

      {tour}

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
      <a className="vy-wiki" onClick={() => track('wiki', { k: 'voyage', id: v.id })} href={`https://en.wikipedia.org/wiki/${v.wiki}`} target="_blank" rel="noopener noreferrer">Read more on Wikipedia <ExternalLink size={13} /></a>

      <nav className="vy-nav" aria-label="More voyages">
        {prev ? <button onClick={() => onPick(prev.id)}><ChevronLeft size={16} /><span><em>Earlier</em>{prev.voyager}</span></button> : <span />}
        {next ? <button className="nx" onClick={() => onPick(next.id)}><span><em>Later</em>{next.voyager}</span><ChevronRight size={16} /></button> : <span />}
      </nav>
    </motion.div>
  );
}
