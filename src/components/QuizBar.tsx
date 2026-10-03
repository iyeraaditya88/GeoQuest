import { AnimatePresence, motion } from 'motion/react';
import { Flag, Flame, Lightbulb, MapPinned, SkipForward, X } from 'lucide-react';
import { BY_CCA3, flagUrl } from '../lib/data';

export type QuizMode = 'find' | 'flag' | 'clue';
export interface QuizState {
  mode: QuizMode;
  target: string;
  clue?: string;
  streak: number;
  best: number;
  score: number;
  rounds: number;
  misses: number;
  result: 'idle' | 'good' | 'bad' | 'reveal';
}

const MODES: { id: QuizMode; label: string; icon: typeof Flag }[] = [
  { id: 'find', label: 'Find it', icon: MapPinned },
  { id: 'flag', label: 'Flags', icon: Flag },
  { id: 'clue', label: 'GeoGuessr clues', icon: Lightbulb },
];

interface Props {
  quiz: QuizState | null;
  onMode: (m: QuizMode) => void;
  onSkip: () => void;
  onExit: () => void;
}

export function QuizBar({ quiz, onMode, onSkip, onExit }: Props) {
  const target = quiz ? BY_CCA3.get(quiz.target) : undefined;
  return (
    <AnimatePresence>
      {quiz && target && (
        <motion.div
          className={`quiz res-${quiz.result}`}
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -30, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        >
          <div className="quiz-top">
            <div className="quiz-modes">
              {MODES.map((m) => (
                <button key={m.id} className={quiz.mode === m.id ? 'on' : ''} onClick={() => onMode(m.id)}>
                  <m.icon size={13} /> {m.label}
                </button>
              ))}
            </div>
            <div className="quiz-score">
              <span title="Current streak"><Flame size={14} /> {quiz.streak}</span>
              <span className="muted">best {quiz.best}</span>
              <span className="muted">{quiz.score}/{quiz.rounds}</span>
            </div>
            <button className="icon-btn" onClick={onExit} aria-label="Exit quiz"><X size={16} /></button>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={quiz.target + quiz.mode}
              className="quiz-prompt"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="quiz-kicker">Click on the globe</span>
              {quiz.mode === 'find' && <h3>Where is <b>{target.name}</b>?</h3>}
              {quiz.mode === 'flag' && (
                <div className="quiz-flag">
                  <img src={flagUrl(target.cca2, 320)} alt="Mystery flag" />
                  <h3>Which country flies this flag?</h3>
                </div>
              )}
              {quiz.mode === 'clue' && <h3 className="clue">“{quiz.clue}”</h3>}
            </motion.div>
          </AnimatePresence>

          <div className="quiz-foot">
            <AnimatePresence mode="wait">
              <motion.span key={quiz.result + quiz.misses} className="quiz-msg" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                {quiz.result === 'good' && <>✓ Correct — {target.name}!</>}
                {quiz.result === 'bad' && <>Not quite — {3 - quiz.misses > 0 ? `${3 - quiz.misses} more ${3 - quiz.misses === 1 ? 'try' : 'tries'}` : 'revealing…'}</>}
                {quiz.result === 'reveal' && <>It was {target.flag} {target.name}</>}
                {quiz.result === 'idle' && (quiz.mode === 'clue' ? 'Tip: open the GeoGuessr tab to study these clues' : ' ')}
              </motion.span>
            </AnimatePresence>
            <button className="skip" onClick={onSkip}><SkipForward size={13} /> Skip</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
