import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, HatGlasses, Clock, Copy, Globe2, Lightbulb, NotebookPen, Plane, RotateCcw, Search, Share2, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { BY_CCA3, flagUrl } from '../lib/data';
import { addDays, localDate, dailyNumber } from '../lib/daily';
import {
  CLOCK, COST, LEGS, addCase, caseShare, dailyCase, emptyMysteryStats, flightHours, makeCase, nextRank, rankFor, takeaway, traitLabel,
  type Case, type CaseResult, type MysteryStats,
} from '../lib/mystery';
import { SUSPECTS, TRAITS, type Suspect, type TraitKind } from '../data/mysteryCast';
import { wikiPhoto } from '../lib/wiki';
import { track } from '../lib/analytics';

interface Props {
  onFly: (from: string, to: string) => void;              // arc + camera to the next stop
  onFocus: (cca3: string | null) => void;                 // light up where you are
  setGlobePick: (fn: ((cca3: string) => void) | null) => void; // globe taps come here (hard legs)
  onRoute: (route: string[] | null) => void;              // the whole trail, at the end
  onExit: () => void;
}
type Mode = 'daily' | 'practice';
type Phase = 'brief' | 'stop' | 'travel' | 'flying' | 'lineup' | 'over';
interface State {
  phase: Phase;
  at: number;                    // index into the route: where you are
  used: number;                  // hours spent
  heard: number[][];             // per leg: witness indexes interviewed
  wrong: string[][];             // per leg: wrong destinations tried
  bought: boolean[];             // per leg: options bought (globe legs)
  accused: string[];             // wrong suspects named
  result: CaseResult | null;
}
const fresh = (): State => ({ phase: 'brief', at: 0, used: 0, heard: Array.from({ length: LEGS }, () => []), wrong: Array.from({ length: LEGS }, () => []), bought: Array(LEGS).fill(false), accused: [], result: null });
const KEY = (date: string) => `gq-mystery-${date}`;
const STATS = 'gq-mystery-stats';
const load = (k: string) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { return null; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

/** Local time in a country (from its first time zone, "UTC+07:00"). */
function localTime(cca3: string) {
  const tz = BY_CCA3.get(cca3)?.timezones[0] ?? 'UTC';
  const m = /UTC([+-])(\d{2}):(\d{2})/.exec(tz);
  const off = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  const d = new Date(Date.now() + off * 60_000);
  return d.toISOString().slice(11, 16);
}

/** Text that types itself out (tap to finish). */
function useTypewriter(text: string, speed = 18) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(text.length); return; }
    const t = window.setInterval(() => setN((x) => (x >= text.length ? (window.clearInterval(t), x) : x + 2)), speed);
    return () => window.clearInterval(t);
  }, [text, speed]);
  return [text.slice(0, n), n >= text.length, () => setN(text.length)] as const;
}
/** Airport departures-board letters: scramble, then settle left to right. */
function Flap({ text, delay = 0 }: { text: string; delay?: number }) {
  const [shown, setShown] = useState(text.replace(/\S/g, ' '));
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(text); return; }
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let tick = 0;
    const start = window.setTimeout(() => {
      const t = window.setInterval(() => {
        tick++;
        const settled = Math.floor(tick / 1.6);
        setShown([...text].map((ch, i) => (i < settled || ch === ' ' ? ch : A[Math.floor(Math.random() * 26)])).join(''));
        if (settled >= text.length) window.clearInterval(t);
      }, 32);
    }, delay);
    return () => window.clearTimeout(start);
  }, [text, delay]);
  return <span className="mx-flap">{[...shown].map((ch, i) => <i key={i}>{ch}</i>)}</span>;
}

/** A suspect, drawn: hat, hair, coat or scarf. */
function Silhouette({ s, size = 64 }: { s: Suspect; size?: number }) {
  const coat = s.look === 0;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="mx-sil">
      <path d="M8 64 C 10 46, 20 40, 32 40 C 44 40, 54 46, 56 64 Z" fill={coat ? '#6b7280' : '#334155'} />
      {coat && <path d="M24 42 L32 54 L40 42" fill="none" stroke="#9ca3af" strokeWidth="3" />}
      {!coat && <path d="M20 42 Q32 50 44 42 L42 47 Q32 54 22 47 Z" fill="#22c55e" />}
      <circle cx="32" cy="26" r="12" fill="#e7c9a9" />
      <path d={s.hat === 'none' ? 'M20 25 Q21 12 32 12 Q44 12 44 26 Q40 18 32 18 Q24 18 20 25 Z' : 'M21 24 Q22 16 32 16 Q42 16 43 24 Z'} fill={s.hair} />
      {s.hat === 'fedora' && <><path d="M14 20 Q32 14 50 20 L46 22 Q32 18 18 22 Z" fill="#1e293b" /><path d="M21 20 Q22 8 32 8 Q42 8 43 20 Z" fill="#1e293b" /></>}
      {s.hat === 'beret' && <path d="M18 18 Q22 8 34 9 Q46 10 46 18 Q32 22 18 18 Z" fill="#7f1d1d" />}
      {s.hat === 'cap' && <><path d="M20 19 Q22 10 32 10 Q42 10 44 19 Z" fill="#475569" /><path d="M40 18 L52 19 L44 21 Z" fill="#475569" /></>}
      <circle cx="27.5" cy="27" r="1.4" fill="#111827" /><circle cx="36.5" cy="27" r="1.4" fill="#111827" />
    </svg>
  );
}
const HOBBY_ICON = ['♟️', '🐦'];
const RIDE_ICON = ['🏍️', '🚆'];

/** Solve the Mystery: chase a Magpie across the world, clue by clue. */
export function MysteryGame({ onFly, onFocus, setGlobePick, onRoute, onExit }: Props) {
  const date = localDate();
  const [mode, setMode] = useState<Mode>('daily');
  const [seed, setSeed] = useState(`mystery-${date}`);
  const kase: Case = useMemo(() => (mode === 'daily' ? dailyCase(date) : makeCase(seed)), [mode, seed, date]);
  const [st, setSt] = useState<State>(() => load(KEY(date)) ?? fresh());
  const [stats, setStats] = useState<MysteryStats>(() => ({ ...emptyMysteryStats(), ...(load(STATS) ?? {}) }));
  const [notesOpen, setNotesOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [flipping, setFlipping] = useState<number | null>(null);

  const left = Math.max(0, CLOCK - st.used);
  const here = kase.route[st.at];
  const leg = st.at < LEGS ? kase.legs[st.at] : null;
  // Actions work out the next state from the current one and commit it once (side effects included).
  const commit = (n: State) => { setSt(n); if (mode === 'daily') save(KEY(date), n); };

  // Where you are, on the globe.
  useEffect(() => { if (st.phase !== 'flying' && st.phase !== 'over') onFocus(here); }, [here, st.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { setGlobePick(null); onRoute(null); onFocus(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Finishing (solved, or out of time).
  const finish = useCallback((s: State, solved: boolean): State => {
    const result: CaseResult = { solved, hoursLeft: Math.max(0, CLOCK - s.used), deadEnds: s.wrong.reduce((t, w) => t + w.length, 0), wrongSuspect: s.accused.length > 0 };
    track('score', { g: 'mystery', s: solved ? result.hoursLeft : 0, of: CLOCK, m: mode });
    if (solved) window.setTimeout(() => confetti({ particleCount: 140, spread: 85, origin: { y: 0.3 }, colors: ['#fbbf24', '#fde68a', '#f8fafc'], disableForReducedMotion: true }), 500);
    const nst = addCase(stats, mode === 'daily' ? date : null, solved, mode === 'daily' ? addDays(date, -1) : null);
    setStats(nst); save(STATS, nst);
    onRoute(kase.route);
    window.setTimeout(() => setResultOpen(true), 900);
    return { ...s, phase: 'over', result };
  }, [stats, mode, date, kase, onRoute]);
  const spend = (s: State, h: number): State => {
    const n = { ...s, used: s.used + h };
    return CLOCK - n.used <= 0 ? finish(n, false) : n;
  };
  // A finished Daily reopens on its result.
  useEffect(() => { if (st.phase === 'over') { onRoute(kase.route); setResultOpen(true); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const flash = (t: string) => { setToast(t); window.setTimeout(() => setToast(null), 2600); };

  // ── Actions ──
  const interview = (w: number) => {
    if (!leg || st.heard[st.at].includes(w)) return;
    setFlipping(w);
    commit(spend({ ...st, heard: st.heard.map((h, i) => (i === st.at ? [...h, w] : h)) }, COST.interview));
  };
  const goTravel = () => commit({ ...st, phase: 'travel' });
  const choose = useCallback((cca3: string) => {
    if (!leg) return;
    if (cca3 === leg.to) {
      track('mystery_leg', { t: leg.tier, ok: 1 });
      const from = kase.route[st.at];
      onFly(from, cca3);
      const n = spend({ ...st, phase: 'flying' }, flightHours(from, cca3));
      commit(n);
      if (n.phase === 'flying') {
        const landed: State = { ...n, at: n.at + 1, phase: n.at + 1 >= LEGS ? 'lineup' : 'stop' };
        window.setTimeout(() => commit(landed), 2300);
      }
    } else {
      if (st.wrong[st.at].includes(cca3)) return;
      track('mystery_leg', { t: leg.tier, ok: 0 });
      const c = BY_CCA3.get(cca3);
      flash(`Dead end in ${c?.name ?? 'there'} — nobody has seen a Magpie. −${COST.deadEnd} h`);
      commit(spend({ ...st, wrong: st.wrong.map((w, i) => (i === st.at ? [...w, cca3] : w)) }, COST.deadEnd));
    }
  }, [leg, st, kase, onFly]); // eslint-disable-line react-hooks/exhaustive-deps
  // Hard legs: tap the country on the globe.
  const globeLeg = st.phase === 'travel' && !!leg && !leg.options && !st.bought[st.at];
  useEffect(() => { setGlobePick(globeLeg ? choose : null); }, [globeLeg, choose, setGlobePick]);
  const buyOptions = () => commit(spend({ ...st, bought: st.bought.map((b, i) => (i === st.at ? true : b)) }, COST.options));
  const accuse = (id: string) => {
    if (st.phase !== 'lineup') return;
    if (id === kase.culprit.id) commit(finish(st, true));
    else if (!st.accused.includes(id)) { flash(`Wrong suspect — they have an alibi. −${COST.wrongSuspect} h`); commit(spend({ ...st, accused: [...st.accused, id] }, COST.wrongSuspect)); }
  };
  const practice = () => {
    track('game', { g: 'mystery', m: 'practice' });
    setResultOpen(false); onRoute(null);
    setMode('practice'); setSeed(`practice-${Date.now()}`); setSt(fresh());
  };
  const share = async () => {
    if (!st.result) return;
    const text = `${caseShare(dailyNumber(date), kase, st.result)}\n${location.origin}/?mystery=1&ref=share`;
    track('share', { g: 'mystery' });
    if (typeof navigator.share === 'function') { await navigator.share({ text }).catch(() => null); return; }
    try { await navigator.clipboard.writeText(text); } catch { /* blocked */ }
    setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  };

  // What you've learned so far (the notebook).
  const notes = useMemo(() => kase.legs.flatMap((l, i) => st.heard[i].map((w) => ({ leg: i, w: l.witnesses[w] }))), [kase, st.heard]);
  const traits = notes.filter((n) => n.w.trait).map((n) => n.w.trait!);
  const hereC = BY_CCA3.get(here)!;

  return (
    <motion.aside className="voy-panel mx-panel" role="dialog" aria-label="Solve the Mystery"
      initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
      <span className="voy-grab" aria-hidden />
      <header className="gc-head">
        <span className="gc-badge mx-badge"><HatGlasses size={15} /></span>
        <div className="gc-title"><b>Solve the Mystery</b><span>{mode === 'daily' ? `Case of the Day #${dailyNumber(date)}` : 'Practice case'} · {rankFor(stats.solved).name}</span></div>
        <span className="gc-spacer" />
        {st.phase !== 'brief' && (
          <span className={`mx-clock ${left <= 12 ? 'low' : ''}`} title="Hours left on the case clock"><Clock size={13} /> <motion.b key={left} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{left}</motion.b> h</span>
        )}
        {st.phase !== 'brief' && <button className="icon-btn" onClick={() => setNotesOpen((v) => !v)} aria-label="Case notes" aria-pressed={notesOpen}><NotebookPen size={16} /></button>}
        <button className="icon-btn" onClick={onExit} aria-label="Close game"><X size={17} /></button>
      </header>

      <div className="voy-scroll">
        <AnimatePresence mode="wait" initial={false}>
          {st.phase === 'brief' && <Briefing key="brief" kase={kase} onStart={() => commit({ ...st, phase: 'stop' })} />}

          {st.phase === 'stop' && leg && (
            <motion.div key={`stop-${st.at}`} className="mx-stop" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <Arrival cca3={here} first={st.at === 0} why={st.at > 0 ? kase.legs[st.at - 1].witnesses.filter((w, i) => w.clue && st.heard[st.at - 1].includes(i)).map((w) => w.clue!.why) : []} />
              <div className="fr-label"><Search size={12} /> Interview the witnesses <span className="mx-cost">{COST.interview} h each</span></div>
              <div className="mx-witnesses">
                {leg.witnesses.map((w, i) => {
                  const open = st.heard[st.at].includes(i);
                  return (
                    <button key={i} className={`mx-card ${open ? 'open' : ''} ${w.trait ? 'trait' : ''}`} onClick={() => interview(i)} disabled={open} aria-label={open ? undefined : `Interview the ${w.role}`}>
                      <motion.span className="mx-card-in" initial={false} animate={{ rotateY: open ? 180 : 0 }} transition={{ duration: flipping === i ? 0.55 : 0 }}>
                        <span className="mx-face front"><b className="mx-ico">{w.icon}</b><span>{w.role}</span><em>Tap to interview</em></span>
                        <span className="mx-face back">
                          <span className="mx-who">{w.icon} {w.role}{w.trait && <i>Suspect detail</i>}</span>
                          <q>{w.clue?.text ?? w.trait?.text}</q>
                          {w.clue?.flag && <img src={flagUrl(w.clue.flag, 160)} alt="A flag" />}
                        </span>
                      </motion.span>
                    </button>
                  );
                })}
              </div>
              <button className="mx-go" onClick={goTravel} disabled={st.heard[st.at].length === 0}>
                {st.heard[st.at].length === 0 ? 'Interview someone first' : <>Where next? <ArrowRight size={16} /></>}
              </button>
            </motion.div>
          )}

          {st.phase === 'travel' && leg && (
            <motion.div key={`travel-${st.at}`} className="mx-travel" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <div className="mx-clues">
                <div className="fr-label"><NotebookPen size={12} /> What the witnesses said</div>
                {st.heard[st.at].map((i) => { const w = leg.witnesses[i]; return <p key={i}><span>{w.icon}</span>{w.clue?.text ?? w.trait?.text}{w.clue?.flag && <img src={flagUrl(w.clue.flag, 80)} alt="A flag" />}</p>; })}
                <button className="mx-back" onClick={() => commit({ ...st, phase: 'stop' })}>← Interview more</button>
              </div>
              {leg.options || st.bought[st.at] ? (
                <div className="mx-board" role="list" aria-label="Departures">
                  <div className="mx-board-head"><Plane size={14} /> DEPARTURES <em>Stop {st.at + 1} of {LEGS}</em></div>
                  {(leg.options ?? leg.extra).map((id, i) => {
                    const c = BY_CCA3.get(id)!;
                    const dead = st.wrong[st.at].includes(id);
                    return (
                      <motion.button key={id} role="listitem" className={`mx-row ${dead ? 'dead' : ''}`} onClick={() => choose(id)} disabled={dead}
                        animate={dead ? { x: [0, -6, 6, -3, 3, 0] } : {}} transition={{ duration: 0.35 }}>
                        <img src={flagUrl(c.cca2, 80)} alt="" />
                        <Flap text={(c.capital[0] ?? c.name).toUpperCase()} delay={i * 120} />
                        <small>{c.name}</small>
                        <b>{dead ? 'NO TRACE' : `${flightHours(here, id)} H`}</b>
                      </motion.button>
                    );
                  })}
                </div>
              ) : (
                <div className="mx-globe-ask">
                  <Globe2 size={22} />
                  <b>Tap the country on the globe</b>
                  <span>No board here, detective — work it out from the clues.{st.wrong[st.at].length > 0 && ` (${st.wrong[st.at].length} dead end${st.wrong[st.at].length > 1 ? 's' : ''} so far)`}</span>
                  <button className="ghost-cta" onClick={buyOptions}><Lightbulb size={14} /> Show me 5 options (−{COST.options} h)</button>
                </div>
              )}
            </motion.div>
          )}

          {st.phase === 'flying' && (
            <motion.div key="flying" className="mx-flying" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="mx-flight">
                <img src={flagUrl(hereC.cca2, 80)} alt="" />
                <span className="mx-path"><motion.i initial={{ left: '0%' }} animate={{ left: '100%' }} transition={{ duration: 2.1, ease: 'easeInOut' }}><Plane size={18} /></motion.i></span>
                <img src={flagUrl(BY_CCA3.get(kase.route[st.at + 1])!.cca2, 80)} alt="" />
              </div>
              <p>On the trail…</p>
            </motion.div>
          )}

          {st.phase === 'lineup' && (
            <motion.div key="lineup" className="mx-lineup" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <Arrival cca3={here} hideout why={kase.legs[LEGS - 1].witnesses.filter((w, i) => w.clue && st.heard[LEGS - 1].includes(i)).map((w) => w.clue!.why)} />
              <div className="fr-label"><NotebookPen size={12} /> Your case board</div>
              <div className="mx-traits">
                {(['look', 'hobby', 'ride'] as TraitKind[]).map((k) => {
                  const t = traits.find((x) => x.kind === k);
                  return <span key={k} className={t ? 'got' : ''}>{t ? <><Check size={12} /> {traitLabel(k, t.value)}</> : `? ${k === 'look' ? 'What they wore' : k === 'hobby' ? 'Their hobby' : 'How they travel'} — not found`}</span>;
                })}
              </div>
              <div className="fr-label">Four Magpies are hiding here. Who did it?</div>
              <div className="mx-suspects">
                {kase.lineup.map((s) => {
                  const wrong = st.accused.includes(s.id);
                  return (
                    <motion.button key={s.id} className={`mx-suspect ${wrong ? 'wrong' : ''}`} onClick={() => accuse(s.id)} disabled={wrong} whileTap={{ scale: 0.97 }}>
                      <Silhouette s={s} />
                      <b>{s.name}</b>
                      <em>“{s.alias}”</em>
                      <span className="mx-tags"><i title={TRAITS.look[s.look]}>{s.look === 0 ? '🧥' : '🧣'}</i><i title={TRAITS.hobby[s.hobby]}>{HOBBY_ICON[s.hobby]}</i><i title={TRAITS.ride[s.ride]}>{RIDE_ICON[s.ride]}</i></span>
                      <small>{TRAITS.look[s.look]} · {TRAITS.hobby[s.hobby]} · {TRAITS.ride[s.ride]}</small>
                      {wrong && <span className="mx-stamp bad">ALIBI</span>}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {st.phase === 'over' && st.result && (
            <motion.div key="over" className="mx-over" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className={`mx-verdict ${st.result.solved ? 'won' : ''}`}>
                <span className="mx-stamp">{st.result.solved ? 'CASE CLOSED' : 'ESCAPED'}</span>
                <p>{st.result.solved ? `${kase.culprit.name} is in custody and ${kase.item} is on its way home.` : `${kase.culprit.name} slipped away with ${kase.item}.`}</p>
              </div>
              <button className="primary" onClick={() => setResultOpen(true)}>See the case report</button>
              <button className="ghost-cta" onClick={practice}><RotateCcw size={14} /> New practice case</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {notesOpen && (
          <motion.div className="mx-notes" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}>
            <div className="mx-notes-head"><NotebookPen size={14} /> Case notes <button className="icon-btn" onClick={() => setNotesOpen(false)} aria-label="Close notes"><X size={15} /></button></div>
            {notes.length === 0 ? <p className="mx-empty">Nothing yet — interview some witnesses.</p> : (
              <ul>{notes.map((n, i) => <li key={i}><span>{BY_CCA3.get(kase.route[n.leg])?.capital[0]}</span>{n.w.clue?.text ?? n.w.trait?.text}</li>)}</ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{toast && <motion.div className="mx-toast" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}>{toast}</motion.div>}</AnimatePresence>

      {createPortal(
        <AnimatePresence>
          {resultOpen && st.result && (
            <Report key="report" kase={kase} result={st.result} mode={mode} no={dailyNumber(date)} stats={stats} copied={copied}
              onShare={() => void share()} onPractice={practice} onClose={() => setResultOpen(false)} />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </motion.aside>
  );
}

function Briefing({ kase, onStart }: { kase: Case; onStart: () => void }) {
  const start = BY_CCA3.get(kase.start)!;
  const text = `Last night, ${kase.item} vanished from the national museum in ${start.capital[0]}. A Magpie was seen leaving in a hurry. Follow the trail across the world before it goes cold: interview witnesses, work out where they fled, and name the culprit at their hideout. You have ${CLOCK} hours.`;
  const [shown, done, skip] = useTypewriter(text);
  return (
    <motion.div className="mx-brief" initial={{ opacity: 0, y: 30, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ type: 'spring', stiffness: 220, damping: 22 }} onClick={skip}>
      <div className="mx-folder">
        <span className="mx-tab">ATLAS BUREAU · CASE FILE</span>
        <motion.span className="mx-stamp conf" initial={{ scale: 2.2, opacity: 0, rotate: -18 }} animate={{ scale: 1, opacity: 1, rotate: -12 }} transition={{ delay: 0.5, type: 'spring', stiffness: 400, damping: 14 }}>CONFIDENTIAL</motion.span>
        <h3>The theft of {kase.item}</h3>
        <p className="mx-type">{shown}{!done && <span className="mx-caret" aria-hidden />}</p>
        <div className="mx-gang" aria-hidden>{SUSPECTS.slice(0, 5).map((s) => <Silhouette key={s.id} s={s} size={38} />)}<span>The Magpies</span></div>
      </div>
      <button className="primary" onClick={(e) => { e.stopPropagation(); onStart(); }} >Take the case <ArrowRight size={16} /></button>
    </motion.div>
  );
}

function Arrival({ cca3, first, hideout, why }: { cca3: string; first?: boolean; hideout?: boolean; why: string[] }) {
  const c = BY_CCA3.get(cca3)!;
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => { let live = true; setPhoto(null); if (c.capital[0]) void wikiPhoto(c.capital[0]).then((p) => { if (live) setPhoto(p); }); return () => { live = false; }; }, [c.capital]);
  return (
    <div className="mx-arrive">
      <div className="mx-photo" style={photo ? { backgroundImage: `url("${photo}")` } : undefined}>
        <span className="mx-kicker">{first ? 'The crime scene' : hideout ? 'The hideout' : 'You arrive in'}</span>
        <b><img src={flagUrl(c.cca2, 80)} alt="" /> {c.capital[0]}, {c.name}</b>
        <em><Clock size={11} /> {localTime(cca3)} local time</em>
      </div>
      {why.length > 0 && (
        <ul className="mx-why">{why.map((w) => <motion.li key={w} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}><Check size={13} /> {w}</motion.li>)}</ul>
      )}
    </div>
  );
}

function Report({ kase, result, mode, no, stats, copied, onShare, onPractice, onClose }: {
  kase: Case; result: CaseResult; mode: Mode; no: number; stats: MysteryStats; copied: boolean; onShare: () => void; onPractice: () => void; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const learned = useMemo(() => takeaway(kase), [kase]);
  const hide = BY_CCA3.get(kase.route[kase.route.length - 1])!;
  const rank = rankFor(stats.solved), next = nextRank(stats.solved);
  return (
    <motion.div className="people-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section className="people mx-report" role="dialog" aria-modal="true" aria-label="Case report" onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.6, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
        <button className="result-x" onClick={onClose} aria-label="Close"><X size={17} /></button>
        <div className="mx-paper">
          <span className="mx-masthead">THE GLOBE GAZETTE <em>{mode === 'daily' ? `Case of the Day #${no}` : 'Practice case'}</em></span>
          <h2>{result.solved ? `Treasure recovered in ${hide.capital[0]}!` : `Magpie escapes — ${kase.item} still missing`}</h2>
          <p>{result.solved
            ? `${kase.culprit.name}, “${kase.culprit.alias}”, was caught at a hideout in ${hide.name}. ${kase.item[0].toUpperCase()}${kase.item.slice(1)} is safe.`
            : `${kase.culprit.name} got away to a hideout in ${hide.name} — but the trail taught us plenty.`}</p>
          <div className="mx-score">
            <span><b>{result.hoursLeft}</b> hours to spare</span>
            <span><b>{result.deadEnds}</b> dead end{result.deadEnds === 1 ? '' : 's'}</span>
            <span><b>{rank.name}</b>{next ? ` · ${next.at - stats.solved} more to ${next.name}` : ''}</span>
          </div>
        </div>

        <div className="fr-label">What you learned on this case</div>
        <ol className="mx-learned">
          {learned.map((x) => (
            <li key={x.cca3}>
              <img src={flagUrl(x.cca2, 80)} alt="" />
              <div>
                <span className="mx-role">{x.role}</span>
                <b>{x.name}</b>
                <small>Capital {x.capital} · {x.currency} · {x.language}</small>
                <p>{x.fact}</p>
                {x.clues.map((c) => <em key={c}>✓ {c}</em>)}
              </div>
            </li>
          ))}
        </ol>

        <div className="gwr-actions">
          {mode === 'daily' && <button className="primary" onClick={onShare}>{copied ? <><Check size={15} /> Copied</> : typeof navigator.share === 'function' ? <><Share2 size={15} /> Share</> : <><Copy size={15} /> Copy result</>}</button>}
          <button className={mode === 'daily' ? 'ghost-cta' : 'primary'} onClick={onPractice}><RotateCcw size={15} /> {mode === 'daily' ? 'Practice case' : 'Another case'}</button>
        </div>
        <button className="gwr-globe" onClick={onClose}><Globe2 size={15} /> See the trail on the globe</button>
      </motion.section>
    </motion.div>
  );
}
