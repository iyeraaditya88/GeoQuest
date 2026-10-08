import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Brain, ChevronsDown, ChevronsUp, Flame, RotateCcw, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { LEVELS, POINTS, ROUND, UP_AFTER, loadBest, nextQuestion, saveBest, type TriviaQ } from '../lib/trivia';

interface Props {
  /** Show the answer on the globe (when it's a country or a known city). */
  onReveal: (answer: string) => void;
  onExit: () => void;
}

interface Round {
  i: number; // questions answered
  q: TriviaQ | null;
  asked: Set<number>;
  level: number; // 0–3
  run: number; // correct in a row at this level (toward the next level)
  score: number;
  correct: number;
  streak: number;
  peak: number;
}

const fresh = (level = 0): Round => {
  const asked = new Set<number>();
  const q = nextQuestion(level, asked);
  if (q) asked.add(q.id);
  return { i: 0, q, asked, level, run: 0, score: 0, correct: 0, streak: 0, peak: level };
};

export function TriviaGame({ onReveal, onExit }: Props) {
  const [r, setR] = useState<Round>(() => fresh());
  const [picked, setPicked] = useState<string | null>(null);
  const [shift, setShift] = useState<'up' | 'down' | null>(null); // level-change toast
  const [best, setBest] = useState(loadBest);
  const timer = useRef(0);
  const finished = r.i >= ROUND || !r.q;
  const q = r.q;

  const advance = useCallback(() => {
    window.clearTimeout(timer.current);
    setPicked(null);
    setR((cur) => {
      if (cur.i >= ROUND) return cur;
      const nq = nextQuestion(cur.level, cur.asked);
      if (nq) cur.asked.add(nq.id);
      return { ...cur, q: nq };
    });
  }, []);

  const choose = useCallback((opt: string) => {
    if (picked || finished || !q) return;
    setPicked(opt);
    const right = opt === q.answer;
    onReveal(q.answer);
    // Adaptive difficulty: UP_AFTER right in a row → harder; a miss → easier.
    let { level, run } = r;
    let moved: 'up' | 'down' | null = null;
    if (right) {
      run += 1;
      if (run >= UP_AFTER && level < LEVELS.length - 1) { level += 1; run = 0; moved = 'up'; }
    } else {
      run = 0;
      if (level > 0) { level -= 1; moved = 'down'; }
    }
    setShift(moved);
    setR({
      ...r, i: r.i + 1, level, run,
      score: r.score + (right ? POINTS[LEVELS.indexOf(q.difficulty)] : 0),
      correct: r.correct + (right ? 1 : 0),
      streak: right ? r.streak + 1 : 0,
      peak: Math.max(r.peak, level),
    });
    timer.current = window.setTimeout(advance, right ? 1300 : 2300);
  }, [picked, finished, q, r, onReveal, advance]);

  // Level-change toast fades on its own.
  useEffect(() => {
    if (!shift) return;
    const t = window.setTimeout(() => setShift(null), 1600);
    return () => window.clearTimeout(t);
  }, [shift]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // End of round: best score + a little celebration.
  useEffect(() => {
    if (!finished) return;
    if (r.score > best) { saveBest(r.score); setBest(r.score); }
    if (r.correct >= 8) confetti({ particleCount: 120, spread: 80, origin: { y: 0.25 }, colors: ['#fde68a', '#34d399', '#7dd3fc'], disableForReducedMotion: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const restart = () => { window.clearTimeout(timer.current); setPicked(null); setShift(null); setR(fresh(Math.max(0, r.level - 1))); };


  const lv = LEVELS[r.level];
  return (
    <motion.div className="game-card trivia" initial={{ y: -30, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -20, opacity: 0, scale: 0.98 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
      <header className="gc-head">
        <span className="gc-badge"><Brain size={15} /></span>
        <div className="gc-title">
          <b>Geo Trivia</b>
          <span>{finished ? 'Round complete' : `Question ${r.i + (picked ? 0 : 1)} of ${ROUND}`}</span>
        </div>
        {/* Level meter: where you are, and how close to the next level */}
        <div className="tv-level" title={`Level: ${lv} — ${UP_AFTER} right in a row to level up, a miss eases you down`}>
          <div className="tv-steps">
            {LEVELS.map((l, i) => <i key={l} className={i < r.level ? 'done' : i === r.level ? 'on' : ''} data-l={i} />)}
          </div>
          <span className={`tv-name l${r.level}`}>{lv}</span>
          {!finished && r.level < LEVELS.length - 1 && (
            <span className="tv-pips" aria-hidden>{Array.from({ length: UP_AFTER }, (_, i) => <i key={i} className={i < r.run ? 'on' : ''} />)}</span>
          )}
        </div>
        <span className="gc-streak" title="Streak"><Flame size={14} /> {r.streak}</span>
        <button className="icon-btn" onClick={onExit} aria-label="Close game"><X size={17} /></button>
      </header>

      <div className="cap-progress"><motion.i animate={{ width: `${(Math.min(r.i, ROUND) / ROUND) * 100}%` }} transition={{ duration: 0.4 }} /></div>

      <AnimatePresence>
        {shift && (
          <motion.div key={`${shift}-${r.i}`} className={`tv-shift ${shift}`} initial={{ opacity: 0, y: shift === 'up' ? 8 : -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }}>
            {shift === 'up' ? <><ChevronsUp size={15} /> Level up — {lv}</> : <><ChevronsDown size={15} /> Easing off — {lv}</>}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {!finished && q ? (
          <motion.div key={q.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
            <div className="tv-q">
              <span className={`tv-diff l${LEVELS.indexOf(q.difficulty)}`}>{q.difficulty} · {POINTS[LEVELS.indexOf(q.difficulty)]} pts</span>
              <h3>{q.question}</h3>
            </div>
            <div className="cap-options">
              {q.options.map((o) => {
                const state = !picked ? '' : o === q.answer ? 'right' : o === picked ? 'wrong' : 'dim';
                return (
                  <motion.button key={o} className={`cap-opt ${state}`} onClick={() => choose(o)} disabled={!!picked} whileTap={!picked ? { scale: 0.98 } : undefined}
                    animate={state === 'wrong' ? { x: [0, -6, 6, -4, 4, 0] } : {}} transition={{ duration: 0.4 }}>
                    <span>{o}</span>
                  </motion.button>
                );
              })}
            </div>
            <div className="gc-foot">
              <AnimatePresence>
                {picked && (
                  <motion.span className={`gc-feedback ${picked === q.answer ? 'good' : 'bad'}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                    {picked === q.answer ? '✓ Correct!' : <>✗ It’s <b>{q.answer}</b></>}
                  </motion.span>
                )}
              </AnimatePresence>
              <span className="gc-spacer" />
              {picked && <button className="tv-next" onClick={advance}>Next</button>}
              <span className="gc-score">{r.score.toLocaleString('en-US')} pts</span>
            </div>
          </motion.div>
        ) : (
          <motion.div key="done" className="cap-done" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
            <span className="t5-score">{r.score.toLocaleString('en-US')}<small> pts</small></span>
            <span className="t5-verdict">
              {r.correct}/{ROUND} correct · reached <b className={`tv-name l${r.peak}`}>{LEVELS[r.peak]}</b>
              {r.score >= best && r.score > 0 ? ' · new best!' : best ? ` · best ${best.toLocaleString('en-US')}` : ''}
            </span>
            <button className="primary sm" onClick={restart} autoFocus><RotateCcw size={14} /> Play again</button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
