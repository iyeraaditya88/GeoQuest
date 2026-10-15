// Geo Wordle: Wordle, but the word is a country — and its length varies. Six tries; each guess
// must be a real country with the same number of letters. A Daily one (the same for everyone,
// picked from the date like the Daily challenge) and bonus rounds. Pure logic; UI in GeoWordle.
import { BY_CCA3, COUNTRIES, MAPPABLE, type Country } from './data';
import { dailyNumber, dailyPicks } from './daily';
import { nextTarget } from './quiz';

export const TRIES = 6;
export type Mark = 'g' | 'y' | 'x';

/** Just the letters, A–Z: "Côte d'Ivoire" → "COTEDIVOIRE". */
export const letters = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');

/** Answers: one-word countries of 4–9 letters (enough real countries share each length to guess with). */
export const WORDLE_POOL = COUNTRIES
  .filter((c) => c.un && MAPPABLE.has(c.cca3) && /^[A-Za-z]+$/.test(c.name) && c.name.length >= 4 && c.name.length <= 9)
  .map((c) => c.cca3)
  .sort();

/** Every country by its letters (what a typed guess is checked against). */
const BY_LETTERS = new Map<string, Country>();
for (const c of COUNTRIES) if (c.name) { const l = letters(c.name); if (!BY_LETTERS.has(l)) BY_LETTERS.set(l, c); }
/** The country a guess spells, if any. */
export const countryFor = (guess: string) => BY_LETTERS.get(letters(guess)) ?? null;
/** How many real countries have this many letters (shown so players know guesses exist). */
export const countriesOfLength = (n: number) => [...BY_LETTERS.keys()].filter((k) => k.length === n).length;

/** Today's country (the same everywhere for a given date). */
export const dailyWordle = (date: string) => dailyPicks(`wordle-${date}`, WORDLE_POOL, 1).targets[0];
export const wordleNumber = (date: string) => dailyNumber(date);
/** A bonus one (never one you've had recently). */
export const bonusWordle = (not?: string) => nextTarget('wordle', WORDLE_POOL, not);

/** Wordle colouring: green = right place, yellow = in the word elsewhere (counting repeats), grey = not in it. */
export function score(guess: string, answer: string): Mark[] {
  const g = letters(guess), a = letters(answer);
  const out: Mark[] = Array(g.length).fill('x');
  const left = new Map<string, number>();
  for (let i = 0; i < a.length; i++) {
    if (g[i] === a[i]) out[i] = 'g';
    else left.set(a[i], (left.get(a[i]) ?? 0) + 1);
  }
  for (let i = 0; i < g.length; i++) {
    if (out[i] === 'g') continue;
    const n = left.get(g[i]) ?? 0;
    if (n > 0) { out[i] = 'y'; left.set(g[i], n - 1); }
  }
  return out;
}

/** The keyboard's colour for each letter so far (green beats yellow beats grey). */
export function keyStates(rows: { guess: string; marks: Mark[] }[]) {
  const rank: Record<Mark, number> = { x: 0, y: 1, g: 2 };
  const out: Record<string, Mark> = {};
  for (const r of rows) [...letters(r.guess)].forEach((ch, i) => { const m = r.marks[i]; if (!out[ch] || rank[m] > rank[out[ch]]) out[ch] = m; });
  return out;
}

/** Why a guess can't be played, or null if it can. */
export function invalidReason(guess: string, answer: string): string | null {
  const g = letters(guess), len = letters(answer).length;
  if (g.length < len) return `Not enough letters — it’s ${len}.`;
  if (!countryFor(g)) return 'That’s not a country.';
  return null;
}

/** The nudge after three misses: the continent. */
export function wordleHint(answer: string) {
  const c = BY_CCA3.get(answer);
  if (!c) return '';
  const where = c.region === 'Americas' ? (c.subregion === 'South America' ? 'South America' : c.subregion === 'Caribbean' ? 'the Caribbean' : c.subregion === 'Central America' ? 'Central America' : 'North America') : c.region;
  return `Hint: it’s in ${where}.`;
}

/** "GeoQuest Wordle #12 4/6" plus the coloured rows (no letters, no spoilers). */
export function wordleShare(no: number, rows: Mark[][], won: boolean) {
  const sq = (m: Mark) => (m === 'g' ? '🟩' : m === 'y' ? '🟨' : '⬛');
  return `GeoQuest Wordle #${no} ${won ? rows.length : 'X'}/${TRIES}\n${rows.map((r) => r.map(sq).join('')).join('\n')}`;
}
