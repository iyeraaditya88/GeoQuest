import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Flame, Landmark, RotateCcw, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { flagUrl, type Country } from '../lib/data';
import { makeRound, type Level } from '../lib/capitals';

interface Props {
  onReveal: (cca3: string) => void;
  onExit: () => void;
}

export function CapitalsGame({ onReveal, onExit }: Props) {
  const [level, setLevel] = useState<Level>('easy');
  const [seed, setSeed] = useState(0);
  const round = useMemo(() => makeRound(level), [level, seed]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const finished = i >= round.length;
  const q = round[Math.min(i, round.length - 1)];

  const restart = (lvl: Level = level) => { setLevel(lvl); setSeed((s) => s + 1); setI(0); setPicked(null); setScore(0); setStreak(0); };

  const choose = useCallback((c: Country) => {
    if (picked || finished) return;
    setPicked(c.cca3);
    const right = c.cca3 === q.country.cca3;
    if (right) { setScore((s) => s + 1); setStreak((s) => s + 1); } else setStreak(0);
    onReveal(q.country.cca3); // fly the globe to the answer — learn where it is
    window.setTimeout(() => { setPicked(null); setI((n) => n + 1); }, right ? 1100 : 1900);
  }, [picked, finished, q, onReveal]);

  // Keys 1–4 answer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (finished) { if (e.key === 'Enter') restart(); return; }
      const n = Number(e.key);
      if (n >= 1 && n <= 4 && q.options[n - 1]) { e.preventDefault(); choose(q.options[n - 1]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (finished && score >= 8) confetti({ particleCount: 120, spread: 80, origin: { y: 0.25 }, colors: ['#fde68a', '#34d399', '#7dd3fc'], disableForReducedMotion: true });
  }, [finished, score]);

  return (
    <motion.div
      className="game-card capitals"
      initial={{ y: -30, opacity: 0, scale: 0.98 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: -20, opacity: 0, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
    >
      <header className="gc-head">
        <span className="gc-badge"><Landmark size={15} /></span>
        <div className="gc-title">
          <b>Capitals</b>
          <span>{finished ? 'Round complete' : `Question ${i + 1} of ${round.length}`}</span>
        </div>
        <div className="gc-level" role="radiogroup" aria-label="Difficulty">
          {(['easy', 'all'] as Level[]).map((l) => (
            <button key={l} role="radio" aria-checked={level === l} className={level === l ? 'on' : ''} onClick={() => level !== l && restart(l)}>
              {l === 'easy' ? 'Big countries' : 'All countries'}
            </button>
          ))}
        </div>
        <span className="gc-streak" title="Streak"><Flame size={14} /> {streak}</span>
        <button className="icon-btn" onClick={onExit} aria-label="Close game"><X size={17} /></button>
      </header>

      <div className="cap-progress"><motion.i animate={{ width: `${(Math.min(i, round.length) / round.length) * 100}%` }} transition={{ duration: 0.4 }} /></div>

      <AnimatePresence mode="wait">
        {!finished ? (
          <motion.div key={`${seed}-${i}`} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
            <div className="cap-q">
              {q.kind === 'capital' ? (
                <>
                  <img className="cap-flag" src={flagUrl(q.country.cca2, 160)} alt="" />
                  <h3>What is the capital of <b>{q.country.name}</b>?</h3>
                </>
              ) : (
                <>
                  <span className="cap-icon"><Landmark size={18} /></span>
                  <h3><b>{q.country.capital[0]}</b> is the capital of…</h3>
                </>
              )}
            </div>
            <div className="cap-options">
              {q.options.map((o, n) => {
                const state = !picked ? '' : o.cca3 === q.country.cca3 ? 'right' : o.cca3 === picked ? 'wrong' : 'dim';
                return (
                  <motion.button key={o.cca3} className={`cap-opt ${state}`} onClick={() => choose(o)} disabled={!!picked} whileTap={!picked ? { scale: 0.98 } : undefined}
                    animate={state === 'wrong' ? { x: [0, -6, 6, -4, 4, 0] } : {}} transition={{ duration: 0.4 }}>
                    <kbd>{n + 1}</kbd>
                    {q.kind === 'country' && <img src={flagUrl(o.cca2, 80)} alt="" />}
                    <span>{q.kind === 'capital' ? o.capital[0] : o.name}</span>
                  </motion.button>
                );
              })}
            </div>
            <div className="gc-foot">
              <AnimatePresence>
                {picked && (
                  <motion.span className={`gc-feedback ${picked === q.country.cca3 ? 'good' : 'bad'}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                    {picked === q.country.cca3 ? '✓ Correct' : '✗ Not quite'} — {q.country.capital[0]} is the capital of {q.country.name}
                    {q.country.capital.length > 1 && ` (also ${q.country.capital.slice(1).join(', ')})`}
                  </motion.span>
                )}
              </AnimatePresence>
              <span className="gc-spacer" />
              <span className="gc-score">{score} correct</span>
            </div>
          </motion.div>
        ) : (
          <motion.div key="done" className="cap-done" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
            <span className="t5-score">{score}<small>/{round.length}</small></span>
            <span className="t5-verdict">{score === round.length ? 'Perfect round!' : score >= 8 ? 'Capital expert.' : score >= 5 ? 'Nice work.' : 'Keep exploring the globe!'}</span>
            <button className="primary sm" onClick={() => restart()} autoFocus><RotateCcw size={14} /> Play again <kbd>↵</kbd></button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
