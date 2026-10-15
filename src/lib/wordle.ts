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

/** Hints are offered after this many guesses; each one uses up a try. */
export const HINT_AFTER = 3;
export const MAX_HINTS = 2;
/** May a hint be taken now? (Always leaves at least one try to use it.) */
export const canHint = (guesses: number, hints: number, won: boolean) =>
  !won && guesses >= HINT_AFTER && hints < MAX_HINTS && TRIES - guesses - hints >= 2;

const people = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} billion` : n >= 1e6 ? `${Math.round(n / 1e6)} million` : `${Math.round(n / 1e3)} thousand`);
/**
 * The hints, in order: where it is (the region), then what it's like (people, neighbours, coast).
 * Clues, never the answer: no name, letters, capital or flag.
 */
export function wordleHints(answer: string): string[] {
  const c = BY_CCA3.get(answer);
  if (!c) return [];
  const region = c.region === 'Americas'
    ? (c.subregion === 'South America' ? 'South America' : c.subregion === 'Caribbean' ? 'the Caribbean' : c.subregion === 'Central America' ? 'Central America' : 'North America')
    : c.subregion === 'Australia and New Zealand' ? 'Oceania' : c.subregion || c.region;
  const n = c.borders.length;
  const land = n === 0 ? 'no land borders' : `${n} land neighbour${n === 1 ? '' : 's'}`;
  const coast = c.landlocked ? 'no coastline' : n === 0 ? 'surrounded by sea' : 'a coastline';
  return [`It’s in ${region}.`, `About ${people(c.population)} people · ${land} · ${coast}.`];
}

// ── Stats (the Daily, on this device) ──
export interface WordleStats { played: number; wins: number; streak: number; best: number; last: string | null; dist: number[] }
export const emptyStats = (): WordleStats => ({ played: 0, wins: 0, streak: 0, best: 0, last: null, dist: Array(TRIES).fill(0) });
/** Add today's Daily to the stats (once per day). `tries` = guesses it took (null = not solved). */
export function addResult(st: WordleStats, date: string, tries: number | null, yesterday: string): WordleStats {
  if (st.last === date) return st;
  const won = tries !== null;
  const streak = won ? (st.last === yesterday ? st.streak + 1 : 1) : 0;
  const dist = [...st.dist];
  if (won) dist[tries! - 1] = (dist[tries! - 1] ?? 0) + 1;
  return { played: st.played + 1, wins: st.wins + (won ? 1 : 0), streak, best: Math.max(st.best, streak), last: date, dist };
}

/** "GeoQuest Wordle #12 4/6 💡1" plus the coloured rows (no letters, no spoilers). */
export function wordleShare(no: number, rows: Mark[][], won: boolean, hints = 0) {
  const sq = (m: Mark) => (m === 'g' ? '🟩' : m === 'y' ? '🟨' : '⬛');
  return `GeoQuest Wordle #${no} ${won ? rows.length : 'X'}/${TRIES}${hints ? ` 💡${hints}` : ''}\n${rows.map((r) => r.map(sq).join('')).join('\n')}`;
}
