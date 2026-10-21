// A finished Geo Wordle, as it's saved, ranked and shared: only the coloured marks of each guess
// (never the letters), and the hints spent. No country data here, so the server and the link
// preview can use it too.

export const WORDLE_TRIES = 6;
export const WORDLE_HINTS = 2;
export interface WordleResult { user: string; date: string; rows: string[]; hints: number; at: number }
export interface WordleRow { name: string; rows: string[]; hints: number; won: boolean; tries: number; at?: number }

/** Each guess's marks: 'g' right place, 'y' in the word, 'x' not in it ("gyxxg"). */
const ROW = /^[gyx]{3,24}$/;
export const solvedRow = (r: string) => /^g+$/.test(r);

/**
 * A plausible finished game: 1–6 guesses of one length, the hints within the limit, and either
 * solved on the last guess or out of tries (a guess spent per hint).
 */
export function validWordle(rows: unknown, hints: unknown): rows is string[] {
  if (!Array.isArray(rows) || !rows.length || rows.length > WORDLE_TRIES) return false;
  if (!Number.isInteger(hints) || (hints as number) < 0 || (hints as number) > WORDLE_HINTS) return false;
  if (!rows.every((r) => typeof r === 'string' && ROW.test(r) && r.length === rows[0].length)) return false;
  if (rows.length + (hints as number) > WORDLE_TRIES) return false;
  const solvedAt = rows.findIndex(solvedRow);
  if (solvedAt >= 0) return solvedAt === rows.length - 1; // nothing after the winning guess
  return rows.length + (hints as number) === WORDLE_TRIES; // not solved: used every try
}

export const wordleRow = (r: Pick<WordleResult, 'user' | 'rows' | 'hints'> & { at?: number }): WordleRow => {
  const won = r.rows.some(solvedRow);
  return { name: r.user, rows: r.rows, hints: r.hints, won, tries: r.rows.length, at: r.at };
};
/** Best first: solved before not, then fewer guesses, then fewer hints, then whoever finished first. */
export const byWordle = (a: WordleRow, b: WordleRow) =>
  Number(b.won) - Number(a.won) || a.tries - b.tries || a.hints - b.hints || (a.at ?? 0) - (b.at ?? 0) || a.name.localeCompare(b.name);

/** For a share link: "gyxxg.ggxxg" (+ the hints) — and back. */
export const encodeWordle = (rows: string[]) => rows.join('.');
export function decodeWordle(r: unknown, h: unknown): { rows: string[]; hints: number } | null {
  if (typeof r !== 'string' || r.length > 200) return null;
  const rows = r.split('.');
  const hints = h === undefined || h === null || h === '' ? 0 : Number(h);
  return validWordle(rows, hints) ? { rows, hints } : null;
}
/** "4/6", or "X/6" when not solved. */
export const wordleScore = (rows: string[]) => `${rows.some(solvedRow) ? rows.length : 'X'}/${WORDLE_TRIES}`;
