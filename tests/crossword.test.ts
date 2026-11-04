import { describe, expect, it } from 'vitest';
import { CLUE_BOOK } from '../src/data/crosswordWords';
import { cellsOf, clueGivesAway, cluePool, hintLetters, makePuzzle } from '../src/lib/crossword';
import { addSolved, cleanXwCareer, hintPrice, levelSpec, mergeXwCareer, newXwCareer, rankOf, starsFor } from '../src/lib/crosswordLevels';

describe('geo crossword: the grids', () => {
  const levels = [1, 2, 3, 5, 8, 12, 16, 20, 24, 30, 40, 100];
  it.each(levels)('level %i builds a sound crossword every time', (level) => {
    const spec = levelSpec(level);
    for (let seed = 1; seed <= 12; seed++) {
      const p = makePuzzle(level, seed * 7919);
      expect(p.words.length).toBeGreaterThanOrEqual(Math.min(spec.words, 4));
      expect(p.words.length).toBeGreaterThanOrEqual(spec.words - 2); // close to what the level promises
      expect(Math.max(p.rows, p.cols)).toBeLessThanOrEqual(spec.size);

      const grid = new Map<string, string>();
      for (const w of p.words) for (const [i, cell] of cellsOf(w).entries()) {
        const k = `${cell.r},${cell.c}`;
        if (grid.has(k)) expect(grid.get(k)).toBe(w.answer[i]); // crossings agree
        grid.set(k, w.answer[i]);
        expect(cell.r).toBeLessThan(p.rows); expect(cell.c).toBeLessThan(p.cols); expect(cell.r).toBeGreaterThanOrEqual(0); expect(cell.c).toBeGreaterThanOrEqual(0);
      }
      // Every run of 2+ letters in the grid is a word of the crossword: no accidental words.
      const starts = new Set(p.words.map((w) => `${w.dir}:${w.r},${w.c}:${w.answer.length}`));
      for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) {
        if (!grid.has(`${r},${c}`)) continue;
        for (const dir of ['across', 'down'] as const) {
          const [dr, dc] = dir === 'across' ? [0, 1] : [1, 0];
          if (grid.has(`${r - dr},${c - dc}`)) continue;
          let n = 0; while (grid.has(`${r + dr * n},${c + dc * n}`)) n++;
          if (n >= 2) expect(starts.has(`${dir}:${r},${c}:${n}`)).toBe(true);
        }
      }
      // All one connected piece.
      const seen = new Set<string>(); const stack = [[...grid.keys()][0]];
      while (stack.length) { const k = stack.pop()!; if (seen.has(k) || !grid.has(k)) continue; seen.add(k); const [r, c] = k.split(',').map(Number); stack.push(`${r + 1},${c}`, `${r - 1},${c}`, `${r},${c + 1}`, `${r},${c - 1}`); }
      expect(seen.size).toBe(grid.size);
      // No repeats, and no clue gives away any answer in the crossword.
      expect(new Set(p.words.map((w) => w.answer)).size).toBe(p.words.length);
      for (const a of p.words) for (const b of p.words) expect(clueGivesAway(a.clue, b.answer), `${a.clue} / ${b.answer}`).toBe(false);
      expect(new Set(p.words.map((w) => `${w.no}${w.dir}`)).size).toBe(p.words.length);
    }
  });

  it('every clue is usable and never contains its own answer', () => {
    const lines = Object.values(CLUE_BOOK).flat();
    expect(lines.length).toBeGreaterThan(300);
    for (const line of lines) {
      const [a, c] = line.split('|');
      expect(c, line).toBeTruthy();
      expect(clueGivesAway(c, a), line).toBe(false);
    }
    expect(cluePool().every((e) => /^[A-Z]{3,13}$/.test(e.answer) && e.lens.reduce((s, n) => s + n, 0) === e.answer.length)).toBe(true);
  });

  it('asks questions that suit the level', () => {
    // Levels 1–3 are all easy clues; at no level does a clue come from outside its mix.
    for (const level of [1, 2, 3]) for (let seed = 1; seed <= 30; seed++) expect(makePuzzle(level, seed * 31).words.every((w) => w.tier === 1)).toBe(true);
    for (const level of [5, 9, 13, 18, 24, 31, 39, 60]) {
      const spec = levelSpec(level);
      for (let seed = 1; seed <= 10; seed++) {
        const words = makePuzzle(level, seed * 37).words;
        expect(words.every((w) => spec.mix[w.tier] > 0)).toBe(true);
        // Held to the mix: no difficulty more than a word or two over its share.
        for (const t of spec.tiers) expect(words.filter((w) => w.tier === t).length).toBeLessThanOrEqual(Math.ceil(spec.words * spec.mix[t]) + 2);
      }
    }
    // Fame, not population: Level 1 knows Paris and Canada's flag, and never Dhaka or Ethiopia's flag.
    const easy = cluePool().filter((e) => e.tier === 1);
    expect(easy.some((e) => e.answer === 'PARIS')).toBe(true);
    expect(easy.some((e) => e.answer === 'CANADA' && e.flag)).toBe(true);
    expect(easy.some((e) => e.answer === 'DHAKA' || (e.answer === 'ETHIOPIA' && e.flag))).toBe(false);
    expect(cluePool().find((e) => e.answer === 'LONDON')?.clue).toBe('Capital of the United Kingdom');
  });

  it('is new each time, and steers away from recent answers', () => {
    const a = makePuzzle(6, 1), b = makePuzzle(6, 2);
    expect(a.words.map((w) => w.answer).sort()).not.toEqual(b.words.map((w) => w.answer).sort());
    const next = makePuzzle(6, 3, a.words.map((w) => w.answer));
    expect(next.words.filter((w) => a.words.some((x) => x.answer === w.answer)).length).toBeLessThanOrEqual(1);
  });
});

describe('geo crossword: levels and the hint trade', () => {
  it('a hint gives a letter or two, not the answer', () => {
    const none = () => false;
    expect(hintLetters('NILE', none)).toEqual([0]);
    expect(hintLetters('ICELAND', none)).toHaveLength(2);
    expect(hintLetters('SOUTHAMERICA', none)).toHaveLength(3);
    for (const a of ['YEN', 'ASIA', 'AFRICA', 'EVEREST', 'MISSISSIPPI', 'LIECHTENSTEIN']) expect(hintLetters(a, none).length).toBeLessThan(a.length);
    // Skips letters already right; only hands over the last one when nothing else is left to find.
    expect(hintLetters('NILE', (i) => i === 0)).toEqual([1]);
    expect(hintLetters('NILE', (i) => i !== 3)).toEqual([3]);
    expect(hintLetters('NILE', () => true)).toEqual([]);
  });
  it('keeps getting harder, and the level number never stops', () => {
    const specs = [1, 4, 10, 20, 40].map(levelSpec);
    for (let i = 1; i < specs.length; i++) {
      expect(specs[i].words).toBeGreaterThan(specs[i - 1].words);
      expect(specs[i].size).toBeGreaterThanOrEqual(specs[i - 1].size);
      expect(Math.max(...specs[i].tiers)).toBeGreaterThanOrEqual(Math.max(...specs[i - 1].tiers));
    }
    expect(levelSpec(500).level).toBe(500);
    expect(rankOf(1)).toBe('Scout');
    expect(rankOf(999)).toBe('World Legend');
  });
  it('one free hint, then a hint costs the level-up, then the rest cost nothing more', () => {
    expect(hintPrice(0, false)).toBe('free');
    expect(hintPrice(1, false)).toBe('trade');
    expect(hintPrice(2, true)).toBe('paid');
    expect(hintPrice(9, true)).toBe('paid');
  });
  it('levels up unless the level-up was traded', () => {
    const c = newXwCareer();
    expect(addSolved(c, false, 100, 5)).toEqual({ level: 2, solved: 1, points: 100, seen: false, at: 5 });
    expect(addSolved(c, true, 100, 5)).toEqual({ level: 1, solved: 1, points: 100, seen: false, at: 5 });
    expect(starsFor(0, 1, false)).toBe(3);
    expect(starsFor(0, 2, false)).toBe(2);
    expect(starsFor(1, 0, false)).toBe(2);
    expect(starsFor(2, 0, true)).toBe(1);
  });
  it('reads careers safely, keeps the further one, and seen stays seen', () => {
    expect(cleanXwCareer('nope')).toBeNull();
    expect(cleanXwCareer({ level: -4, solved: 'x', seen: 1 })).toEqual({ level: 1, solved: 0, points: 0, seen: false, at: 0 });
    const a = { ...newXwCareer(), level: 7, seen: false }, b = { ...newXwCareer(), level: 3, seen: true };
    expect(mergeXwCareer(a, b)).toEqual({ ...a, seen: true });
    expect(mergeXwCareer(null, b)).toEqual(b);
  });
});
