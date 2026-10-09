// The Daily challenge: the same 5 countries for everyone on a given day, picked from the date —
// nothing stored, nothing to sync. Pure functions (no map data), so the server uses them too.

export type DailyTheme = 'find' | 'flag' | 'clue';
export const DAILY_N = 5;
export const MAX_POINTS = 3; // per country: 3 first try, 2 second, 1 third, 0 revealed
const LAUNCH = Date.UTC(2026, 9, 9); // Daily #1

/** A player's local calendar date, YYYY-MM-DD (in their time zone, or a given one). */
export const localDate = (t = Date.now(), timeZone?: string) => new Date(t).toLocaleDateString('en-CA', { timeZone });
export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const dayMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
/** The date `n` days after (or before) another, YYYY-MM-DD. */
export const addDays = (date: string, n: number) => new Date(dayMs(date) + n * 86400_000).toISOString().slice(0, 10);

/** "Daily #42" */
export const dailyNumber = (date: string) => Math.round((dayMs(date) - LAUNCH) / 86400_000) + 1;
/** Find it → Flags → Clues, a different one each day. */
export const themeOf = (date: string): DailyTheme => (['find', 'flag', 'clue'] as const)[((dailyNumber(date) % 3) + 3) % 3];
export const THEME_LABEL: Record<DailyTheme, string> = { find: 'Find it', flag: 'Flags', clue: 'Clues' };

// A small seeded random generator (same seed → same sequence on every device).
function seeded(text: string) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) { h = Math.imul(h ^ text.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Today's countries, from a pool (the same pool on every device), plus a seed for picking clues. */
export function dailyPicks(date: string, pool: readonly string[], n = DAILY_N) {
  const rnd = seeded(`geoquest-daily-${date}`);
  const xs = [...pool].sort();
  for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; }
  return { targets: xs.slice(0, n), pick: (k: number) => Math.floor(seeded(`${date}-${k}`)() * 1e9) };
}

/** Points for one country from the misses before getting it (-1 = revealed). */
export const pointsFor = (misses: number, revealed: boolean) => (revealed ? 0 : Math.max(0, MAX_POINTS - misses));
export const total = (points: number[]) => points.reduce((s, p) => s + p, 0);
export const validPoints = (p: unknown): p is number[] => Array.isArray(p) && p.length === DAILY_N && p.every((x) => Number.isInteger(x) && x >= 0 && x <= MAX_POINTS);

/** "GeoQuest Daily #42 🟩🟩🟨⬛🟩 11/15" — for sharing (no spoilers). */
export function shareLine(date: string, points: number[]) {
  const sq = points.map((p) => (p === 3 ? '🟩' : p === 2 ? '🟨' : p === 1 ? '🟧' : '⬛')).join('');
  return `GeoQuest Daily #${dailyNumber(date)} ${sq} ${total(points)}/${DAILY_N * MAX_POINTS}`;
}
