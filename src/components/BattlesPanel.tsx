import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MutableRefObject, type RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Crown, ExternalLink, FastForward, MapPin, Pause, Play, RotateCcw, Skull, SkipBack, SkipForward, Sparkles, ChevronUp, Swords, Trophy, Volume2, VolumeX, X } from 'lucide-react';
import { BY_CCA3, flagUrl } from '../lib/data';
import { BATTLES, BATTLE_ERAS, BY_BATTLE, SIDE_COLOR, battleAltitude, battleEraOf, battlesIn, fmtMen, type Battle, type Side } from '../lib/battles';
import { WORLD_WARS, eventAtMonth, warMapAt, type WarStatus, type WorldWar } from '../lib/worldWars';
import { track } from '../lib/analytics';
import { breathMs, narrationOn, narrator } from '../lib/narrator';
import { Subtitles } from './theatre/Subtitles';
import { ShareStory } from './theatre/ShareStory';
import { useTheatre, type Inset } from './theatre/useTheatre';
import type { GlobePath } from './GlobeView';
import { WW2_SHAPES } from '../data/historical/ww2';
import type { HistShape } from '../data/historical/types';

type ClashPin = { lat: number; lng: number; kind: 'clash'; id: string; name: string; tone: string; active: boolean };
export interface SceneShape { id: string; ring: [number, number][]; color: string; name: string; spine?: [number, number][] }
/**
 * What the panel wants drawn. `focus`: a battle or war is open — the tilted cinema map plays it
 * (the globe shows the list). `flags`: countries to plant a flag on; `shapes`: areas of the past.
 */
export interface WarScene { paint: Record<string, string> | null; paths: GlobePath[]; pins: ClashPin[]; focus?: boolean; flags?: string[]; shapes?: SceneShape[] }
const HIST_SHAPES: HistShape[] = [...WW2_SHAPES];
type View = { kind: 'list' } | { kind: 'battle'; id: string } | { kind: 'war'; id: 'ww1' | 'ww2' };

interface Props {
  link?: string | null;     // opened from a shared link: a battle, or ww1 / ww2
  onScene: (s: WarScene) => void;
  onFrame: (lat: number, lng: number, altitude: number) => void;
  pinRef: MutableRefObject<(id: string) => void>;
  onClose: () => void;
  /** How much of the screen the panel covers (the cinema map frames the rest). */
  onInset?: (i: Inset) => void;
}

const GOLD = '#fbbf24';
const calmMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isWar = (id: string): id is 'ww1' | 'ww2' => id === 'ww1' || id === 'ww2';
const viewOf = (link?: string | null): View => (link && isWar(link) ? { kind: 'war', id: link } : link && BY_BATTLE.has(link) ? { kind: 'battle', id: link } : { kind: 'list' });
const eraFor = (v: View) => (v.kind === 'battle' ? battleEraOf(BY_BATTLE.get(v.id)!.year) : v.kind === 'war' ? 3 : 0);

/** Battles and wars: both world wars as animated timelines, and every other turning point since 1500. */
export function BattlesPanel({ link, onScene, onFrame, pinRef, onClose, onInset }: Props) {
  const [view, setView] = useState<View>(() => viewOf(link));
  const [era, setEra] = useState(() => eraFor(viewOf(link)));
  const [hover, setHover] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const viewKey = view.kind === 'list' ? 'list' : view.id;
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [viewKey, era]);

  const open = useCallback((id: string) => {
    if (isWar(id)) { track('war_play', { w: id }); setView({ kind: 'war', id }); return; }
    const b = BY_BATTLE.get(id);
    if (!b) return;
    track('battle', { b: id });
    setEra(battleEraOf(b.year));
    setHover(id);
    setView({ kind: 'battle', id });
  }, []);
  const toList = useCallback(() => setView({ kind: 'list' }), []);
  pinRef.current = open;
  // A war or a battle plays on the map: on a phone the panel shrinks to a now-playing card.
  const { ref: sheetRef, peek, setPeek, swipe } = useTheatre(view.kind !== 'list', onInset);
  const phone = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches, []);

  // The camera only moves on a choice: opening something or picking a chapter, never on a hover.
  useEffect(() => {
    if (view.kind === 'list') { const [lat, lng] = BATTLE_ERAS[era].view; onFrame(lat, lng, 2.4); }
    else if (view.kind === 'battle') { const b = BY_BATTLE.get(view.id)!; onFrame(b.at[0], b.at[1], battleAltitude(b)); }
  }, [viewKey, view.kind === 'list' ? era : -1]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (view.kind !== 'list') return;
    onScene({ paint: null, paths: [], pins: battlesIn(era).map((b) => ({ lat: b.at[0], lng: b.at[1], kind: 'clash', id: `bw:${b.id}`, name: b.name, tone: GOLD, active: hover === b.id })) });
  }, [view.kind, era, hover, onScene]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target as HTMLElement)?.closest?.('input, textarea')) return;
      e.stopPropagation();
      if (view.kind === 'list') onClose(); else toList();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [view.kind, onClose, toList]);

  return (
    <motion.aside ref={sheetRef} className={`voy-panel bw-panel ${view.kind !== 'list' ? 'theatre' : ''} ${peek ? 'peek' : ''}`} role="dialog" aria-label="Battles and Wars"
      initial={phone ? { opacity: 0, y: 40 } : { opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0, y: 0 }} exit={phone ? { opacity: 0, y: 40 } : { opacity: 0, x: -24 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      {...swipe}>
      {view.kind !== 'list' ? (
        <button className="voy-grab theatre-grab" onClick={() => setPeek((p) => !p)} aria-label={peek ? 'Show the details' : 'Back to the map'} aria-expanded={!peek}><i /></button>
      ) : <span className="voy-grab" aria-hidden />}
      <header className="gc-head">
        {view.kind !== 'list' ? (
          <button className="vy-back" onClick={toList}><ArrowLeft size={16} /> All battles</button>
        ) : (
          <>
            <span className="gc-badge bw-badge"><Swords size={15} /></span>
            <div className="gc-title"><b>Battles and Wars</b><span>{BATTLES.length + 2} conflicts that changed the map, since 1500</span></div>
          </>
        )}
        <span className="gc-spacer" />
        {view.kind !== 'list' && <ShareStory kind="battles" id={view.id} />}
        <button className="icon-btn" onClick={onClose} aria-label="Close battles and wars"><X size={17} /></button>
      </header>
      <div className="voy-scroll" ref={scroller}>
        <AnimatePresence mode="wait" initial={false}>
          {view.kind === 'list' && <List key="list" era={era} onEra={(e) => { track('battle_era', { e }); setEra(e); setHover(null); }} hover={hover} onHover={setHover} scroller={scroller} onOpen={open} />}
          {view.kind === 'battle' && <Detail key={view.id} b={BY_BATTLE.get(view.id)!} onScene={onScene} onOpen={open} onMore={() => setPeek(false)} />}
          {view.kind === 'war' && <WarPlayer key={view.id} war={WORLD_WARS[view.id]} onScene={onScene} onFrame={onFrame} />}
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}

// ── The list ─────────────────────────────────────────────

function List({ era, onEra, hover, onHover, scroller, onOpen }: { era: number; onEra: (e: number) => void; hover: string | null; onHover: (id: string) => void; scroller: RefObject<HTMLDivElement | null>; onOpen: (id: string) => void }) {
  const rows = battlesIn(era);
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
  return (
    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.18 }}>
      <div className="bw-features">
        {Object.values(WORLD_WARS).map((w) => (
          <button key={w.id} className={`bw-feature ${w.id}`} onClick={() => onOpen(w.id)}>
            <span className="bw-feature-play"><Play size={14} fill="currentColor" /></span>
            <b>{w.name}</b>
            <em>{w.years}</em>
            <small>Watch it unfold</small>
            <span className="bw-feature-bar" aria-hidden><i /></span>
          </button>
        ))}
      </div>
      <div className="vy-eras bw-eras" role="tablist" aria-label="Eras">
        {BATTLE_ERAS.map((e, i) => (
          <button key={e.short} role="tab" aria-selected={i === era} className={i === era ? 'on' : ''} onClick={() => onEra(i)}>
            <b>{e.short}</b><span>{e.range}</span>
          </button>
        ))}
      </div>
      <p className="vy-era">{BATTLE_ERAS[era].sub}</p>
      <ol className="vy-list" key={era}>
        {rows.map((b, i) => (
          <motion.li key={b.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(0.3, 0.02 * i) }}>
            <button className={`vy-row bw-row ${hover === b.id ? 'hl' : ''}`} style={{ ['--c' as string]: b.kind === 'war' ? '#f87171' : GOLD }} onClick={() => onOpen(b.id)}
              onMouseEnter={() => onHover(b.id)} onFocus={() => onHover(b.id)}>
              <span className="vy-year">{Math.floor(b.year)}</span>
              <span className="vy-line" aria-hidden />
              <span className="vy-text">
                <b>{b.name}</b>
                <span>{b.line}</span>
              </span>
              {b.empire ? <Crown size={15} className="bw-crown" aria-label="Changed the course of an empire" /> : <span />}
              <ChevronRight size={16} className="vy-go" />
            </button>
          </motion.li>
        ))}
      </ol>
      {rows.some((b) => b.empire) && <p className="vy-legend"><Crown size={12} className="bw-crown" /> changed the course of an empire</p>}
    </motion.div>
  );
}

// ── One battle ───────────────────────────────────────────

const Bar = ({ side, of, tone }: { side: Side; of: number; tone: string }) => (
  <span className="bw-bar" aria-hidden><motion.i style={{ background: tone }} initial={{ width: 0 }} animate={{ width: `${Math.max(3, ((side.men ?? 0) / of) * 100)}%` }} transition={{ duration: 0.9, delay: 0.35, ease: [0.22, 1, 0.36, 1] }} /></span>
);

function Fighter({ side, tone, won, of }: { side: Side; tone: string; won: boolean; of: number }) {
  return (
    <div className={`bw-side ${won ? 'won' : ''}`} style={{ ['--s' as string]: tone }}>
      <b>{side.name}{won && <motion.span className="bw-won" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 16, delay: 0.9 }}><Trophy size={13} aria-label="Won" /></motion.span>}</b>
      {side.who && <small>{side.who}</small>}
      {of > 0 && side.men && <><Bar side={side} of={of} tone={tone} /><em>{fmtMen(side.men)} men</em></>}
      {side.lost && <em className="bw-lost">Lost {side.lost}</em>}
    </div>
  );
}

function Detail({ b, onScene, onOpen, onMore }: { b: Battle; onScene: (s: WarScene) => void; onOpen: (id: string) => void; onMore: () => void }) {
  const i = BATTLES.indexOf(b);
  const prev = BATTLES[i - 1], next = BATTLES[i + 1];
  const [run, setRun] = useState(0);
  const of = b.a.men && b.b.men ? Math.max(b.a.men, b.b.men) : 0;
  const tone = b.empire ? GOLD : '#f87171';

  // The camera arrives, then the sides colour in and the armies march.
  useEffect(() => {
    const pins: ClashPin[] = [{ lat: b.at[0], lng: b.at[1], kind: 'clash', id: `bw:${b.id}`, name: b.name, tone, active: true }];
    onScene({ paint: null, paths: [], pins, focus: true });
    const t = window.setTimeout(() => {
      const paint: Record<string, string> = {};
      for (const id of b.lands?.a ?? []) paint[id] = SIDE_COLOR.a;
      for (const id of b.lands?.b ?? []) paint[id] = SIDE_COLOR.b;
      const paths: GlobePath[] = (b.moves ?? []).map((m, k) => ({ id: `${b.id}:${run}:${k}`, points: [m.f, m.t], color: SIDE_COLOR[m.s], mode: 'arrow', arrow: true, delay: 300 + k * 350 }));
      onScene({ paint, paths, pins, focus: true });
    }, run ? 250 : 750);
    return () => window.clearTimeout(t);
  }, [b, run, onScene, tone]);

  const outcome = b.won === 'draw' ? 'Inconclusive' : b.won === 'open' ? (b.asOf ? 'Not settled' : 'No clear winner') : null;
  return (
    <motion.div className="vy-detail bw-detail" style={{ ['--c' as string]: tone }} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 14 }} transition={{ duration: 0.2 }}>
      <span className="er-kicker">{b.kind === 'war' ? 'War' : 'Battle'} · {b.when}</span>
      <h2 className="vy-title bw-title">{b.name}</h2>
      <p className="bw-line">{b.line}</p>
      <button className="peek-more" onClick={onMore}><ChevronUp size={15} /> The story</button>

      <div className="bw-versus">
        <Fighter side={b.a} tone={SIDE_COLOR.a} won={b.won === 'a'} of={of} />
        <span className="bw-vs" aria-hidden><Swords size={15} /></span>
        <Fighter side={b.b} tone={SIDE_COLOR.b} won={b.won === 'b'} of={of} />
      </div>
      {outcome && <p className="bw-outcome">{outcome}</p>}

      <div className="vy-facts">
        <span><MapPin size={14} /> {b.place}</span>
        <span><CalendarDays size={14} /> {b.when}</span>
        {b.toll && <span><Skull size={14} /> {b.toll}</span>}
      </div>

      {b.empire && (
        <motion.div className="bw-empire" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Crown size={16} /><span><em>Changed an empire</em>{b.empire}</span>
        </motion.div>
      )}

      <p className="vy-story">{b.story}</p>

      {(b.moves?.length ?? 0) > 0 && <button className="vy-tour bw-replay" onClick={() => { track('battle_replay', { b: b.id }); setRun((r) => r + 1); }}><RotateCcw size={15} /> Replay the movements</button>}

      <div className="fr-label"><Sparkles size={12} /> Why it mattered</div>
      <ul className="vy-mattered">{b.why.map((m) => <li key={m}>{m}</li>)}</ul>

      {b.asOf && <p className="bw-note">{b.asOf}. This account may have been overtaken by events, and figures are disputed.</p>}
      <p className="bw-note">Figures are rounded estimates. Colours show today’s countries, so they’re only a rough guide to the lands involved at the time.</p>
      <a className="vy-wiki" onClick={() => track('wiki', { k: 'battle', id: b.id })} href={`https://en.wikipedia.org/wiki/${b.wiki}`} target="_blank" rel="noopener noreferrer">Read more on Wikipedia <ExternalLink size={13} /></a>

      <nav className="vy-nav" aria-label="More battles">
        {prev ? <button onClick={() => onOpen(prev.id)}><ChevronLeft size={16} /><span><em>Earlier</em>{prev.name}</span></button> : <span />}
        {next ? <button className="nx" onClick={() => onOpen(next.id)}><span><em>Later</em>{next.name}</span><ChevronRight size={16} /></button> : <span />}
      </nav>
    </motion.div>
  );
}

// ── A world war, on its timeline ─────────────────────────

const STEP_MS = 5600; // long enough to read the caption and watch the map change
const STATUSES = ['allies', 'enemy', 'held', 'out'] as const;
const nameOf = (id: string) => BY_CCA3.get(id)?.name ?? id;
const FlagOf = ({ id }: { id: string }) => {
  const c = BY_CCA3.get(id);
  return c ? <img src={flagUrl(c.cca2, 80)} alt="" loading="lazy" /> : null;
};

/** Narration: is it there (recorded and reachable), and does this device want it? */
function useNarration() {
  const snap = useSyncExternalStore(narrator.subscribe, () => `${narrator.available() ? 1 : 0}${narrationOn() ? 1 : 0}`);
  useEffect(() => { void narrator.load(); }, []);
  return { available: snap[0] === '1', on: snap[1] === '1' };
}

function WarPlayer({ war, onScene, onFrame }: { war: WorldWar; onScene: (s: WarScene) => void; onFrame: (lat: number, lng: number, alt: number) => void }) {
  const last = war.events.length - 1;
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(() => !calmMotion());
  const [fast, setFast] = useState(false);
  const [dragM, setDragM] = useState<number | null>(null);
  const [roster, setRoster] = useState<Exclude<WarStatus, null> | null>(null);
  const ev = war.events[i];
  const map = useMemo(() => warMapAt(war, i), [war, i]);
  const changed = useMemo(() => {
    const before = i > 0 ? warMapAt(war, i - 1) : new Map<string, string>();
    return (ev.major ?? []).filter((id) => map.get(id) !== before.get(id) && map.has(id));
  }, [war, i, ev, map]);
  const groups = useMemo(() => {
    const g: Record<Exclude<WarStatus, null>, string[]> = { allies: [], enemy: [], held: [], out: [] };
    for (const [id, s] of map) g[s].push(id);
    return g;
  }, [map]);

  // Draw this moment on the globe: the map as it stands, this event's marches, a marker where it happened.
  useEffect(() => {
    const paint: Record<string, string> = {};
    for (const [id, s] of map) paint[id] = war.colors[s];
    const paths: GlobePath[] = [
      ...(ev.fronts ?? []).map((points, k) => ({ id: `${war.id}:front:${k}`, points, color: '#fde68a', mode: 'front' as const })),
      ...(ev.moves ?? []).map((m, k) => ({ id: `${war.id}:${i}:${k}`, points: [m.f, m.t] as [number, number][], color: m.s === 'allies' ? war.colors.allies : war.colors.enemy, mode: 'arrow' as const, arrow: true, delay: 500 + k * 300 })),
    ];
    const shapes = HIST_SHAPES.filter((h) => h.war === war.id && h.from <= ev.m && ev.m < h.until)
      .map((h) => ({ id: h.id, ring: h.ring, color: war.colors[h.side], name: h.name, spine: h.spine }));
    onScene({ paint, paths, pins: [{ lat: ev.at[0], lng: ev.at[1], kind: 'clash', id: `war:${i}`, name: ev.title, tone: GOLD, active: true }], focus: true, flags: changed, shapes });
  }, [war, i, ev, map, changed, onScene]);

  // Follow the war with the camera, except mid-drag: it settles on the event when the finger lifts.
  const dragging = dragM !== null;
  useEffect(() => { if (!dragging) onFrame(ev.at[0], ev.at[1], ev.alt); }, [i, dragging]); // eslint-disable-line react-hooks/exhaustive-deps

  // Moving on: with narration, each event waits for George to finish (plus a breath to look at the
  // map); without it, or if a clip can't play, on a fixed timer.
  const voice = useNarration();
  const voiced = voice.available && voice.on;
  useEffect(() => {
    if (!playing || dragging) return;
    if (!voiced && i >= last) { setPlaying(false); return; }
    let live = true, t = 0;
    const next = () => {
      if (i < last) { setI((n) => Math.min(last, n + 1)); return; }
      narrator.stop();
      setPlaying(false);
    };
    const timer = () => { t = window.setTimeout(next, fast ? STEP_MS / 2 : STEP_MS); };
    if (!voiced) timer();
    else {
      void narrator.say(`${war.id}:${i}`, { rate: fast ? 1.15 : 1, title: ev.title, album: war.name, prefetch: i < last ? `${war.id}:${i + 1}` : undefined })
        .then((r) => {
          if (!live) return;
          if (r === 'ended') t = window.setTimeout(next, breathMs(fast));
          else if (r === 'failed') timer();
        });
    }
    return () => { live = false; window.clearTimeout(t); if (voiced) narrator.pause(); };
  }, [playing, dragging, i, last, fast, voiced, war, ev]);
  useEffect(() => { if (!voiced) narrator.stop(); }, [voiced]);
  // Lock-screen play/pause while this war is open; silence when it closes.
  useEffect(() => {
    narrator.controls({ play: () => setPlaying(true), pause: () => setPlaying(false) });
    return () => { narrator.controls(null); narrator.stop(); };
  }, []);

  const go = (n: number) => { track('war_step', { w: war.id, n }); setI(Math.max(0, Math.min(last, n))); };
  const toggle = () => { if (i >= last && !playing) { setI(0); setPlaying(true); } else setPlaying((p) => !p); };
  const m = dragM ?? ev.m;
  const pos = (x: number) => `${(x / war.months) * 100}%`;
  const ended = i >= last && !playing;

  return (
    <motion.div className="bw-player" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 14 }} transition={{ duration: 0.2 }}>
      <div className="bw-stage">
        <div className="bw-war-name"><b>{war.name}</b><span>{war.years}</span></div>
        <div className="bw-now" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
              <em className="bw-date">{ev.date}</em>
              <h2>{ev.title}</h2>
              <Subtitles id={`${war.id}:${i}`} fallback={ev.text} />
              {changed.length > 0 && (
                <div className="bw-chips">
                  {changed.map((id, k) => (
                    <motion.span key={id} style={{ ['--s' as string]: war.colors[map.get(id)!] }} initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 360, damping: 22, delay: 0.25 + k * 0.08 }}>
                      <FlagOf id={id} />{nameOf(id)}
                    </motion.span>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className={`bw-scrub ${dragging ? 'drag' : ''}`}>
          <div className="bw-track" aria-hidden>
            <i className="bw-fill" style={{ width: pos(m) }} />
            {war.events.map((e, k) => <i key={e.title} className={`bw-tick ${k <= i ? 'past' : ''}`} style={{ left: pos(e.m) }} />)}
            <i className="bw-thumb" style={{ left: pos(m) }} />
          </div>
          <input type="range" aria-label={`${war.name} timeline`} aria-valuetext={`${ev.date}: ${ev.title}`} min={0} max={war.months} step={0.5} value={m}
            onChange={(e) => { const v = Number(e.target.value); setDragM(v); setI(eventAtMonth(war, v)); }}
            onPointerUp={() => setDragM(null)} onPointerCancel={() => setDragM(null)} onKeyUp={() => setDragM(null)} onBlur={() => setDragM(null)} />
          <div className="bw-years" aria-hidden>{war.ticks.map((t) => <span key={t.label} style={{ left: pos(t.m) }}>{t.label}</span>)}</div>
        </div>

        <div className="bw-controls">
          <button className="icon-btn" onClick={() => { if (!voiced) setPlaying(false); go(i - 1); }} disabled={i === 0} aria-label="Previous event"><SkipBack size={17} /></button>
          <button className="bw-play" onClick={toggle} aria-label={playing ? 'Pause' : ended ? 'Watch again' : 'Play'}>
            {playing ? <Pause size={18} fill="currentColor" /> : ended ? <RotateCcw size={18} /> : <Play size={18} fill="currentColor" />}
          </button>
          <button className="icon-btn" onClick={() => { if (!voiced) setPlaying(false); go(i + 1); }} disabled={i === last} aria-label="Next event"><SkipForward size={17} /></button>
          <button className={`bw-speed ${fast ? 'on' : ''}`} onClick={() => setFast((f) => !f)} aria-pressed={fast}><FastForward size={13} /> {fast ? '2×' : '1×'}</button>
          {voice.available && (
            <button className={`bw-speed bw-voice ${voice.on ? 'on' : ''}`} onClick={() => { track('narration', { on: voice.on ? 0 : 1 }); narrator.setOn(!voice.on); }} aria-pressed={voice.on} aria-label="Narration">
              {voice.on ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
          )}
          <span className="bw-count">{i + 1} / {war.events.length}</span>
        </div>

        <div className="bw-legend" role="group" aria-label="The sides">
          {STATUSES.filter((s) => groups[s].length > 0 || s === 'allies' || s === 'enemy').map((s) => (
            <button key={s} className={roster === s ? 'on' : ''} style={{ ['--s' as string]: war.colors[s] }} aria-expanded={roster === s} onClick={() => setRoster((r) => (r === s ? null : s))}>
              <i /><span>{war.labels[s]}</span>
              <motion.b key={groups[s].length} initial={{ scale: 1.5 }} animate={{ scale: 1 }}>{groups[s].length}</motion.b>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {roster && (
          <motion.div className="bw-roster" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}>
            <p>{war.labels[roster]}, by today’s countries</p>
            <div className="em-flags">{groups[roster].map((id) => <span key={id}><FlagOf id={id} />{nameOf(id)}</span>)}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {ended && (
          <motion.div className="bw-end" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, delay: 0.3 }}>
            <em><Skull size={14} /> The cost</em>
            <b>{war.toll}</b>
            <small>{war.tollNote}</small>
            <p>{war.ended}</p>
            <a className="vy-wiki" onClick={() => track('wiki', { k: 'war', id: war.id })} href={`https://en.wikipedia.org/wiki/${war.wiki}`} target="_blank" rel="noopener noreferrer">Read more on Wikipedia <ExternalLink size={13} /></a>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fr-label">The whole war</div>
      <ol className="bw-events">
        {war.events.map((e, k) => (
          <li key={e.title} className={k === i ? 'on' : k < i ? 'past' : ''}>
            <button onClick={(e) => { setPlaying(false); go(k); e.currentTarget.closest('.voy-scroll')?.scrollTo({ top: 0, behavior: calmMotion() ? 'auto' : 'smooth' }); }} aria-current={k === i ? 'step' : undefined}>
              <i aria-hidden /><span><em>{e.date}</em><b>{e.title}</b></span>
            </button>
          </li>
        ))}
      </ol>
      <p className="bw-note">{war.mapNote}</p>
    </motion.div>
  );
}
