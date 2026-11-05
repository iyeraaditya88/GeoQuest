// Geo Crossword: the clue pool and the grid builder. A fresh crossword every time: words are laid
// one at a time, each crossing what's there, and the tidiest of many attempts is kept.
import { CAPITAL_CLUES, CAPITAL_TIERS, CLUE_BOOK, FLAG_TIERS } from '../data/crosswordWords';
import { COUNTRIES, MAPPABLE } from './data';
import { levelSpec } from './crosswordLevels';

export interface Entry { answer: string; clue: string; tier: number; kind: string; lens: number[]; flag?: string; cca3?: string; where?: string; twin?: string }
export type Dir = 'across' | 'down';
export interface Word extends Entry { id: string; no: number; dir: Dir; r: number; c: number }
export interface Puzzle { level: number; rows: number; cols: number; words: Word[] }

const letters = (s: string) => s.normalize('NFD').toUpperCase().replace(/[^A-Z]/g, '');
const lensOf = (s: string) => s.split(/[\s-]+/).map(letters).filter(Boolean).map((w) => w.length);
/** Would this clue give the answer away? (Looks through the words, ignoring accents.) */
export const clueGivesAway = (clue: string, answer: string) => plain(clue).includes(plain(answer));
const seen = new Map<string, string>(); // (asked thousands of times per grid, of a few hundred strings)
function plain(s: string) { let p = seen.get(s); if (p === undefined) { p = letters(s); seen.set(s, p); } return p; }

const tierIn = (lists: Record<number, string>, cca3: string) => [1, 2, 3].find((t) => lists[t].split(' ').includes(cca3));

let POOL: Entry[] | null = null;
/** Every clue there is. Country clues come from the data, at the difficulty the lists above give them. */
export function cluePool(): Entry[] {
  if (POOL) return POOL;
  const out: Entry[] = [];
  const add = (answerText: string, clue: string, tier: number, kind: string, extra: Partial<Entry> = {}) => {
    const answer = letters(answerText);
    if (answer.length < 3 || answer.length > 13 || clueGivesAway(clue, answer)) return;
    out.push({ answer, clue, tier, kind, lens: lensOf(answerText), ...extra });
  };
  for (const [tier, list] of Object.entries(CLUE_BOOK)) {
    for (const line of list) { const [a, c] = line.split('|'); add(a, c, Number(tier), 'book'); }
  }
  for (const c of COUNTRIES) {
    const cap = c.capital[0];
    if (!c.independent || !MAPPABLE.has(c.cca3) || !cap) continue;
    const capTier = tierIn(CAPITAL_TIERS, c.cca3) ?? (c.population >= 1e7 ? 4 : 5);
    const flagTier = tierIn(FLAG_TIERS, c.cca3) ?? (c.population >= 2e7 ? 4 : 5);
    const where = c.region !== 'Americas' ? c.region : c.subregion === 'South America' ? 'South America' : 'North America';
    const extra = { cca3: c.cca3 };
    // Twins: "Capital of France" and "Country whose capital is Paris" are the same question turned round.
    add(cap, CAPITAL_CLUES[c.cca3] ?? `${c.demonym} seat of government`, capTier, 'capital', { ...extra, twin: letters(cap) });
    add(c.name, `${cap.replace(/,.*/, '')}’s land`, capTier, 'country', { ...extra, where, twin: letters(cap) });
    add(c.name, 'Land under this banner', flagTier, 'flag', { ...extra, flag: c.cca2, where });
  }
  POOL = out;
  return out;
}

const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

interface Placed { e: Entry; r: number; c: number; dir: Dir }
const key = (r: number, c: number) => `${r},${c}`;

/** Can this word go here? Crossings must match, and it can't touch anything it doesn't cross. */
function crossings(cells: Map<string, string>, taken: Set<string>, a: string, r: number, c: number, dir: Dir): number {
  const dr = dir === 'down' ? 1 : 0, dc = dir === 'across' ? 1 : 0;
  if (cells.has(key(r - dr, c - dc)) || cells.has(key(r + dr * a.length, c + dc * a.length))) return -1;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    const y = r + dr * i, x = c + dc * i, at = cells.get(key(y, x));
    if (at) { if (at !== a[i] || taken.has(`${dir}:${key(y, x)}`)) return -1; n++; continue; } // (it crosses a word; it can't run along one)
    if (cells.has(key(y + dc, x + dr)) || cells.has(key(y - dc, x - dr))) return -1; // a neighbour alongside
  }
  return n;
}

function attempt(pool: Entry[], target: number, size: number, mix: Record<number, number>, rand: () => number, roomy = false) {
  const cells = new Map<string, string>();
  const taken = new Set<string>();
  const placed: Placed[] = [];
  const used = new Set<string>();
  const kinds: Record<string, number> = {};
  const inTier: Record<number, number> = {}; // how many of each difficulty, to hold to the level's mix
  const maxKind = (kind: string) => Math.max(2, Math.ceil(target * (roomy ? 0.6 : kind === 'flag' ? 0.25 : 0.4))); // a mix, not a list of capitals
  let minR = 0, maxR = 0, minC = 0, maxC = 0;
  const put = (e: Entry, r: number, c: number, dir: Dir) => {
    const dr = dir === 'down' ? 1 : 0, dc = dir === 'across' ? 1 : 0;
    for (let i = 0; i < e.answer.length; i++) { cells.set(key(r + dr * i, c + dc * i), e.answer[i]); taken.add(`${dir}:${key(r + dr * i, c + dc * i)}`); }
    placed.push({ e, r, c, dir });
    used.add(e.answer);
    if (e.kind !== 'book') kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
    inTier[e.tier] = (inTier[e.tier] ?? 0) + 1;
    minR = Math.min(minR, r); maxR = Math.max(maxR, r + dr * (e.answer.length - 1));
    minC = Math.min(minC, c); maxC = Math.max(maxC, c + dc * (e.answer.length - 1));
  };
  // A clue must never hand over another answer in this crossword, in either direction.
  const clash = (e: Entry) => used.has(e.answer) || (e.kind !== 'book' && (kinds[e.kind] ?? 0) >= maxKind(e.kind))
    || placed.some((p) => clueGivesAway(p.e.clue, e.answer) || clueGivesAway(e.clue, p.e.answer));

  const first = pool.find((e) => e.answer.length <= size && e.answer.length >= Math.min(6, size - 1));
  if (!first) return null;
  put(first, 0, 0, 'across');

  let tries = 0;
  const place = (e: Entry) => {
    let best: { r: number; c: number; dir: Dir; score: number } | null = null;
    const a = e.answer;
    for (let i = 0; i < a.length; i++) {
      for (const p of placed) {
        const dir: Dir = p.dir === 'across' ? 'down' : 'across';
        for (let j = 0; j < p.e.answer.length; j++) {
          if (p.e.answer[j] !== a[i]) continue;
          const y = p.dir === 'down' ? p.r + j : p.r, x = p.dir === 'across' ? p.c + j : p.c;
          const r = dir === 'down' ? y - i : y, c = dir === 'across' ? x - i : x;
          const n = crossings(cells, taken, a, r, c, dir);
          if (n < 1) continue;
          const endR = dir === 'down' ? r + a.length - 1 : r, endC = dir === 'across' ? c + a.length - 1 : c;
          const h = Math.max(maxR, endR) - Math.min(minR, r) + 1, w = Math.max(maxC, endC) - Math.min(minC, c) + 1;
          if (h > size || w > size) continue;
          const score = n * 12 - Math.max(h, w) * 2 - Math.abs(h - w) + rand() * 3;
          if (!best || score > best.score) best = { r, c, dir, score };
        }
      }
    }
    if (best) put(e, best.r, best.c, best.dir);
  };
  // First to the level's mix of difficulties (twice: each word placed opens up new crossings); then,
  // if the grid is still short, anything the level allows.
  for (const strict of [true, true, false]) {
    for (const e of pool) {
      if (placed.length >= target || tries > 400) break;
      if (clash(e) || (strict && (inTier[e.tier] ?? 0) >= Math.ceil(target * mix[e.tier]))) continue;
      tries++;
      place(e);
    }
  }
  const cross = placed.reduce((s, p) => s + p.e.answer.length, 0) - cells.size;
  const offMix = Object.entries(inTier).reduce((n, [t, have]) => n + Math.max(0, have - Math.ceil(target * mix[Number(t)])), 0);
  return { placed, count: placed.length, offMix, cross, h: maxR - minR + 1, w: maxC - minC + 1, minR, minC };
}

/** Number the grid the usual way: left to right, top to bottom, one number per starting cell. */
function finish(level: number, a: NonNullable<ReturnType<typeof attempt>>): Puzzle {
  const norm = a.placed.map((p) => ({ ...p, r: p.r - a.minR, c: p.c - a.minC }));
  const starts = [...new Set(norm.map((p) => p.r * 100 + p.c))].sort((x, y) => x - y);
  const words: Word[] = norm.map((p) => {
    const no = starts.indexOf(p.r * 100 + p.c) + 1;
    return { ...p.e, id: `${no}${p.dir[0]}`, no, dir: p.dir, r: p.r, c: p.c };
  }).sort((x, y) => (x.dir === y.dir ? x.no - y.no : x.dir === 'across' ? -1 : 1));
  return { level, rows: a.h, cols: a.w, words };
}

/** What to remember of these words: the answers, and which capital-and-country pairs have been asked. */
export const usedKeys = (words: Pick<Word, 'answer' | 'twin'>[]) => words.flatMap((w) => (w.twin ? [w.answer, `~${w.twin}`] : [w.answer]));

/**
 * A new crossword for this level, with no answer the player has met before (`used`, newest first).
 * If the level's clues run out: borrow unused ones from the next difficulties, and only after that let
 * the answers met longest ago come back.
 */
export function makePuzzle(level: number, seed = Date.now(), used: string[] = []): Puzzle {
  const spec = levelSpec(level);
  const rand = rng(seed);
  const wider = { ...spec.mix };
  for (const t of spec.tiers) for (const n of [t + 1, t - 1]) if (n >= 1 && n <= 5 && !wider[n]) wider[n] = 0.34;
  const keep = (share: number) => new Set(used.slice(0, Math.ceil(used.length * share)));
  const stages = [{ mix: spec.mix, seen: keep(1) }, { mix: spec.mix, seen: keep(1), roomy: true }, { mix: wider, seen: keep(1), roomy: true }, { mix: spec.mix, seen: keep(0.5) }, { mix: spec.mix, seen: keep(0.25) }, { mix: spec.mix, seen: keep(0) }];
  const enough = Math.max(4, spec.words - 2); // a word or two short beats a word they've seen
  let best: NonNullable<ReturnType<typeof attempt>> | null = null;
  // Full first, then closest to the level's mix, then the tidiest.
  const tidy = (x: NonNullable<typeof best>) => x.cross - Math.abs(x.h - x.w) * 0.5;
  for (const { mix, seen, roomy } of stages) {
    const pool = cluePool().filter((e) => mix[e.tier] && e.answer.length <= spec.size && !seen.has(e.answer) && !(e.twin && seen.has(`~${e.twin}`)));
    if (new Set(pool.map((e) => e.answer)).size < enough) continue;
    best = null;
    for (let i = 0; i < 10; i++) {
      const shuffled = pool.map((e) => ({ e, k: rand() })).sort((x, y) => x.k - y.k).map((x) => x.e);
      const a = attempt(shuffled, spec.words, spec.size, mix, rand, roomy);
      if (!a) continue;
      const better = !best || a.count > best.count || (a.count === best.count && (a.offMix < best.offMix || (a.offMix === best.offMix && tidy(a) > tidy(best))));
      if (better) best = a;
      // (This runs on a phone: it has to be quick.)
      if (best && i >= 5 && (best.count < enough || (best.count >= spec.words && best.offMix === 0))) break;
    }
    if (best && best.count >= enough) break;
  }
  return finish(level, best!);
}

/** The cells of a word, in order. */
export const cellsOf = (w: Pick<Word, 'r' | 'c' | 'dir' | 'answer'>) =>
  Array.from(w.answer, (_, i) => (w.dir === 'across' ? { r: w.r, c: w.c + i } : { r: w.r + i, c: w.c }));
/**
 * Which letters of a word a hint gives: about one in five, spread out, for a nudge and not the answer.
 * The whole word only ever falls when a single letter of it is left to find.
 */
export function hintLetters(answer: string, isRight: (i: number) => boolean): number[] {
  const open = Array.from(answer, (_, i) => i).filter((i) => !isRight(i));
  if (open.length <= 1) return open;
  const give = Math.min(open.length - 1, answer.length >= 11 ? 3 : answer.length >= 7 ? 2 : 1);
  return Array.from({ length: give }, (_, n) => open[Math.floor((n * open.length) / give)]);
}
/** "(3,5)" for a two-word answer, "(8)" for one. */
export const countOf = (w: Pick<Word, 'lens'>) => `(${w.lens.join(',')})`;
/** Points for a word: its letters, multiplied by the current run of words solved in a row. */
export const wordPoints = (w: Pick<Word, 'answer'>, combo: number) => w.answer.length * 10 * Math.min(4, Math.max(1, combo));
