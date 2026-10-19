// Solve the Mystery: ranks and the career ladder. Kept free of country data, so the server can
// check a career it's asked to store.

export const CLOCK = 96;        // hours on the case clock (Senior Detective)
/** The career ladder (our own titles). Each rank plays a harder kind of case. */
export const RANKS = ['Rookie', 'Detective', 'Senior Detective', 'Inspector', 'Master Detective'] as const;
type Tier = 1 | 2 | 3 | 4 | 5;
interface Result { solved: boolean; deadEnds: number; wrongSuspect: boolean }

// ── Levels: each rank plays a harder case ──
export type LevelNo = 1 | 2 | 3 | 4 | 5;
export interface Level {
  n: LevelNo;
  name: string;
  tiers: Tier[];  // one per leg: how hard that leg's clues and choices are
  clock: number;         // hours on the case clock
  lineup: 3 | 4;         // suspects at the hideout
  need: number;          // merit to earn the next rank (see addMerit)
  blurb: string;         // what this level's cases are like
}
export const LEVELS: Level[] = [
  { n: 1, name: RANKS[0], tiers: [1, 1, 2], clock: 72, lineup: 3, need: 3, blurb: '3 stops · capitals and flags' },
  { n: 2, name: RANKS[1], tiers: [1, 2, 2, 3], clock: 84, lineup: 4, need: 4, blurb: '4 stops · currencies, languages and rivers' },
  { n: 3, name: RANKS[2], tiers: [1, 2, 3, 4, 5], clock: CLOCK, lineup: 4, need: 5, blurb: '5 stops · the last two found on the globe' },
  { n: 4, name: RANKS[3], tiers: [2, 3, 3, 4, 5], clock: 92, lineup: 4, need: 6, blurb: '5 stops · tougher clues, tighter clock' },
  { n: 5, name: RANKS[4], tiers: [2, 3, 4, 4, 5, 5], clock: 100, lineup: 4, need: Infinity, blurb: '6 stops · three found on the globe' },
];
export const levelOf = (n: number) => LEVELS[Math.min(5, Math.max(1, Math.round(n || 1))) - 1];


// ── Career: rank goes up with steady good work, and gently down after a rough patch ──
export interface Career { level: LevelNo; merit: number; misses: number; cases: number; at: number }
export const newCareer = (): Career => ({ level: 1, merit: 0, misses: 0, cases: 0, at: 0 });
/** Players from before ranks existed start where their solved cases put them. */
export const careerFromStats = (solved: number): Career => ({ ...newCareer(), level: solved >= 3 ? 3 : solved >= 1 ? 2 : 1 });
/** How a case counts: a clean solve (no dead ends, right suspect first time) is worth 2, any solve 1, a miss −1. */
export const meritFor = (r: Result) => (!r.solved ? -1 : r.deadEnds === 0 && !r.wrongSuspect ? 2 : 1);
export type CareerChange = 'up' | 'down' | null;
/** Add a finished case: promote once merit reaches the rank's bar; after 3 misses in a row, step down a rank. */
export function addMerit(c: Career, r: Result, now = Date.now()): { career: Career; change: CareerChange } {
  const lvl = levelOf(c.level);
  const merit = Math.max(0, c.merit + meritFor(r));
  const misses = r.solved ? 0 : c.misses + 1;
  const base = { cases: c.cases + 1, at: now };
  if (r.solved && merit >= lvl.need && c.level < 5) return { career: { ...base, level: (c.level + 1) as LevelNo, merit: 0, misses: 0 }, change: 'up' };
  if (misses >= 3 && c.level > 1) return { career: { ...base, level: (c.level - 1) as LevelNo, merit: 0, misses: 0 }, change: 'down' };
  return { career: { ...base, level: c.level, merit, misses }, change: null };
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

