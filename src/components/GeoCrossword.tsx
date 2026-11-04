import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Delete, Lightbulb, Puzzle, Sparkles, Star, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { flagUrl } from '../lib/data';
import { cellsOf, countOf, makePuzzle, wordPoints, type Puzzle as Grid, type Word } from '../lib/crossword';
import { addSolved, cleanXwCareer, hintPrice, levelSpec, mergeXwCareer, newXwCareer, nextRank, rankOf, starsFor, type XwCareer } from '../lib/crosswordLevels';
import { markCrosswordSeen } from '../lib/crosswordNew';
import { musicMuted } from '../lib/music';
import { track } from '../lib/analytics';
import { api } from '../lib/api';
import { crosswordShare, resultText } from '../lib/share';
import { canUseAccount, getAuth } from '../lib/session';
import { ShareButton } from './ShareButton';

interface Props {
  /** A solved word that's a country: show it on the globe (where the globe can be seen). */
  onReveal: (cca3: string) => void;
  onExit: () => void;
}
/** One crossword in play. Saved after every move, so leaving and coming back loses nothing. */
interface Game {
  puzzle: Grid;
  fill: Record<string, string>;
  solved: string[];
  hinted: string[];
  hints: number;
  traded: boolean;
  misses: number;
  points: number;
  combo: number;
}
interface Result { before: number; after: number; traded: boolean; stars: number; earned: number; career: XwCareer }

const GAME = 'gq-xw-game';
const CAREER = 'gq-xw-career';
const RECENT = 'gq-xw-recent';
const KEYS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM-'];
const CHEER = ['', '', 'Nice!', 'On a roll!', 'On fire!', 'Unstoppable!'];
const load = (k: string) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { return null; } };
const save = (k: string, v: unknown) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
const key = (r: number, c: number) => `${r},${c}`;
const pushCareer = (c: XwCareer) => { if (canUseAccount(getAuth())) void api('/api/progress/crossword', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) }).catch(() => null); };
const loadCareer = () => cleanXwCareer(load(CAREER)) ?? newXwCareer();

function newGame(level: number): Game {
  const recent = Array.isArray(load(RECENT)) ? (load(RECENT) as string[]) : [];
  const puzzle = makePuzzle(level, Date.now(), recent);
  return { puzzle, fill: {}, solved: [], hinted: [], hints: 0, traded: false, misses: 0, points: 0, combo: 0 };
}
function loadGame(level: number): Game {
  const g = load(GAME) as Game | null;
  if (g?.puzzle?.words?.length && g.fill && Array.isArray(g.solved) && g.puzzle.level === level) return g;
  return newGame(level);
}

// A few short notes for a solved word and a level-up (off when the music is muted).
let audio: AudioContext | null = null;
function notes(freqs: number[], gap = 0.09, vol = 0.07) {
  if (musicMuted()) return;
  try {
    audio ??= new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({ latencyHint: 'playback' });
    void audio.resume();
    const t0 = audio.currentTime + 0.02;
    freqs.forEach((f, i) => {
      const o = audio!.createOscillator(), g = audio!.createGain(), t = t0 + i * gap;
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.28);
      o.connect(g).connect(audio!.destination); o.start(t); o.stop(t + 0.3);
    });
  } catch { /* no sound on this browser */ }
}
const buzz = (ms: number | number[]) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };

/** Geo Crossword: one crossword at a time, a level up for every one solved without trading it away. */
export function GeoCrossword({ onReveal, onExit }: Props) {
  const [g, setG] = useState<Game>(() => loadGame(loadCareer().level));
  const gRef = useRef(g);
  const [sel, setSel] = useState<{ id: string; i: number }>(() => firstOpen(g));
  const [wave, setWave] = useState<Record<string, number>>({}); // cells lighting up in a just-solved word
  const [wrong, setWrong] = useState<string[]>([]);
  const [cheer, setCheer] = useState<{ n: number; text: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [trade, setTrade] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [intro, setIntro] = useState(() => loadCareer().solved === 0 && !load(GAME));
  const [banner, setBanner] = useState(true);
  const [entering, setEntering] = useState(true); // the grid's opening pop, only as it appears
  const [touch] = useState(() => window.matchMedia('(pointer: coarse)').matches);
  const hold = useRef(false); // a wrong word is shaking: wait for it to clear
  const timers = useRef<number[]>([]);
  const finished = useRef(false);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => { timers.current.forEach(window.clearTimeout); void audio?.close().catch(() => null); audio = null; }, []);

  const apply = useCallback((next: Game) => { gRef.current = next; setG(next); save(GAME, next); }, []);

  // Opened once: the "New" tag is gone for good, here and on the account. Signed in: the further of
  // this device and the account wins, and an untouched crossword moves up to match.
  useEffect(() => {
    markCrosswordSeen();
    const here = { ...loadCareer(), seen: true };
    save(CAREER, here);
    if (!canUseAccount(getAuth())) return;
    let live = true;
    void api('/api/progress').then((r) => r.json()).then((d) => {
      if (!live) return;
      const best = mergeXwCareer(here, cleanXwCareer(d?.crossword)) ?? here;
      save(CAREER, best); pushCareer(best);
      const now = gRef.current;
      if (best.level !== now.puzzle.level && !Object.keys(now.fill).length) { const fresh = newGame(best.level); apply(fresh); setSel(firstOpen(fresh)); }
    }).catch(() => pushCareer(here));
    return () => { live = false; };
  }, [apply]);

  const words = g.puzzle.words;
  const byId = useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);
  const atCell = useMemo(() => {
    const m = new Map<string, { words: Word[]; no?: number }>();
    for (const w of words) cellsOf(w).forEach((c, i) => {
      const k = key(c.r, c.c), e = m.get(k) ?? { words: [] };
      e.words.push(w);
      if (i === 0) e.no = w.no;
      m.set(k, e);
    });
    return m;
  }, [words]);
  const locked = useMemo(() => {
    const s = new Set<string>();
    for (const id of g.solved) { const w = byId.get(id); if (w) cellsOf(w).forEach((c) => s.add(key(c.r, c.c))); }
    return s;
  }, [g.solved, byId]);
  const hintedCells = useMemo(() => {
    const s = new Set<string>();
    for (const id of g.hinted) { const w = byId.get(id); if (w) cellsOf(w).forEach((c) => s.add(key(c.r, c.c))); }
    return s;
  }, [g.hinted, byId]);
  const word = byId.get(sel.id) ?? words[0];
  const wordCells = useMemo(() => new Set(cellsOf(word).map((c) => key(c.r, c.c))), [word]);
  const cursor = cellsOf(word)[Math.min(sel.i, word.answer.length - 1)];
  const price = hintPrice(g.hints, g.traded);
  const allDone = g.solved.length >= words.length;

  // The last word's wave plays out, then the result.
  useEffect(() => {
    if (!allDone || finished.current) return;
    finished.current = true;
    const t = window.setTimeout(() => {
      const now = gRef.current;
      const stars = starsFor(now.hints, now.misses, now.traded);
      const earned = now.points + stars * 25;
      const before = loadCareer();
      const after = addSolved({ ...before, seen: true }, now.traded, earned);
      save(CAREER, after); pushCareer(after);
      const recent = Array.isArray(load(RECENT)) ? (load(RECENT) as string[]) : [];
      save(RECENT, [...now.puzzle.words.map((w) => w.answer), ...recent].slice(0, 120));
      save(GAME, null);
      track('crossword', { lv: now.puzzle.level, s: stars, h: now.hints, t: now.traded ? 1 : 0 });
      setResult({ before: now.puzzle.level, after: after.level, traded: now.traded, stars, earned, career: after });
      if (!now.traded) {
        notes([523, 659, 784, 1047], 0.1, 0.08); buzz([20, 40, 30]);
        confetti({ particleCount: 140, spread: 85, origin: { y: 0.35 }, colors: ['#34d399', '#facc15', '#38bdf8', '#fde68a'], disableForReducedMotion: true });
      } else notes([523, 659], 0.1);
    }, 800);
    return () => { window.clearTimeout(t); finished.current = false; };
  }, [allDone]);

  const nextOpen = useCallback((after: Word, g2: Game): { id: string; i: number } => {
    const list = g2.puzzle.words, from = list.findIndex((w) => w.id === after.id);
    for (let d = 1; d <= list.length; d++) {
      const w = list[(from + d) % list.length];
      if (!g2.solved.includes(w.id)) return { id: w.id, i: firstEmpty(w, g2) };
    }
    return { id: after.id, i: 0 };
  }, []);

  const solveWave = (solvedNow: Word[]) => {
    const w: Record<string, number> = {};
    for (const s of solvedNow) cellsOf(s).forEach((c, i) => { w[key(c.r, c.c)] = i; });
    setWave(w);
    later(() => setWave({}), 750);
  };

  const press = useCallback((ch: string) => {
    if (hold.current || result || intro || trade) return;
    const now = gRef.current;
    if (now.solved.length >= now.puzzle.words.length) return;
    const w = now.puzzle.words.find((x) => x.id === sel.id) ?? now.puzzle.words[0];
    const cells = cellsOf(w);
    const isLocked = (k: string) => now.solved.some((id) => { const s = now.puzzle.words.find((x) => x.id === id)!; return cellsOf(s).some((c) => key(c.r, c.c) === k); });

    if (ch === 'BACK') {
      let i = Math.min(sel.i, cells.length - 1);
      const here = key(cells[i].r, cells[i].c);
      if (!now.fill[here] || isLocked(here)) { // nothing here: step back and clear there
        let j = i - 1;
        while (j >= 0 && isLocked(key(cells[j].r, cells[j].c))) j--;
        if (j < 0) return;
        i = j;
      }
      const fill = { ...now.fill };
      delete fill[key(cells[i].r, cells[i].c)];
      apply({ ...now, fill });
      setSel({ id: w.id, i });
      return;
    }

    let i = Math.min(sel.i, cells.length - 1);
    while (i < cells.length && isLocked(key(cells[i].r, cells[i].c))) i++;
    if (i >= cells.length) return;
    const k = key(cells[i].r, cells[i].c);
    const fill = { ...now.fill, [k]: ch };
    const through = now.puzzle.words.filter((x) => !now.solved.includes(x.id) && cellsOf(x).some((c) => key(c.r, c.c) === k));
    const full = through.filter((x) => cellsOf(x).every((c) => fill[key(c.r, c.c)]));
    const right = full.filter((x) => cellsOf(x).every((c, n) => fill[key(c.r, c.c)] === x.answer[n]));
    const bad = full.filter((x) => !right.includes(x));

    let next: Game = { ...now, fill };
    if (right.length) {
      let combo = now.combo, points = now.points;
      for (const x of right) { combo++; points += wordPoints(x, combo); }
      next = { ...next, solved: [...now.solved, ...right.map((x) => x.id)], combo, points };
      solveWave(right);
      notes(combo >= 3 ? [659, 784, 988] : [659, 784]); buzz(15);
      const first = right[0];
      setCheer({ n: Date.now(), text: `${CHEER[Math.min(combo, CHEER.length - 1)] ? `${CHEER[Math.min(combo, CHEER.length - 1)]} ` : ''}+${wordPoints(first, combo)}` });
      later(() => setCheer(null), 1200);
      if (first.cca3 && window.innerWidth > 900) onReveal(first.cca3);
    }
    if (bad.length) {
      next = { ...next, misses: now.misses + 1, combo: 0 };
      const shaking = bad.flatMap((x) => cellsOf(x).map((c) => key(c.r, c.c)));
      setWrong(shaking);
      hold.current = true;
      buzz([30, 30, 30]);
      later(() => {
        const cur = gRef.current, clean = { ...cur.fill };
        const stay = new Set(cur.solved.flatMap((id) => cellsOf(cur.puzzle.words.find((x) => x.id === id)!).map((c) => key(c.r, c.c))));
        for (const s of shaking) if (!stay.has(s)) delete clean[s];
        const after = { ...cur, fill: clean };
        apply(after);
        setWrong([]);
        hold.current = false;
        const stillOn = cur.puzzle.words.find((x) => x.id === w.id)!;
        if (cur.solved.includes(stillOn.id)) setSel(nextOpen(stillOn, after)); else setSel({ id: stillOn.id, i: firstEmpty(stillOn, after) });
      }, 520);
    }
    apply(next);
    if (next.solved.includes(w.id)) setSel(nextOpen(w, next));
    else {
      let j = i + 1;
      const nowLocked = (kk: string) => next.solved.some((id) => cellsOf(next.puzzle.words.find((x) => x.id === id)!).some((c) => key(c.r, c.c) === kk));
      while (j < cells.length && nowLocked(key(cells[j].r, cells[j].c))) j++;
      setSel({ id: w.id, i: j < cells.length ? j : i });
    }
  }, [apply, intro, nextOpen, onReveal, result, sel, trade]);

  /** Reveal the selected word. */
  const reveal = useCallback((tradeIt: boolean) => {
    const now = gRef.current;
    const w = now.puzzle.words.find((x) => x.id === sel.id);
    if (!w || now.solved.includes(w.id)) return;
    const fill = { ...now.fill };
    cellsOf(w).forEach((c, i) => { fill[key(c.r, c.c)] = w.answer[i]; });
    // Another word may be finished by the revealed letters: count it, but it scores nothing either.
    const also = now.puzzle.words.filter((x) => x.id !== w.id && !now.solved.includes(x.id) && cellsOf(x).every((c, i) => fill[key(c.r, c.c)] === x.answer[i]));
    const next: Game = {
      ...now, fill, hints: now.hints + 1, traded: now.traded || tradeIt, combo: 0,
      solved: [...now.solved, w.id, ...also.map((x) => x.id)], hinted: [...now.hinted, w.id],
    };
    apply(next);
    solveWave([w, ...also]);
    setSel(nextOpen(w, next));
    notes([587, 880]); buzz(15);
    track('crossword_hint', { lv: now.puzzle.level, t: tradeIt ? 1 : 0 });
    if (w.cca3 && window.innerWidth > 900) onReveal(w.cca3);
    setNote(tradeIt ? `Level-up traded: you’ll stay on Level ${now.puzzle.level}, and any more hints are free.` : now.hints === 0 && !now.traded ? 'That was your free hint. The next one costs this level-up.' : null);
    later(() => setNote(null), 3600);
  }, [apply, nextOpen, onReveal, sel.id]);
  const takeHint = () => {
    if (allDone || hold.current) return;
    if (price === 'trade') setTrade(true); else reveal(false);
  };

  const pick = (r: number, c: number) => {
    if (hold.current) return;
    const k = key(r, c), e = atCell.get(k);
    if (!e) return;
    const open = e.words.filter((w) => !g.solved.includes(w.id));
    if (!open.length) return;
    const same = open.find((w) => w.id === word.id);
    // Tapping the cursor's own cell turns to the crossing word; otherwise keep the direction you're in.
    const onCursor = cursor.r === r && cursor.c === c;
    const w = onCursor && open.length > 1 ? open.find((x) => x.id !== word.id)! : same ?? open.find((x) => x.dir === word.dir) ?? open[0];
    setSel({ id: w.id, i: cellsOf(w).findIndex((x) => x.r === r && x.c === c) });
  };
  const step = (d: 1 | -1) => {
    const open = words.filter((w) => !g.solved.includes(w.id));
    if (!open.length) return;
    const list = words, at = list.findIndex((w) => w.id === word.id);
    for (let n = 1; n <= list.length; n++) {
      const w = list[(at + d * n + list.length * 2) % list.length];
      if (!g.solved.includes(w.id)) { setSel({ id: w.id, i: firstEmpty(w, g) }); return; }
    }
  };
  const moveCursor = (dr: number, dc: number) => {
    let r = cursor.r + dr, c = cursor.c + dc;
    for (let n = 0; n < 14; n++, r += dr, c += dc) {
      if (atCell.has(key(r, c)) && !locked.has(key(r, c))) { pick(r, c); return; }
    }
  };

  // The real keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest?.('input, textarea')) return;
      if (e.key === 'Escape') {
        if (trade) { e.stopPropagation(); setTrade(false); } else if (intro) setIntro(false); else if (!result) onExit();
        return;
      }
      if (result || intro || trade) return;
      if (/^[a-z]$/i.test(e.key)) { e.preventDefault(); e.stopPropagation(); press(e.key.toUpperCase()); }
      else if (e.key === 'Backspace') { e.preventDefault(); press('BACK'); }
      else if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); moveCursor(0, 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); moveCursor(0, -1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); moveCursor(1, 0); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveCursor(-1, 0); }
      else if (e.key === ' ') { e.preventDefault(); pick(cursor.r, cursor.c); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  useEffect(() => {
    setEntering(true);
    const t = window.setTimeout(() => setEntering(false), 1000);
    return () => window.clearTimeout(t);
  }, [words]);

  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(() => setBanner(false), 1700);
    return () => window.clearTimeout(t);
  }, [banner]);

  const playNext = () => {
    const c = loadCareer();
    finished.current = false;
    const fresh = newGame(c.level);
    apply(fresh);
    setSel(firstOpen(fresh));
    setResult(null);
    setBanner(true);
    setWave({});
  };
  const shareMsg = () => resultText('crossword', crosswordShare(result?.before ?? g.puzzle.level, result?.stars ?? 0, g.hints, !result?.traded));

  const cellsStyle = { '--rows': g.puzzle.rows, '--cols': g.puzzle.cols } as CSSProperties;
  const across = words.filter((w) => w.dir === 'across'), down = words.filter((w) => w.dir === 'down');
  const clueRow = (w: Word) => (
    <li key={w.id}>
      <button className={`xw-clue ${w.id === word.id ? 'on' : ''} ${g.solved.includes(w.id) ? 'done' : ''}`} disabled={g.solved.includes(w.id)} onClick={() => setSel({ id: w.id, i: firstEmpty(w, g) })}>
        <b>{w.no}</b>
        <span>{w.flag && <img src={flagUrl(w.flag, 80)} alt="" />}{w.clue} <em>{countOf(w)}</em></span>
      </button>
    </li>
  );

  return (
    <motion.section className={`xw ${touch ? 'touch' : ''}`} role="dialog" aria-label="Geo Crossword" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.22 }}>
      <header className="xw-head">
        <button className="icon-btn" onClick={onExit} aria-label="Exit Geo Crossword (your crossword is saved)"><X size={18} /></button>
        <div className="xw-level">
          <b>Level {g.puzzle.level}</b>
          <span>{rankOf(g.puzzle.level)}{g.traded ? ' · no level-up' : ''}</span>
        </div>
        <div className="xw-prog" role="progressbar" aria-valuemin={0} aria-valuemax={words.length} aria-valuenow={g.solved.length} aria-label="Words solved">
          <span>{g.solved.length}/{words.length}</span>
          <i><motion.u animate={{ width: `${(g.solved.length / words.length) * 100}%` }} transition={{ type: 'spring', stiffness: 200, damping: 26 }} /></i>
        </div>
        <button className={`xw-hint ${price}`} onClick={takeHint} disabled={allDone}>
          <Lightbulb size={15} />
          <span><b>Hint</b><em>{price === 'free' ? '1 free' : price === 'trade' ? 'costs level-up' : 'free now'}</em></span>
        </button>
      </header>

      <div className="xw-body">
        <div className="xw-play">
          <div className="xw-stage">
            <div className={`xw-grid ${entering ? 'enter' : ''}`} style={cellsStyle}>
              {Array.from({ length: g.puzzle.rows * g.puzzle.cols }, (_, n) => {
                const r = Math.floor(n / g.puzzle.cols), c = n % g.puzzle.cols, k = key(r, c), e = atCell.get(k);
                if (!e) return <i key={k} className="xw-gap" />;
                const cls = ['xw-cell', locked.has(k) ? (hintedCells.has(k) ? 'hinted' : 'solved') : '', wordCells.has(k) ? 'word' : '', cursor.r === r && cursor.c === c && !allDone ? 'cursor' : '', wrong.includes(k) ? 'wrong' : '', k in wave ? 'wave' : ''].filter(Boolean).join(' ');
                return (
                  <button key={k} className={cls} style={{ '--w': wave[k] ?? 0, '--in': r + c } as CSSProperties} onClick={() => pick(r, c)}
                    aria-label={`${e.no ? `${e.no}, ` : ''}row ${r + 1}, column ${c + 1}${g.fill[k] ? `, ${g.fill[k]}` : ', empty'}`}>
                    {e.no && <small>{e.no}</small>}
                    <span>{g.fill[k] ?? ''}</span>
                  </button>
                );
              })}
            </div>
            <AnimatePresence>
              {cheer && <motion.div key={cheer.n} className="xw-cheer" initial={{ opacity: 0, y: 10, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -14 }} transition={{ type: 'spring', stiffness: 420, damping: 22 }}>{cheer.text}</motion.div>}
              {banner && !intro && !result && (
                <motion.div key="banner" className="xw-banner" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.08 }} transition={{ type: 'spring', stiffness: 340, damping: 22 }}>
                  <b>Level {g.puzzle.level}</b><span>{words.length} words · {rankOf(g.puzzle.level)}</span>
                </motion.div>
              )}
              {note && <motion.div key="note" className="xw-note" role="status" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>{note}</motion.div>}
            </AnimatePresence>
          </div>

          <div className="xw-now" aria-live="polite">
            <button className="xw-step" onClick={() => step(-1)} aria-label="Previous clue"><ChevronLeft size={20} /></button>
            <button className="xw-now-text" onClick={() => pick(cursor.r, cursor.c)} aria-label={`${word.no} ${word.dir}: ${word.clue}. Tap to switch direction`}>
              <em>{word.no} {word.dir === 'across' ? 'Across' : 'Down'} · {countOf(word)}</em>
              <span>{word.flag && <img src={flagUrl(word.flag, 80)} alt="" />}{word.clue}</span>
            </button>
            <button className="xw-step" onClick={() => step(1)} aria-label="Next clue"><ChevronRight size={20} /></button>
          </div>

          {touch && (
            <div className="xw-keys" role="group" aria-label="Keyboard">
              {KEYS.map((row) => (
                <div key={row} className="xw-krow">
                  {[...row].map((k) => (k === '-'
                    ? <button key={k} className="xw-key wide" onPointerDown={(e) => { e.preventDefault(); press('BACK'); }} aria-label="Delete"><Delete size={19} /></button>
                    : <button key={k} className="xw-key" onPointerDown={(e) => { e.preventDefault(); press(k); }}>{k}</button>))}
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="xw-list" aria-label="All clues">
          {across.length > 0 && <><h3>Across</h3><ol>{across.map(clueRow)}</ol></>}
          {down.length > 0 && <><h3>Down</h3><ol>{down.map(clueRow)}</ol></>}
        </aside>
      </div>

      <AnimatePresence>
        {intro && (
          <motion.div key="intro" className="xw-over" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="xw-card" initial={{ y: 22, scale: 0.96 }} animate={{ y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 26 }}>
              <span className="xw-card-badge"><Puzzle size={24} /></span>
              <h2>Geo Crossword</h2>
              <ul className="xw-rules">
                <li><Sparkles size={15} /> Solve it and you level up. Every level gets bigger and harder, with no top level.</li>
                <li><Lightbulb size={15} /> One free hint per crossword reveals the word you’re on.</li>
                <li><Star size={15} /> A second hint trades your level-up: you stay on your level and get a new crossword.</li>
              </ul>
              <button className="primary xw-go" onClick={() => { setIntro(false); setBanner(true); }}>Start Level {g.puzzle.level}</button>
            </motion.div>
          </motion.div>
        )}
        {trade && (
          <motion.div key="trade" className="xw-over" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setTrade(false)}>
            <motion.div className="xw-card" role="alertdialog" aria-labelledby="xw-trade-title" initial={{ y: 22, scale: 0.96 }} animate={{ y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 26 }} onClick={(e) => e.stopPropagation()}>
              <span className="xw-card-badge gold"><Lightbulb size={24} /></span>
              <h2 id="xw-trade-title">Trade your level-up?</h2>
              <p>You’ve used your free hint. Take another and you’ll <b>stay on Level {g.puzzle.level}</b> after this crossword, with a new one at the same level. Any more hints on this crossword are then free.</p>
              <div className="xw-actions">
                <button className="primary xw-go" onClick={() => setTrade(false)}>Keep trying</button>
                <button className="ghost-cta xw-go" onClick={() => { setTrade(false); reveal(true); }}>Trade it for a hint</button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {result && <ResultCard key="result" r={result} shareMsg={shareMsg} onNext={playNext} onExit={onExit} />}
      </AnimatePresence>
    </motion.section>
  );
}

/** The first word to work on, and where in it. */
function firstOpen(g: Game): { id: string; i: number } {
  const w = g.puzzle.words.find((x) => !g.solved.includes(x.id)) ?? g.puzzle.words[0];
  return { id: w.id, i: firstEmpty(w, g) };
}
function firstEmpty(w: Word, g: Game) {
  const i = cellsOf(w).findIndex((c) => !g.fill[key(c.r, c.c)]);
  return i < 0 ? 0 : i;
}

/** Solved: a level-up (and maybe a new rank), or a reminder of what was traded. */
function ResultCard({ r, shareMsg, onNext, onExit }: { r: Result; shareMsg: () => string; onNext: () => void; onExit: () => void }) {
  const up = r.after > r.before;
  const newRank = up && rankOf(r.after) !== rankOf(r.before);
  const was = levelSpec(r.before), now = levelSpec(r.after);
  const coming = nextRank(r.after);
  const tougher = Math.max(...now.tiers) > Math.max(...was.tiers);
  return (
    <motion.div className="xw-over" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="xw-card result" role="dialog" aria-label="Crossword solved" initial={{ y: 26, scale: 0.92 }} animate={{ y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }}>
        <div className="xw-stars" aria-label={`${r.stars} of 3 stars`}>
          {[1, 2, 3].map((s) => (
            <motion.span key={s} className={s <= r.stars ? 'on' : ''} initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 14, delay: 0.12 + s * 0.14 }}>
              <Star size={30} fill={s <= r.stars ? 'currentColor' : 'none'} />
            </motion.span>
          ))}
        </div>
        {up ? (
          <>
            <motion.h2 className="xw-up" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 360, damping: 13, delay: 0.5 }}>Level {r.after}!</motion.h2>
            {newRank ? <p className="xw-rank">New rank: <b>{rankOf(r.after)}</b></p> : <p className="xw-rank">{rankOf(r.after)}</p>}
            <p className="xw-next-line">Next up: {now.words} words{now.size > was.size ? ', a bigger grid' : ''}{tougher ? ', tougher clues' : ''}{coming ? ` · ${coming.name} at Level ${coming.level}` : ''}</p>
          </>
        ) : (
          <>
            <h2>Solved!</h2>
            <p className="xw-next-line">You traded this level-up for a hint, so you’re staying on <b>Level {r.before}</b>. Solve the next one with one hint or fewer to move up.</p>
          </>
        )}
        <p className="xw-earned"><b>+{r.earned.toLocaleString('en-US')}</b> points · {r.career.points.toLocaleString('en-US')} in all</p>
        <div className="xw-actions">
          <button className="primary xw-go" onClick={onNext}>{up ? `Play Level ${r.after}` : 'New crossword'}</button>
          <div className="xw-actions-row">
            <ShareButton game="crossword" text={shareMsg} label="Share" className="ghost-cta" />
            <button className="ghost-cta" onClick={onExit}>Back to globe</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
