// Geo Crossword: levels, ranks and the hint trade. Kept free of country data, so the server can
// check a career it's asked to store.
//
// Levels never stop counting. Each one asks for more words, a bigger grid and harder clues until
// the grid is as big as a phone can show comfortably; from there the number and rank keep climbing.

export const MAX_GRID = 13;
export const MAX_WORDS = 18;

export interface LevelSpec { level: number; words: number; size: number; tiers: number[]; mix: Record<number, number> }

// The share of a crossword at each clue difficulty, up to each level. Levels 1–3 are all easy clues,
// so anyone can start, and each step shifts the balance towards the next difficulty up.
const MIXES: [upTo: number, mix: Record<number, number>][] = [
  [3, { 1: 1 }], [6, { 1: 0.7, 2: 0.3 }], [10, { 1: 0.35, 2: 0.65 }], [14, { 2: 0.7, 3: 0.3 }], [19, { 2: 0.3, 3: 0.7 }],
  [25, { 3: 0.7, 4: 0.3 }], [32, { 3: 0.3, 4: 0.7 }], [40, { 4: 0.7, 5: 0.3 }], [Infinity, { 4: 0.4, 5: 0.6 }],
];

/** What a level asks for. `tiers` are the clue difficulties (1 anyone … 5 specialist) it draws on. */
export function levelSpec(level: number): LevelSpec {
  const n = Math.max(1, Math.floor(level) || 1);
  const words = Math.min(MAX_WORDS, 4 + Math.floor(n / 2));
  const size = Math.min(MAX_GRID, 7 + Math.floor(n / 3));
  const mix = MIXES.find(([upTo]) => n <= upTo)![1];
  return { level: n, words, size, tiers: Object.keys(mix).map(Number), mix };
}

const RANKS: [from: number, name: string][] = [
  [1, 'Scout'], [3, 'Explorer'], [6, 'Navigator'], [10, 'Pathfinder'], [15, 'Cartographer'],
  [21, 'Geographer'], [28, 'Globetrotter'], [36, 'Atlas Master'], [45, 'World Legend'],
];
export function rankOf(level: number) {
  let name = RANKS[0][1];
  for (const [from, r] of RANKS) if (level >= from) name = r;
  return name;
}
/** The next rank up and the level it starts at (null at the top). */
export function nextRank(level: number) {
  const r = RANKS.find(([from]) => from > level);
  return r ? { level: r[0], name: r[1] } : null;
}

// ── The hint trade: one free per crossword; after that, hints cost this crossword's level-up ──
export type HintPrice = 'free' | 'trade' | 'paid';
/** What the next hint costs. `paid`: the level-up is already traded, so more hints cost nothing further. */
export const hintPrice = (hintsUsed: number, traded: boolean): HintPrice => (traded ? 'paid' : hintsUsed < 1 ? 'free' : 'trade');

/** ★★★ no hints and at most one wrong word; ★★ solved keeping the level-up; ★ the level-up was traded. */
export function starsFor(hintsUsed: number, misses: number, traded: boolean) {
  return traded ? 1 : hintsUsed === 0 && misses <= 1 ? 3 : 2;
}

// ── Career ──
// `used`: every answer this player has met, newest first, so no question comes round twice
// ("~PARIS" marks a capital-and-country pair as asked, either way round).
export interface XwCareer { level: number; solved: number; points: number; seen: boolean; at: number; used: string[] }
export const newXwCareer = (): XwCareer => ({ level: 1, solved: 0, points: 0, seen: false, at: 0, used: [] });
const MAX_USED = 2000; // (more than there are answers)
const joinUsed = (a: string[], b: string[]) => [...new Set([...a, ...b])].slice(0, MAX_USED);
/** Add answers just met: to the front, as the newest. */
export const addUsed = (c: XwCareer, answers: string[]): XwCareer => ({ ...c, used: joinUsed(answers, c.used) });

/** Add a solved crossword: up a level, unless the level-up was traded for a hint. */
export function addSolved(c: XwCareer, traded: boolean, points: number, now = Date.now()): XwCareer {
  return { ...c, level: traded ? c.level : c.level + 1, solved: c.solved + 1, points: c.points + points, at: now };
}
/** A career read from storage or the server; anything malformed reads as none. */
export function cleanXwCareer(x: unknown): XwCareer | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : lo);
  return { level: num(o.level, 1, 1e5), solved: num(o.solved, 0, 1e6), points: num(o.points, 0, 1e10), seen: o.seen === true, at: num(o.at, 0, 1e14),
    used: Array.isArray(o.used) ? joinUsed(o.used.filter((a): a is string => typeof a === 'string' && /^~?[A-Z]{1,40}$/.test(a)), []) : [] };
}
/** Two copies (this device, the account): the further along wins; seen once is seen for good, and answers met on either count. */
export function mergeXwCareer(a: XwCareer | null, b: XwCareer | null): XwCareer | null {
  if (!a || !b) return a ?? b;
  const best = b.level > a.level || (b.level === a.level && b.solved > a.solved) ? b : a;
  return { ...best, seen: a.seen || b.seen, used: joinUsed(best.used, best === a ? b.used : a.used) };
}
