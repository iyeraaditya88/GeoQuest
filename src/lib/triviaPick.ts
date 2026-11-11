// Geo Trivia: the question pool (the hand-written bank plus thousands from triviaMore) and
// "always something new" picking. Kept apart from trivia.ts so the app's first load doesn't carry it.
import bank from '../../geography_trivia_bank.json';
import { LEVELS, type TriviaQ } from './trivia';
import { moreQuestions } from './triviaMore';

// Only well-formed questions make it in (answer must be one of the options).
const QUESTIONS: TriviaQ[] = (bank as TriviaQ[]).filter(
  (q) => LEVELS.includes(q.difficulty) && q.options.length >= 2 && q.options.includes(q.answer),
);

// The hand-written bank, plus thousands built from the atlas (see triviaMore), built on first use.
let all: TriviaQ[] | null = null;
let kindOf: Map<number, string> | null = null;
function pool(): TriviaQ[] {
  if (!all) {
    all = [
      ...QUESTIONS.map((q) => ({ ...q, kind: 'bank' })),
      ...moreQuestions().map((m) => ({ id: m.id, difficulty: LEVELS[m.level], question: m.question, options: m.options, answer: m.answer, kind: m.kind })),
    ];
    kindOf = new Map(all.map((q) => [q.id, q.kind!]));
  }
  return all;
}
export const triviaPool = pool;
// Build it in a quiet moment once this file has loaded (it's fetched ahead of time), so the first
// question never waits on it.
if (typeof window !== 'undefined') {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(() => pool(), { timeout: 8000 }); else window.setTimeout(pool, 2000);
}

// ── "Always new": remember what this device has seen, least-recent first ──
const SEEN_KEY = 'gq-trivia-seen';
const SEEN_MAX = 12_000;
function loadSeen(): number[] {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as number[]; } catch { return []; }
}
function markSeen(id: number) {
  const seen = loadSeen().filter((x) => x !== id);
  seen.push(id);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen.slice(-SEEN_MAX))); } catch { /* private mode */ }
}

const shuffle = <T,>(xs: T[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const any = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/**
 * Next question at `level` (0–3), never one already asked this round. Prefers questions
 * this device has never seen (only once a level is used up, the one seen longest ago), and a
 * kind of question not yet asked this round, so a round is a mix: borders, cities, money, facts…
 * Falls back to the nearest level if a level has nothing left this round.
 */
export function nextQuestion(level: number, askedThisRound: Set<number>): TriviaQ | null {
  const seen = loadSeen();
  const order = new Map(seen.map((id, i) => [id, i]));
  const all = pool();
  const usedKinds = new Set([...askedThisRound].map((id) => kindOf!.get(id)));
  for (const lv of [level, level - 1, level + 1, level - 2, level + 2, level - 3, level + 3]) {
    if (lv < 0 || lv >= LEVELS.length) continue;
    const here = all.filter((q) => q.difficulty === LEVELS[lv] && !askedThisRound.has(q.id));
    if (!here.length) continue;
    const fresh = here.filter((q) => !order.has(q.id));
    let pick: TriviaQ;
    if (fresh.length) {
      const kinds = [...new Set(fresh.map((q) => q.kind!))];
      const newKinds = kinds.filter((k) => !usedKinds.has(k));
      const kind = any(newKinds.length ? newKinds : kinds);
      pick = any(fresh.filter((q) => q.kind === kind));
    } else pick = here.sort((a, b) => order.get(a.id)! - order.get(b.id)!)[0]; // least recently seen
    markSeen(pick.id);
    return { ...pick, options: shuffle(pick.options) };
  }
  return null;
}

/** A fixed difficulty ramp for live matches (everyone gets the same ten): 3 Easy, 3 Medium, 3 Hard, 1 Impossible. */
export const MATCH_RAMP = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3];
export function matchQuestions(): TriviaQ[] {
  const asked = new Set<number>();
  const out: TriviaQ[] = [];
  for (const lv of MATCH_RAMP) {
    const q = nextQuestion(lv, asked);
    if (!q) break;
    asked.add(q.id);
    out.push(q);
  }
  return out;
}

