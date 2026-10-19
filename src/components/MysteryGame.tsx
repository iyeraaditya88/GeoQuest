import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Award, Check, HatGlasses, Clock, Copy, Globe2, Lightbulb, NotebookPen, Plane, RotateCcw, Share2, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { BY_CCA3, flagUrl } from '../lib/data';
import { addDays, localDate, dailyNumber } from '../lib/daily';
import {
  COST, addCase, addMerit, meritFor, careerFromStats, caseShare, cleanCareer, dailyCase, emptyMysteryStats, flightHours, levelOf, makeCase, newCareer, newerCareer, takeaway, traitLabel,
  type Career, type CareerChange, type Case, type CaseResult, type MysteryStats, type Witness,
} from '../lib/mystery';
import { TRAITS, type Suspect, type TraitKind } from '../data/mysteryCast';
import { wikiPhoto } from '../lib/wiki';
import { track } from '../lib/analytics';
import { api } from '../lib/api';
import { canUseAccount, getAuth } from '../lib/session';

/** How much of the screen the game wants: all of it, a slim sheet over the globe, or just a banner. */
export type MysteryStage = 'full' | 'mini' | 'banner';
interface Props {
  onFly: (from: string, to: string) => void;              // arc + camera to the next stop
  onFocus: (cca3: string | null) => void;                 // light up where you are
  setGlobePick: (fn: ((cca3: string) => void) | null) => void; // globe taps come here (hard legs)
  onRoute: (route: string[] | null) => void;              // the whole trail, at the end
  onStage: (stage: MysteryStage) => void;
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
  level?: number;                // the rank this case was played at (older saves: Senior Detective)
  change?: CareerChange;         // promoted or stepped down by this case
}
const fresh = (level: number): State => {
  const n = levelOf(level).tiers.length;
  return { phase: 'brief', at: 0, used: 0, heard: Array.from({ length: n }, () => []), wrong: Array.from({ length: n }, () => []), bought: Array(n).fill(false), accused: [], result: null, level };
};
const KEY = (date: string) => `gq-mystery-${date}`;
const STATS = 'gq-mystery-stats';
const CAREER = 'gq-mystery-career';
/** Your rank: on this device, and (signed in) on your account so it follows you around. */
function loadCareer(stats: MysteryStats): Career {
  return cleanCareer(load(CAREER)) ?? (stats.solved > 0 ? careerFromStats(stats.solved) : newCareer());
}
const pushCareer = (c: Career) => { if (canUseAccount(getAuth())) void api('/api/progress/mystery', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) }).catch(() => null); };
const load = (k: string) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { return null; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Local time in a country (from its first time zone, "UTC+07:00"). */
function localTime(cca3: string) {
  const tz = BY_CCA3.get(cca3)?.timezones[0] ?? 'UTC';
  const m = /UTC([+-])(\d{2}):(\d{2})/.exec(tz);
  const off = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  return new Date(Date.now() + off * 60_000).toISOString().slice(11, 16);
}
/** Text that types itself out. */
function useTypewriter(text: string, speed = 16) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (reduced()) { setN(text.length); return; }
    const t = window.setInterval(() => setN((x) => { if (x >= text.length) { window.clearInterval(t); return x; } return x + 2; }), speed);
    return () => window.clearInterval(t);
  }, [text, speed]);
  return [text.slice(0, n), n >= text.length, () => setN(text.length)] as const;
}
/** A city photo (Wikipedia), for backdrops. */
function useCityPhoto(cca3: string) {
  const c = BY_CCA3.get(cca3);
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => { let live = true; setPhoto(null); if (c?.capital[0]) void wikiPhoto(c.capital[0]).then((p) => { if (live) setPhoto(p); }); return () => { live = false; }; }, [c?.capital]);
  return photo;
}
/** Airport departures-board letters: scramble, then settle left to right. */
function Flap({ text, delay = 0 }: { text: string; delay?: number }) {
  const [shown, setShown] = useState(text.replace(/\S/g, ' '));
  useEffect(() => {
    if (reduced()) { setShown(text); return; }
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let tick = 0, t = 0;
    const start = window.setTimeout(() => {
      t = window.setInterval(() => {
        tick++;
        const settled = Math.floor(tick / 1.6);
        setShown([...text].map((ch, i) => (i < settled || ch === ' ' ? ch : A[Math.floor(Math.random() * 26)])).join(''));
        if (settled >= text.length) window.clearInterval(t);
      }, 32);
    }, delay);
    return () => { window.clearTimeout(start); window.clearInterval(t); };
  }, [text, delay]);
  return <span className="mx-flap">{[...shown].map((ch, i) => <i key={i}>{ch}</i>)}</span>;
}

// ── Characters ──────────────────────────────────────────
type Hat = 'cap' | 'peaked' | 'beret' | 'beanie' | 'visor' | 'bun' | 'none';
interface Look { hat: Hat; hatColor: string; shirt: string; skin: string; hair: string; extra?: 'tie' | 'apron' | 'glasses' | 'scarf' | 'headset' | 'badge' }
const ROLE_LOOK: Record<string, Look> = {
  'Taxi driver': { hat: 'cap', hatColor: '#facc15', shirt: '#334155', skin: '#c68e6a', hair: '#1f2937' },
  'Porter': { hat: 'peaked', hatColor: '#b91c1c', shirt: '#7f1d1d', skin: '#8d5a3b', hair: '#111827', extra: 'badge' },
  'Money changer': { hat: 'visor', hatColor: '#16a34a', shirt: '#f1f5f9', skin: '#e3b38f', hair: '#78350f', extra: 'tie' },
  'Hotel clerk': { hat: 'none', hatColor: '', shirt: '#1e3a8a', skin: '#f1c9a5', hair: '#0f172a', extra: 'tie' },
  'Tour guide': { hat: 'cap', hatColor: '#f97316', shirt: '#0e7490', skin: '#d6a07a', hair: '#422006', extra: 'scarf' },
  'Outdoor shop owner': { hat: 'beanie', hatColor: '#dc2626', shirt: '#166534', skin: '#e8c4a0', hair: '#a16207' },
  'Map seller': { hat: 'beret', hatColor: '#4338ca', shirt: '#78716c', skin: '#b07a55', hair: '#d6d3d1', extra: 'glasses' },
  'Bus driver': { hat: 'peaked', hatColor: '#1d4ed8', shirt: '#93c5fd', skin: '#9a6748', hair: '#111827' },
  'Car rental clerk': { hat: 'none', hatColor: '', shirt: '#be123c', skin: '#e9c2a0', hair: '#b45309', extra: 'headset' },
  'Border officer': { hat: 'peaked', hatColor: '#14532d', shirt: '#365314', skin: '#c08a64', hair: '#1c1917', extra: 'badge' },
  'Travel agent': { hat: 'bun', hatColor: '#7c2d12', shirt: '#db2777', skin: '#f0cfae', hair: '#7c2d12', extra: 'headset' },
  'Café owner': { hat: 'beret', hatColor: '#1f2937', shirt: '#fef3c7', skin: '#d9a982', hair: '#292524', extra: 'apron' },
  'Bookseller': { hat: 'none', hatColor: '', shirt: '#065f46', skin: '#f2d2b6', hair: '#9ca3af', extra: 'glasses' },
  'Station guard': { hat: 'peaked', hatColor: '#0f172a', shirt: '#1e293b', skin: '#a8714e', hair: '#111827', extra: 'badge' },
};
const DIRECTOR: Look = { hat: 'bun', hatColor: '#cbd5e1', shirt: '#475569', skin: '#e9c9a8', hair: '#cbd5e1', extra: 'glasses' };

/** A friendly drawn character: head, hair or hat, shirt and one prop. */
function Person({ look, size = 72, talking = false }: { look: Look; size?: number; talking?: boolean }) {
  const { hat, hatColor, shirt, skin, hair, extra } = look;
  return (
    <svg viewBox="0 0 80 96" width={size} height={size * 1.2} aria-hidden className={`mx-person ${talking ? 'talking' : ''}`}>
      <path d="M10 96 C 12 70, 24 62, 40 62 C 56 62, 68 70, 70 96 Z" fill={shirt} />
      {extra === 'apron' && <path d="M28 70 H52 V96 H28 Z" fill="#fff7ed" opacity="0.92" />}
      {extra === 'tie' && <path d="M38 64 L42 64 L44 80 L40 86 L36 80 Z" fill="#991b1b" />}
      {extra === 'scarf' && <path d="M28 62 Q40 70 52 62 L50 68 Q40 76 30 68 Z" fill="#fbbf24" />}
      {extra === 'badge' && <circle cx="52" cy="74" r="4" fill="#fde68a" stroke="#a16207" strokeWidth="1" />}
      <rect x="35" y="52" width="10" height="12" rx="4" fill={skin} />
      <ellipse cx="40" cy="38" rx="17" ry="19" fill={skin} />
      {hat === 'bun' && <circle cx="40" cy="16" r="7" fill={hair} />}
      {(hat === 'none' || hat === 'bun') && <path d="M23 36 Q22 19 40 19 Q58 19 57 36 Q52 26 40 26 Q28 26 23 36 Z" fill={hair} />}
      {hat === 'cap' && <><path d="M23 30 Q24 17 40 17 Q56 17 57 30 Z" fill={hatColor} /><path d="M50 29 L66 31 L56 33 Z" fill={hatColor} /></>}
      {hat === 'peaked' && <><path d="M22 28 Q40 12 58 28 Z" fill={hatColor} /><rect x="22" y="27" width="36" height="5" rx="2" fill="#0f172a" /><circle cx="40" cy="22" r="2.5" fill="#fde68a" /></>}
      {hat === 'beret' && <path d="M21 28 Q24 14 42 15 Q60 16 59 27 Q40 32 21 28 Z" fill={hatColor} />}
      {hat === 'beanie' && <><path d="M22 31 Q22 13 40 13 Q58 13 58 31 Z" fill={hatColor} /><rect x="22" y="28" width="36" height="5" rx="2" fill="#fca5a5" /></>}
      {hat === 'visor' && <><path d="M22 28 Q40 22 58 28 L58 31 Q40 26 22 31 Z" fill={hatColor} /><path d="M23 31 Q24 21 40 21 Q56 21 57 31 Q50 26 40 26 Q30 26 23 31 Z" fill={hair} /></>}
      {extra === 'glasses' ? (
        <g fill="none" stroke="#1f2937" strokeWidth="1.6"><circle cx="33" cy="39" r="5" /><circle cx="47" cy="39" r="5" /><path d="M38 39 H42" /></g>
      ) : (
        <><circle cx="33" cy="39" r="2" fill="#1f2937" /><circle cx="47" cy="39" r="2" fill="#1f2937" /></>
      )}
      {extra === 'headset' && <path d="M22 38 Q22 20 40 20 Q58 20 58 38 M58 38 L52 46" fill="none" stroke="#111827" strokeWidth="2" />}
      <path d={talking ? 'M34 48 Q40 54 46 48 Q40 51 34 48 Z' : 'M35 48 Q40 52 45 48'} fill={talking ? '#7f1d1d' : 'none'} stroke="#7f1d1d" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
/** A suspect, drawn: hat, hair, coat or scarf. `shadow` = still a mystery. */
function Silhouette({ s, size = 64, shadow = false }: { s: Suspect; size?: number; shadow?: boolean }) {
  const coat = s.look === 0;
  const f = (c: string) => (shadow ? '#0b1022' : c);
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="mx-sil">
      <path d="M8 64 C 10 46, 20 40, 32 40 C 44 40, 54 46, 56 64 Z" fill={f(coat ? '#6b7280' : '#334155')} />
      {!shadow && coat && <path d="M24 42 L32 54 L40 42" fill="none" stroke="#9ca3af" strokeWidth="3" />}
      {!shadow && !coat && <path d="M20 42 Q32 50 44 42 L42 47 Q32 54 22 47 Z" fill="#22c55e" />}
      <circle cx="32" cy="26" r="12" fill={f('#e7c9a9')} />
      <path d={s.hat === 'none' ? 'M20 25 Q21 12 32 12 Q44 12 44 26 Q40 18 32 18 Q24 18 20 25 Z' : 'M21 24 Q22 16 32 16 Q42 16 43 24 Z'} fill={f(s.hair)} />
      {s.hat === 'fedora' && <><path d="M14 20 Q32 14 50 20 L46 22 Q32 18 18 22 Z" fill={f('#1e293b')} /><path d="M21 20 Q22 8 32 8 Q42 8 43 20 Z" fill={f('#1e293b')} /></>}
      {s.hat === 'beret' && <path d="M18 18 Q22 8 34 9 Q46 10 46 18 Q32 22 18 18 Z" fill={f('#7f1d1d')} />}
      {s.hat === 'cap' && <><path d="M20 19 Q22 10 32 10 Q42 10 44 19 Z" fill={f('#475569')} /><path d="M40 18 L52 19 L44 21 Z" fill={f('#475569')} /></>}
      {shadow ? <text x="32" y="31" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fbbf24">?</text> : <><circle cx="27.5" cy="27" r="1.4" fill="#111827" /><circle cx="36.5" cy="27" r="1.4" fill="#111827" /></>}
    </svg>
  );
}
const HOBBY_ICON = ['♟️', '🐦'];
const RIDE_ICON = ['🏍️', '🚆'];
const LOOK_ICON = ['🧥', '🧣'];

/** The Director, in a speech bubble. */
function Director({ text, mood = 'brief' }: { text: string; mood?: 'brief' | 'cheer' | 'warn' }) {
  const [shown] = useTypewriter(text, 14);
  return (
    <motion.div className={`mx-director ${mood}`} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
      <span className="mx-dir-face"><Person look={DIRECTOR} size={44} talking /></span>
      <div className="mx-dir-bubble"><b>Director Finch</b><span>{shown}</span></div>
    </motion.div>
  );
}

/** Solve the Mystery: chase a Magpie across the world, clue by clue. */
export function MysteryGame({ onFly, onFocus, setGlobePick, onRoute, onStage, onExit }: Props) {
  const date = localDate();
  const [mode, setMode] = useState<Mode>('daily');
  const [seed, setSeed] = useState(`mystery-${date}`);
  const [stats, setStats] = useState<MysteryStats>(() => ({ ...emptyMysteryStats(), ...(load(STATS) ?? {}) }));
  const [career, setCareer] = useState<Career>(() => loadCareer(stats));
  const [st, setSt] = useState<State>(() => load(KEY(date)) ?? fresh(career.level));
  const caseLevel = st.level ?? 3;
  const kase: Case = useMemo(() => (mode === 'daily' ? dailyCase(date, caseLevel) : makeCase(seed, caseLevel)), [mode, seed, date, caseLevel]);
  const legsN = kase.legs.length;
  // Signed in: bring the account's rank in (the newer copy wins), and start today's case at it if untouched.
  useEffect(() => {
    if (!canUseAccount(getAuth())) return;
    let live = true;
    void api('/api/progress').then((r) => r.json()).then((d) => {
      if (!live) return;
      const local = cleanCareer(load(CAREER));
      const best = newerCareer(local, cleanCareer(d?.mystery)) ?? loadCareer(stats);
      save(CAREER, best); setCareer(best);
      if (local && best === local) pushCareer(best); // this device is ahead: catch the account up
      setSt((s) => (s.phase === 'brief' && s.used === 0 && (s.level ?? 3) !== best.level ? fresh(best.level) : s));
    }).catch(() => null);
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [notesOpen, setNotesOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [talk, setTalk] = useState<number | null>(null); // the witness whose bubble is open
  const [trail, setTrail] = useState(false);              // case over: looking at the trail on the globe

  const left = Math.max(0, kase.clock - st.used);
  const here = kase.route[st.at];
  const leg = st.at < legsN ? kase.legs[st.at] : null;
  const globeLeg = st.phase === 'travel' && !!leg && !leg.options && !st.bought[st.at];
  const stage: MysteryStage = st.phase === 'flying' ? 'banner' : globeLeg || (st.phase === 'over' && trail) ? 'mini' : 'full';
  useEffect(() => { onStage(stage); }, [stage, onStage]);
  useEffect(() => { setTalk(null); }, [st.at]);

  const commit = (n: State) => { setSt(n); if (mode === 'daily') save(KEY(date), n); };
  useEffect(() => { if (st.phase !== 'flying' && st.phase !== 'over') onFocus(here); }, [here, st.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { setGlobePick(null); onRoute(null); onFocus(null); onStage('mini'); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = useCallback((s: State, solved: boolean): State => {
    const result: CaseResult = { solved, hoursLeft: Math.max(0, kase.clock - s.used), deadEnds: s.wrong.reduce((t, w) => t + w.length, 0), wrongSuspect: s.accused.length > 0 };
    track('score', { g: 'mystery', s: solved ? result.hoursLeft : 0, of: kase.clock, m: mode, lv: kase.level });
    if (solved) window.setTimeout(() => confetti({ particleCount: 150, spread: 90, origin: { y: 0.35 }, colors: ['#fbbf24', '#fde68a', '#a5b4fc', '#f8fafc'], disableForReducedMotion: true }), 700);
    const nst = addCase(stats, mode === 'daily' ? date : null, solved, mode === 'daily' ? addDays(date, -1) : null);
    setStats(nst); save(STATS, nst);
    // The career: merit for this case; promotion (or a step down) when it's earned.
    const { career: nc, change } = addMerit(career, result);
    setCareer(nc); save(CAREER, nc); pushCareer(nc);
    if (change) track('mystery_rank', { to: nc.level, dir: change });
    onRoute(kase.route);
    return { ...s, phase: 'over', result, change };
  }, [stats, career, mode, date, kase, onRoute]);
  const spend = (s: State, h: number): State => { const n = { ...s, used: s.used + h }; return kase.clock - n.used <= 0 ? finish(n, false) : n; };
  useEffect(() => { if (st.phase === 'over') onRoute(kase.route); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const flash = (t: string) => { setToast(t); window.setTimeout(() => setToast(null), 2600); };

  // ── Actions ──
  const interview = (w: number) => {
    if (!leg) return;
    setTalk(w);
    if (!st.heard[st.at].includes(w)) commit(spend({ ...st, heard: st.heard.map((h, i) => (i === st.at ? [...h, w] : h)) }, COST.interview));
  };
  const choose = useCallback((cca3: string) => {
    if (!leg) return;
    if (cca3 === leg.to) {
      track('mystery_leg', { t: leg.tier, ok: 1 });
      const from = kase.route[st.at];
      onFly(from, cca3);
      const n = spend({ ...st, phase: 'flying' }, flightHours(from, cca3));
      commit(n);
      if (n.phase === 'flying') { const landed: State = { ...n, at: n.at + 1, phase: n.at + 1 >= legsN ? 'lineup' : 'stop' }; window.setTimeout(() => commit(landed), 2600); }
    } else {
      if (st.wrong[st.at].includes(cca3)) return;
      track('mystery_leg', { t: leg.tier, ok: 0 });
      flash(`Dead end in ${BY_CCA3.get(cca3)?.name ?? 'there'} — nobody has seen a Magpie. −${COST.deadEnd} h`);
      commit(spend({ ...st, wrong: st.wrong.map((w, i) => (i === st.at ? [...w, cca3] : w)) }, COST.deadEnd));
    }
  }, [leg, st, kase, onFly]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setGlobePick(globeLeg ? choose : null); }, [globeLeg, choose, setGlobePick]);
  const buyOptions = () => commit(spend({ ...st, bought: st.bought.map((b, i) => (i === st.at ? true : b)) }, COST.options));
  const accuse = (id: string) => {
    if (st.phase !== 'lineup') return;
    if (id === kase.culprit.id) commit(finish(st, true));
    else if (!st.accused.includes(id)) { flash(`Wrong suspect — they have an alibi. −${COST.wrongSuspect} h`); commit(spend({ ...st, accused: [...st.accused, id] }, COST.wrongSuspect)); }
  };
  const practice = () => {
    track('game', { g: 'mystery', m: 'practice' });
    setResultOpen(false); setTrail(false); onRoute(null);
    setMode('practice'); setSeed(`practice-${Date.now()}`); setSt(fresh(career.level));
  };
  const share = async () => {
    if (!st.result) return;
    const text = `${caseShare(dailyNumber(date), kase, st.result)}\n${location.origin}/?mystery=1&ref=share`;
    track('share', { g: 'mystery' });
    if (typeof navigator.share === 'function') { await navigator.share({ text }).catch(() => null); return; }
    try { await navigator.clipboard.writeText(text); } catch { /* blocked */ }
    setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  };

  const notes = useMemo(() => kase.legs.flatMap((l, i) => st.heard[i].map((w) => ({ leg: i, w: l.witnesses[w] }))), [kase, st.heard]);
  const traits = notes.filter((n) => n.w.trait).map((n) => n.w.trait!);
  const heardHere = leg ? st.heard[st.at].map((i) => leg.witnesses[i]) : [];
  const prevWhy = st.at > 0 ? kase.legs[st.at - 1].witnesses.filter((w, i) => w.clue && st.heard[st.at - 1].includes(i)).map((w) => w.clue!.why) : [];

  return (
    <motion.aside className={`voy-panel mx-panel stage-${stage}`} role="dialog" aria-label="Solve the Mystery"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
      {stage !== 'banner' && (
        <header className="mx-top">
          <span className="gc-badge mx-badge"><HatGlasses size={15} /></span>
          <div className="mx-top-title"><b>Solve the Mystery</b><span>{mode === 'daily' ? `Case of the Day #${dailyNumber(date)}` : 'Practice case'} · {levelOf(caseLevel).name}</span></div>
          {st.phase !== 'brief' && (
            <span className={`mx-clock ${left <= 12 ? 'low' : ''}`} title="Hours left on the case clock"><Clock size={13} /> <motion.b key={left} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{left}</motion.b> h</span>
          )}
          <button className="icon-btn" onClick={onExit} aria-label="Close game"><X size={17} /></button>
        </header>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {/* ── Briefing ── */}
        {st.phase === 'brief' && <Briefing key="brief" kase={kase} career={career} onStart={() => commit({ ...st, phase: 'stop' })} />}

        {/* ── A stop: the scene, the witnesses, their words ── */}
        {st.phase === 'stop' && leg && (
          <Scene key={`stop-${st.at}`} cca3={here} label={st.at === 0 ? 'The crime scene' : 'You arrive in'}>
            {st.at > 0 && prevWhy.length > 0 && <Director mood="cheer" text={`Good call! ${prevWhy[0]}`} />}
            {st.at === 0 && <Director text={`Start here, ${levelOf(caseLevel).name}. Talk to the witnesses — each costs ${COST.interview} hours. One may describe the thief.`} />}
            <div className="mx-stage">
              <AnimatePresence mode="wait">
                {talk !== null && leg.witnesses[talk] ? (
                  <Quote key={`q-${talk}`} w={leg.witnesses[talk]} tail={`${((talk + 0.5) / leg.witnesses.length) * 100}%`} />
                ) : (
                  <motion.p key="hint" className="mx-stage-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>Tap a witness to hear what they saw.</motion.p>
                )}
              </AnimatePresence>
            </div>
            <div className="mx-crowd">
              {leg.witnesses.map((w, i) => {
                const heard = st.heard[st.at].includes(i);
                return (
                  <motion.button key={i} className={`mx-witness ${talk === i ? 'on' : ''} ${heard ? 'heard' : ''}`} onClick={() => interview(i)}
                    initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 + i * 0.08, type: 'spring', stiffness: 300, damping: 22 }} whileTap={{ scale: 0.95 }}>
                    <Person look={ROLE_LOOK[w.role] ?? ROLE_LOOK['Hotel clerk']} size={talk === i ? 80 : 70} talking={talk === i} />
                    <span>{w.role}</span>
                    <em>{heard ? <><Check size={11} /> heard</> : `${COST.interview} h`}</em>
                  </motion.button>
                );
              })}
            </div>
            <div className="mx-actions">
              <button className="mx-notes-btn" onClick={() => setNotesOpen(true)} aria-label="Case notes"><NotebookPen size={16} /><b>{notes.length}</b></button>
              <button className="mx-go" onClick={() => commit({ ...st, phase: 'travel' })} disabled={heardHere.length === 0}>
                {heardHere.length === 0 ? 'Talk to a witness first' : <>Where next? <ArrowRight size={16} /></>}
              </button>
            </div>
          </Scene>
        )}

        {/* ── Travel: the departures board (full screen) or the globe (slim sheet) ── */}
        {st.phase === 'travel' && leg && (
          <motion.div key={`travel-${st.at}-${globeLeg ? 'g' : 'b'}`} className={`mx-travel ${globeLeg ? 'globe' : 'board'}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {!globeLeg && <h3 className="mx-ask">Where did the thief fly?</h3>}
            <div className="mx-clue-strip" role="list" aria-label="What the witnesses said">
              {heardHere.map((w, i) => <span key={i} role="listitem">{w.icon} {w.trait ? traitLabel(w.trait.kind, w.trait.value) : w.clue?.text}{w.clue?.flag && <img src={flagUrl(w.clue.flag, 80)} alt="A flag" />}</span>)}
            </div>
            {globeLeg ? (
              <div className="mx-globe-ask">
                <b><Globe2 size={16} /> Tap the country on the globe</b>
                <div className="mx-row-btns">
                  <button className="ghost-cta" onClick={() => commit({ ...st, phase: 'stop' })}><ArrowLeft size={14} /> Witnesses</button>
                  <button className="ghost-cta" onClick={buyOptions}><Lightbulb size={14} /> 5 options (−{COST.options} h)</button>
                </div>
              </div>
            ) : (
              <>
                <div className="mx-board" role="list" aria-label="Departures">
                  <div className="mx-board-head"><Plane size={14} /> DEPARTURES <em>Leg {st.at + 1} of {legsN}</em></div>
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
                <div className="mx-actions">
                  <button className="ghost-cta" onClick={() => commit({ ...st, phase: 'stop' })}><ArrowLeft size={15} /> Back to the witnesses</button>
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* ── Flying: just a banner; the globe shows the flight ── */}
        {st.phase === 'flying' && (
          <motion.div key="flying" className="mx-flying" initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }}>
            <img src={flagUrl(BY_CCA3.get(here)!.cca2, 80)} alt="" />
            <span className="mx-path"><motion.i initial={{ left: '0%' }} animate={{ left: '100%' }} transition={{ duration: 2.4, ease: 'easeInOut' }}><Plane size={16} /></motion.i></span>
            <img src={flagUrl(BY_CCA3.get(kase.route[Math.min(st.at + 1, legsN)])!.cca2, 80)} alt="" />
          </motion.div>
        )}

        {/* ── The hideout: name the thief ── */}
        {st.phase === 'lineup' && (
          <Scene key="lineup" cca3={here} label="The hideout" dim>
            <Director mood="warn" text={`This is it — ${kase.lineup.length === 3 ? 'three' : 'four'} Magpies are hiding here in ${BY_CCA3.get(here)?.capital[0]}. Check your notes and name the thief.`} />
            <div className="mx-traits">
              {(['look', 'hobby', 'ride'] as TraitKind[]).map((k) => {
                const t = traits.find((x) => x.kind === k);
                return <span key={k} className={t ? 'got' : ''}>{t ? <><Check size={12} /> {traitLabel(k, t.value)}</> : `? ${k === 'look' ? 'What they wore' : k === 'hobby' ? 'Their hobby' : 'How they travel'}`}</span>;
              })}
            </div>
            <div className="mx-suspects">
              {kase.lineup.map((s, i) => {
                const wrong = st.accused.includes(s.id);
                return (
                  <motion.button key={s.id} className={`mx-suspect ${wrong ? 'wrong' : ''}`} onClick={() => accuse(s.id)} disabled={wrong}
                    initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 + i * 0.08 }} whileTap={{ scale: 0.96 }}>
                    <Silhouette s={s} size={48} />
                    <b>{s.name}</b>
                    <span className="mx-tags"><i title={TRAITS.look[s.look]}>{LOOK_ICON[s.look]}</i><i title={TRAITS.hobby[s.hobby]}>{HOBBY_ICON[s.hobby]}</i><i title={TRAITS.ride[s.ride]}>{RIDE_ICON[s.ride]}</i></span>
                    <small>{TRAITS.look[s.look].replace(/^a (long |bright )?/, '')} · {TRAITS.hobby[s.hobby]} · {TRAITS.ride[s.ride].replace(/^(a vintage |the )/, '')}</small>
                    {wrong && <span className="mx-stamp bad">ALIBI</span>}
                  </motion.button>
                );
              })}
            </div>
            <div className="mx-actions">
              <button className="ghost-cta" onClick={() => setNotesOpen(true)}><NotebookPen size={15} /> Case notes ({notes.length})</button>
            </div>
          </Scene>
        )}

        {/* ── The end: unmasked (or gone) ── */}
        {st.phase === 'over' && st.result && trail && (
          <motion.div key="trail" className="mx-trail" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <span className="mx-trail-route">{kase.route.map((c) => <img key={c} src={flagUrl(BY_CCA3.get(c)!.cca2, 80)} alt={BY_CCA3.get(c)!.name} />)}</span>
            <div className="mx-row-btns">
              <button className="ghost-cta" onClick={() => setTrail(false)}><ArrowLeft size={14} /> Verdict</button>
              <button className="mx-go" onClick={() => setResultOpen(true)}>Case report <ArrowRight size={16} /></button>
            </div>
          </motion.div>
        )}
        {st.phase === 'over' && st.result && !trail && (
          <Scene key="over" cca3={kase.route[kase.route.length - 1]} label={st.result.solved ? 'Case closed' : 'The trail went cold'} dim>
            <div className={`mx-verdict ${st.result.solved ? 'won' : ''}`}>
              <motion.div className="mx-unmask" initial={{ rotateY: 0 }} animate={{ rotateY: st.result.solved ? 360 : 0 }} transition={{ delay: 0.3, duration: 0.9 }}>
                <Silhouette s={kase.culprit} size={120} shadow={!st.result.solved} />
              </motion.div>
              <motion.span className="mx-stamp" initial={{ scale: 2.4, opacity: 0, rotate: -20 }} animate={{ scale: 1, opacity: 1, rotate: -10 }} transition={{ delay: 1, type: 'spring', stiffness: 380, damping: 14 }}>{st.result.solved ? 'CAUGHT' : 'ESCAPED'}</motion.span>
              <b>{st.result.solved ? `${kase.culprit.name}, “${kase.culprit.alias}”` : 'A Magpie got away'}</b>
              <p>{st.result.solved ? `${kase.item[0].toUpperCase()}${kase.item.slice(1)} is safe — with ${st.result.hoursLeft} hours to spare.` : `${kase.item[0].toUpperCase()}${kase.item.slice(1)} is still missing. The trail taught us plenty, though.`}</p>
            </div>
            <CareerNews change={st.change ?? null} career={career} gained={meritFor(st.result)} />
            <div className="mx-actions">
              <button className="ghost-cta" onClick={() => setTrail(true)} aria-label="See the trail on the globe"><Globe2 size={15} /> Trail</button>
              <button className="ghost-cta" onClick={practice}><RotateCcw size={15} /> New case</button>
              <button className="mx-go" onClick={() => setResultOpen(true)}>Case report <ArrowRight size={16} /></button>
            </div>
          </Scene>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {notesOpen && (
          <motion.div className="mx-notes" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}>
            <div className="mx-notes-head"><NotebookPen size={14} /> Case notes <button className="icon-btn" onClick={() => setNotesOpen(false)} aria-label="Close notes"><X size={15} /></button></div>
            {notes.length === 0 ? <p className="mx-empty">Nothing yet — talk to some witnesses.</p> : (
              <ul>{notes.map((n, i) => <li key={i}><span>{BY_CCA3.get(kase.route[n.leg])?.capital[0]} · {n.w.role}</span>{n.w.clue?.text ?? n.w.trait?.text}</li>)}</ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{toast && <motion.div className="mx-toast" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}>{toast}</motion.div>}</AnimatePresence>

      {createPortal(
        <AnimatePresence>
          {resultOpen && st.result && (
            <Report key="report" kase={kase} result={st.result} mode={mode} no={dailyNumber(date)} career={career} copied={copied}
              onShare={() => void share()} onPractice={practice} onClose={() => setResultOpen(false)} onTrail={() => { setResultOpen(false); setTrail(true); }} />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </motion.aside>
  );
}

/** A full-bleed scene: the city behind, its name and local time on top. */
function Scene({ cca3, label, dim, children }: { cca3: string; label: string; dim?: boolean; children: React.ReactNode }) {
  const c = BY_CCA3.get(cca3)!;
  const photo = useCityPhoto(cca3);
  return (
    <motion.div className={`mx-scene ${dim ? 'dim' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="mx-backdrop" style={photo ? { backgroundImage: `url("${photo}")` } : undefined} initial={{ scale: 1.08 }} animate={{ scale: 1 }} transition={{ duration: 6, ease: 'easeOut' }} />
      <div className="mx-place">
        <span>{label}</span>
        <b><img src={flagUrl(c.cca2, 80)} alt="" /> {c.capital[0]}, {c.name}</b>
        <em><Clock size={11} /> {localTime(cca3)}</em>
      </div>
      {children}
    </motion.div>
  );
}

/** A witness's words, in a speech bubble. */
function Quote({ w, tail }: { w: Witness; tail: string }) {
  const text = w.clue?.text ?? w.trait?.text ?? '';
  const [shown] = useTypewriter(text);
  return (
    <motion.div className={`mx-bubble ${w.trait ? 'trait' : ''}`} style={{ ['--tail' as string]: tail }} initial={{ scale: 0.6, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.8, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 22 }}>
      <span className="mx-bubble-who">{w.icon} {w.role}{w.trait && <i>Suspect detail</i>}</span>
      <q>{shown}</q>
      {w.clue?.flag && <motion.img src={flagUrl(w.clue.flag, 160)} alt="A flag" initial={{ rotate: -8, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} transition={{ delay: 0.3 }} />}
    </motion.div>
  );
}

/** Your rank, and how close the next one is (merit pips). */
function RankStrip({ career, gained }: { career: Career; gained?: number }) {
  const lvl = levelOf(career.level);
  const next = career.level < 5 ? levelOf(career.level + 1) : null;
  return (
    <div className="mx-rank">
      <span className="mx-rank-badge" aria-hidden><Award size={18} /><b>{career.level}</b></span>
      <span className="mx-rank-text">
        <b>{lvl.name}{gained !== undefined && <em className={gained > 0 ? 'up' : 'down'}>{gained > 0 ? `+${gained}` : gained} merit</em>}</b>
        <small>{lvl.blurb}</small>
      </span>
      {next ? (
        <span className="mx-pips" title={`${career.merit} of ${lvl.need} merit to ${next.name}`} aria-label={`${career.merit} of ${lvl.need} merit to ${next.name}`}>
          <span>{Array.from({ length: lvl.need }, (_, i) => <i key={i} className={i < career.merit ? 'on' : ''} />)}</span>
          <small>to {next.name}</small>
        </span>
      ) : <span className="mx-pips"><small>Top rank</small></span>}
    </div>
  );
}
/** After a case: a promotion, a step down, or progress toward the next rank. */
function CareerNews({ change, career, gained }: { change: CareerChange; career: Career; gained: number }) {
  const lvl = levelOf(career.level);
  if (change === 'up') return (
    <motion.div className="mx-promo" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.5, type: 'spring', stiffness: 300, damping: 16 }}>
      <span className="mx-medal" aria-hidden><Award size={26} /></span>
      <span><em>Promoted!</em><b>You’re now a {lvl.name}</b><small>Harder cases from here: {lvl.blurb}.</small></span>
    </motion.div>
  );
  if (change === 'down') return (
    <motion.div className="mx-promo down" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4 }}>
      <span><em>A few easier cases</em><b>Back to {lvl.name} for now</b><small>Solve a couple and you’ll climb right back up.</small></span>
    </motion.div>
  );
  return <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4 }}><RankStrip career={career} gained={gained} /></motion.div>;
}

function Briefing({ kase, career, onStart }: { kase: Case; career: Career; onStart: () => void }) {
  const start = BY_CCA3.get(kase.start)!;
  const lvl = levelOf(kase.level);
  const rookie = career.cases === 0 && kase.level === 1;
  const opener = rookie ? 'So you’re our new Rookie. Let’s see if you can crack this one. Last night' : `${lvl.name} — last night`;
  const text = `${opener} ${kase.item} vanished from the national museum in ${start.capital[0]}. One of the Magpies took it. Follow the trail across the world: talk to witnesses, work out where the thief fled, and name them at their hideout. You have ${kase.clock} hours.`;
  const [shown, done, skip] = useTypewriter(text, 14);
  return (
    <motion.div className="mx-brief" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -10 }} onClick={skip}>
      <div className="mx-office">
        <motion.span className="mx-director-big" initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 20 }}>
          <Person look={DIRECTOR} size={92} talking={!done} />
          <b>Director Finch</b>
          <em>The Atlas Bureau</em>
        </motion.span>
        <motion.div className="mx-wanted" initial={{ rotate: 8, y: -30, opacity: 0 }} animate={{ rotate: 3, y: 0, opacity: 1 }} transition={{ delay: 0.35, type: 'spring', stiffness: 260, damping: 16 }}>
          <span>WANTED</span>
          <Silhouette s={kase.culprit} size={64} shadow />
          <small>A Magpie</small>
        </motion.div>
      </div>
      <div className="mx-brief-bubble">
        <b>The theft of {kase.item}</b>
        <p>{shown}{!done && <span className="mx-caret" aria-hidden />}</p>
      </div>
      <RankStrip career={career} />
      <div className="mx-actions">
        <button className="mx-go" onClick={(e) => { e.stopPropagation(); onStart(); }}>Take the case <ArrowRight size={16} /></button>
      </div>
    </motion.div>
  );
}

function Report({ kase, result, mode, no, career, copied, onShare, onPractice, onClose, onTrail }: {
  kase: Case; result: CaseResult; mode: Mode; no: number; career: Career; copied: boolean; onShare: () => void; onPractice: () => void; onClose: () => void; onTrail: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const learned = useMemo(() => takeaway(kase), [kase]);
  const hide = BY_CCA3.get(kase.route[kase.route.length - 1])!;
  const rank = levelOf(career.level), next = career.level < 5 ? levelOf(career.level + 1) : null;
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
            <span><b>{rank.name}</b>{next ? ` · ${Math.max(0, rank.need - career.merit)} merit to ${next.name}` : ''}</span>
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

        <div className="mx-report-bar">
        <div className="gwr-actions">
          {mode === 'daily' && <button className="primary" onClick={onShare}>{copied ? <><Check size={15} /> Copied</> : typeof navigator.share === 'function' ? <><Share2 size={15} /> Share</> : <><Copy size={15} /> Copy result</>}</button>}
          <button className={mode === 'daily' ? 'ghost-cta' : 'primary'} onClick={onPractice}><RotateCcw size={15} /> {mode === 'daily' ? 'Practice case' : 'Another case'}</button>
        </div>
        <button className="gwr-globe" onClick={onTrail}><Globe2 size={15} /> See the trail on the globe</button>
        </div>
      </motion.section>
    </motion.div>
  );
}
