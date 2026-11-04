// Geo Crossword: the clue pool and the grid builder. A fresh crossword every time: words are laid
// one at a time, each crossing what's there, and the tidiest of many attempts is kept.
import { CLUE_BOOK } from '../data/crosswordWords';
import { COUNTRIES, MAPPABLE } from './data';
import { levelSpec } from './crosswordLevels';

export interface Entry { answer: string; clue: string; tier: number; kind: string; lens: number[]; flag?: string; cca3?: string }
export type Dir = 'across' | 'down';
export interface Word extends Entry { id: string; no: number; dir: Dir; r: number; c: number }
export interface Puzzle { level: number; rows: number; cols: number; words: Word[] }

const letters = (s: string) => s.normalize('NFD').toUpperCase().replace(/[^A-Z]/g, '');
const lensOf = (s: string) => s.split(/[\s-]+/).map(letters).filter(Boolean).map((w) => w.length);
/** Would this clue give the answer away? (Looks through the words, ignoring accents.) */
export const clueGivesAway = (clue: string, answer: string) => letters(clue).includes(letters(answer));

let POOL: Entry[] | null = null;
/** Every clue there is. Country clues come from the data: well-known countries are the easier ones. */
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
    const fame = c.population >= 6e7 ? 1 : c.population >= 2e7 ? 2 : c.population >= 5e6 ? 3 : c.population >= 1e6 ? 4 : 5;
    const extra = { cca3: c.cca3 };
    add(cap, `Capital of ${c.name}`, Math.min(5, fame + 1), 'capital', extra);
    add(c.name, `Country whose capital is ${cap}`, Math.min(5, fame + 1), 'country', extra);
    add(c.name, 'Whose flag is this?', fame, 'flag', { ...extra, flag: c.cca2 });
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

function attempt(pool: Entry[], target: number, size: number, rand: () => number) {
  const cells = new Map<string, string>();
  const taken = new Set<string>();
  const placed: Placed[] = [];
  const used = new Set<string>();
  const kinds: Record<string, number> = {};
  const maxKind = Math.max(2, Math.ceil(target * 0.3)); // a mix, not a list of capitals
  let minR = 0, maxR = 0, minC = 0, maxC = 0;
  const put = (e: Entry, r: number, c: number, dir: Dir) => {
    const dr = dir === 'down' ? 1 : 0, dc = dir === 'across' ? 1 : 0;
    for (let i = 0; i < e.answer.length; i++) { cells.set(key(r + dr * i, c + dc * i), e.answer[i]); taken.add(`${dir}:${key(r + dr * i, c + dc * i)}`); }
    placed.push({ e, r, c, dir });
    used.add(e.answer);
    if (e.kind !== 'book') kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
    minR = Math.min(minR, r); maxR = Math.max(maxR, r + dr * (e.answer.length - 1));
    minC = Math.min(minC, c); maxC = Math.max(maxC, c + dc * (e.answer.length - 1));
  };
  // A clue must never hand over another answer in this crossword, in either direction.
  const clash = (e: Entry) => used.has(e.answer) || (e.kind !== 'book' && (kinds[e.kind] ?? 0) >= maxKind)
    || placed.some((p) => clueGivesAway(p.e.clue, e.answer) || clueGivesAway(e.clue, p.e.answer));

  const first = pool.find((e) => e.answer.length <= size && e.answer.length >= Math.min(6, size - 1));
  if (!first) return null;
  put(first, 0, 0, 'across');

  let tries = 0;
  for (const e of pool) {
    if (placed.length >= target) break;
    if (tries > 900) break;
    if (clash(e) || e.answer === first.answer) continue;
    tries++;
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
  }
  const cross = placed.reduce((s, p) => s + p.e.answer.length, 0) - cells.size;
  return { placed, count: placed.length, cross, h: maxR - minR + 1, w: maxC - minC + 1, minR, minC };
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

/** A new crossword for this level, steering clear of recently used answers. */
export function makePuzzle(level: number, seed = Date.now(), recent: string[] = []): Puzzle {
  const spec = levelSpec(level);
  const rand = rng(seed);
  const avoid = new Set(recent);
  const tiers = new Set(spec.tiers);
  const inTier = cluePool().filter((e) => tiers.has(e.tier) && e.answer.length <= spec.size);
  // The hardest tier a level allows comes first more often, so difficulty really climbs.
  const top = Math.max(...spec.tiers);
  const shuffled = (fresh: boolean) => inTier
    .map((e) => ({ e, k: rand() - (e.tier === top ? 0.2 : 0) + (fresh && avoid.has(e.answer) ? 2 : 0) }))
    .sort((x, y) => x.k - y.k).map((x) => x.e);
  let best: NonNullable<ReturnType<typeof attempt>> | null = null;
  for (let i = 0; i < 40; i++) {
    const a = attempt(shuffled(i < 30), spec.words, spec.size, rand);
    if (!a) continue;
    const better = !best || a.count > best.count || (a.count === best.count && a.cross - Math.abs(a.h - a.w) * 0.5 > best.cross - Math.abs(best.h - best.w) * 0.5);
    if (better) best = a;
    if (best && best.count >= spec.words && i >= 8) break;
  }
  return finish(level, best!);
}

/** The cells of a word, in order. */
export const cellsOf = (w: Pick<Word, 'r' | 'c' | 'dir' | 'answer'>) =>
  Array.from(w.answer, (_, i) => (w.dir === 'across' ? { r: w.r, c: w.c + i } : { r: w.r + i, c: w.c }));
/** "(3,5)" for a two-word answer, "(8)" for one. */
export const countOf = (w: Pick<Word, 'lens'>) => `(${w.lens.join(',')})`;
/** Points for a word: its letters, multiplied by the current run of words solved in a row. */
export const wordPoints = (w: Pick<Word, 'answer'>, combo: number) => w.answer.length * 10 * Math.min(4, Math.max(1, combo));
