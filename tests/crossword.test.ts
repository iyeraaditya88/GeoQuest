import { describe, expect, it } from 'vitest';
import { CAPITAL_CLUES, CLUE_BOOK } from '../src/data/crosswordWords';
import { cellsOf, clueGivesAway, cluePool, hintLetters, makePuzzle, usedKeys } from '../src/lib/crossword';
import { addSolved, addUsed, cleanXwCareer, hintPrice, levelSpec, mergeXwCareer, newXwCareer, rankOf, starsFor } from '../src/lib/crosswordLevels';

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
  });

  it('clues read like a crossword, not a quiz', () => {
    for (const e of cluePool()) expect(e.clue, e.answer).not.toMatch(/^(capital of|currency of|country whose|whose flag|what |which )/i);
    // Every capital in the game has its own written clue.
    for (const e of cluePool().filter((x) => x.kind === 'capital')) expect(CAPITAL_CLUES[e.cca3!], e.answer).toBe(e.clue);
    expect(cluePool().find((e) => e.answer === 'ITALY')?.clue).toBe('Boot on the map');
  });

  it('never repeats a question, however far a player gets', () => {
    for (const run of [1, 2]) {
      const used: string[] = [];
      for (let level = 1; level <= 24; level++) { // (past here the clues start to run out: see makePuzzle)
        const words = makePuzzle(level, run * 1000 + level * 13, used).words;
        for (const w of words) {
          expect(used, `level ${level}`).not.toContain(w.answer);
          if (w.twin) expect(used, `${w.clue}, level ${level}`).not.toContain(`~${w.twin}`);
        }
        used.unshift(...usedKeys(words));
      }
    }
  });

  it('knows a question turned round is the same question, and a flag is not', () => {
    const paris = cluePool().find((e) => e.answer === 'PARIS')!;
    const fromCapital = usedKeys([paris]);
    const pool = cluePool().filter((e) => e.answer === 'FRANCE' && e.twin);
    expect(pool[0].twin).toBe('PARIS');
    expect(fromCapital).toEqual(['PARIS', '~PARIS']);
    // Met France by its flag: "Capital of France" is still a new question.
    expect(usedKeys(cluePool().filter((e) => e.answer === 'FRANCE' && e.flag))).toEqual(['FRANCE']);
  });

  it('stays on the level’s difficulty while it has unused clues, and borrows before it repeats', () => {
    const easy = [...new Set(cluePool().filter((e) => e.tier === 1).map((e) => e.answer))];
    // Half of the easy clues met: still all easy, still all new.
    const half = easy.slice(0, Math.floor(easy.length / 2));
    const p = makePuzzle(1, 5, half);
    expect(p.words.every((w) => w.tier === 1 && !half.includes(w.answer))).toBe(true);
    // Every easy clue met: the next difficulty up, not a repeat.
    const next = makePuzzle(1, 5, easy);
    expect(next.words.every((w) => !easy.includes(w.answer))).toBe(true);
    // Every clue there is met: answers come back rather than the game stopping, the oldest first.
    const all = [...new Set(cluePool().map((e) => e.answer))];
    const late = makePuzzle(30, 5, all);
    expect(late.words.length).toBeGreaterThanOrEqual(levelSpec(30).words - 1);
    const newest = new Set(all.slice(0, Math.ceil(all.length / 4)));
    expect(late.words.some((w) => newest.has(w.answer))).toBe(false);
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
    expect(addSolved(c, false, 100, 5)).toEqual({ level: 2, solved: 1, points: 100, seen: false, at: 5, used: [] });
    expect(addSolved(c, true, 100, 5)).toEqual({ level: 1, solved: 1, points: 100, seen: false, at: 5, used: [] });
    expect(starsFor(0, 1, false)).toBe(3);
    expect(starsFor(0, 2, false)).toBe(2);
    expect(starsFor(1, 0, false)).toBe(2);
    expect(starsFor(2, 0, true)).toBe(1);
  });
  it('reads careers safely, keeps the further one, and seen stays seen', () => {
    expect(cleanXwCareer('nope')).toBeNull();
    expect(cleanXwCareer({ level: -4, solved: 'x', seen: 1 })).toEqual({ level: 1, solved: 0, points: 0, seen: false, at: 0, used: [] });
    const a = { ...newXwCareer(), level: 7, seen: false }, b = { ...newXwCareer(), level: 3, seen: true };
    expect(mergeXwCareer(a, b)).toEqual({ ...a, seen: true });
    expect(mergeXwCareer(null, b)).toEqual(b);
    // Answers met on either device count, newest first, and junk from storage is dropped.
    const c1 = addUsed(addUsed(newXwCareer(), ['NILE']), ['ASIA', 'NILE']);
    expect(c1.used).toEqual(['ASIA', 'NILE']);
    expect(mergeXwCareer({ ...c1, level: 5 }, { ...newXwCareer(), level: 2, used: ['PERU', 'NILE'] })?.used).toEqual(['ASIA', 'NILE', 'PERU']);
    expect(cleanXwCareer({ level: 2, used: ['NILE', 4, '<b>', 'NILE'] })?.used).toEqual(['NILE']);
    expect(cleanXwCareer({ level: 2 })?.used).toEqual([]);
  });
});
