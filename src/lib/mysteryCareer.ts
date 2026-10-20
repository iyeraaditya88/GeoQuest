// Solve the Mystery: ranks and the career ladder. Kept free of country data, so the server can
// check a career it's asked to store.

export const CLOCK = 96;        // hours on the case clock (Senior Detective)
/** The career ladder (our own titles). Each rank plays a harder kind of case. */
export const RANKS = ['Rookie', 'Detective', 'Senior Detective', 'Inspector', 'Master Detective'] as const;
type Tier = 1 | 2 | 3 | 4 | 5;
interface Result { solved: boolean; hoursLeft: number; deadEnds: number; wrongSuspect: boolean }

// ── Levels: each rank plays a harder case ──
export type LevelNo = 1 | 2 | 3 | 4 | 5;
export interface Level {
  n: LevelNo;
  name: string;
  tiers: Tier[];  // one per leg: how hard that leg's clues and choices are
  clock: number;         // hours on the case clock
  lineup: 3 | 4;         // suspects at the hideout
  need: number;          // solid cases to earn the next rank (a brilliant one promotes at once)
  blurb: string;         // what this level's cases are like
}
// Every rank asks real geography: even a Rookie gets currencies, languages and rivers, and the
// departures board lists countries only (a capital or a flag clue still takes knowing whose it is).
export const LEVELS: Level[] = [
  { n: 1, name: RANKS[0], tiers: [1, 2, 3], clock: 72, lineup: 3, need: 2, blurb: '3 stops · capitals, flags, currencies and rivers' },
  { n: 2, name: RANKS[1], tiers: [2, 2, 3, 4], clock: 84, lineup: 4, need: 2, blurb: '4 stops · the last one found on the globe' },
  { n: 3, name: RANKS[2], tiers: [1, 2, 3, 4, 5], clock: CLOCK, lineup: 4, need: 2, blurb: '5 stops · the last two found on the globe' },
  { n: 4, name: RANKS[3], tiers: [2, 3, 4, 4, 5], clock: 92, lineup: 4, need: 2, blurb: '5 stops · three found on the globe, tighter clock' },
  { n: 5, name: RANKS[4], tiers: [3, 3, 4, 5, 5, 5], clock: 100, lineup: 4, need: Infinity, blurb: '6 stops · four found on the globe' },
];
export const levelOf = (n: number) => LEVELS[Math.min(5, Math.max(1, Math.round(n || 1))) - 1];


// ── Career: the next case's level follows how easily you cracked the last one ──
export interface Career { level: LevelNo; merit: number; misses: number; cases: number; at: number }
export const newCareer = (): Career => ({ level: 1, merit: 0, misses: 0, cases: 0, at: 0 });
/** Players from before ranks existed start where their solved cases put them. */
export const careerFromStats = (solved: number): Career => ({ ...newCareer(), level: solved >= 3 ? 3 : solved >= 1 ? 2 : 1 });

export type Grade = 'brilliant' | 'solid' | 'close' | 'escaped';
/**
 * How easily the case was cracked, 0–100: mostly the time left on the clock (every interview,
 * flight, dead end and wrong accusation spends it; finishing with 45%+ to spare is full marks),
 * less 20 per dead end and 25 for naming the wrong suspect.
 */
export function rateCase(r: Result, clock: number): { score: number; grade: Grade } {
  if (!r.solved) return { score: 0, grade: 'escaped' };
  const time = Math.min(1, Math.max(0, r.hoursLeft / clock) / 0.45);
  const score = Math.max(0, Math.min(100, Math.round(100 * time - 20 * r.deadEnds - (r.wrongSuspect ? 25 : 0))));
  return { score, grade: score >= 80 ? 'brilliant' : score >= 50 ? 'solid' : 'close' };
}
export type CareerChange = 'up' | 'down' | null;
/**
 * Add a finished case. Brilliant: straight up a rank. Solid: one step toward it (two at this rank
 * and you're up). A close call holds you where you are. Escaping twice in a row steps you down.
 */
export function addMerit(c: Career, r: Result, clock: number, now = Date.now()): { career: Career; change: CareerChange; score: number; grade: Grade } {
  const { score, grade } = rateCase(r, clock);
  const lvl = levelOf(c.level);
  const base = { cases: c.cases + 1, at: now };
  const up = c.level < 5 && (grade === 'brilliant' || (grade === 'solid' && c.merit + 1 >= lvl.need));
  if (up) return { career: { ...base, level: (c.level + 1) as LevelNo, merit: 0, misses: 0 }, change: 'up', score, grade };
  const misses = r.solved ? 0 : c.misses + 1;
  if (misses >= 2 && c.level > 1) return { career: { ...base, level: (c.level - 1) as LevelNo, merit: 0, misses: 0 }, change: 'down', score, grade };
  return { career: { ...base, level: c.level, merit: grade === 'solid' ? c.merit + 1 : c.merit, misses }, change: null, score, grade };
}
/** A career read from storage or the server: anything malformed falls back to a fresh one. */
export function cleanCareer(x: unknown): Career | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : lo);
  return { level: num(o.level, 1, 5) as LevelNo, merit: num(o.merit, 0, 50), misses: num(o.misses, 0, 10), cases: num(o.cases, 0, 1e6), at: num(o.at, 0, 1e14) };
}
/** Two copies (this device, the account): the most recently updated wins. */
export const newerCareer = (a: Career | null, b: Career | null) => (!a ? b : !b ? a : b.at > a.at ? b : a);

