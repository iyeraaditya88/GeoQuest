// Daily challenge results and streaks. One small document per player per day (written once — a
// second attempt is refused), and a streak document per player. Private Blob store when hosted; a
// local JSON file on your own machine.
import { readFile, writeFile } from 'node:fs/promises';
import { blobEnabled, listBlobPaths, readBlobDoc, writeBlob } from './storage.js';
import { addDays, isDate, total, validPoints } from '../src/lib/daily.js';

export interface DailyResult { user: string; date: string; points: number[]; at: number }
export interface Streak { last: string | null; count: number; best: number }

const localFile = () => process.env.GQ_DAILY_FILE ?? '.daily.local.json';
type Local = { results: Record<string, DailyResult>; streaks: Record<string, Streak> };
async function readLocal(): Promise<Local> {
  try { const d = JSON.parse(await readFile(localFile(), 'utf8')) as Local; return { results: d.results ?? {}, streaks: d.streaks ?? {} }; } catch { return { results: {}, streaks: {} }; }
}
const writeLocal = (d: Local) => writeFile(localFile(), JSON.stringify(d), { mode: 0o600 });
const resultPath = (date: string, user: string) => `daily/${date}/${user}.json`;
const streakPath = (user: string) => `streak/${user}.json`;

/** Is `date` a day someone could be playing right now (time zones span about ±1 day)? */
export function playableDate(date: unknown, now = Date.now()): date is string {
  if (!isDate(date)) return false;
  const today = new Date(now).toISOString().slice(0, 10);
  return [addDays(today, -1), today, addDays(today, 1)].includes(date);
}

/** The streak after playing `date`, given the streak before. */
export function nextStreak(prev: Streak, date: string): Streak {
  if (prev.last === date) return prev;
  const count = prev.last === addDays(date, -1) ? prev.count + 1 : 1;
  return { last: date, count, best: Math.max(prev.best, count) };
}
/** The streak as it stands on `today` (broken if they missed yesterday). */
export const currentStreak = (s: Streak, today: string) => ({ count: s.last === today || s.last === addDays(today, -1) ? s.count : 0, best: s.best });

export async function getResult(user: string, date: string): Promise<DailyResult | null> {
  if (!blobEnabled()) return (await readLocal()).results[`${date}/${user}`] ?? null;
  const doc = await readBlobDoc(resultPath(date, user)).catch(() => null);
  return doc ? (JSON.parse(doc.text) as DailyResult) : null;
}

export async function getStreak(user: string): Promise<Streak> {
  const empty = { last: null, count: 0, best: 0 };
  if (!blobEnabled()) return (await readLocal()).streaks[user] ?? empty;
  const doc = await readBlobDoc(streakPath(user)).catch(() => null);
  return doc ? (JSON.parse(doc.text) as Streak) : empty;
}

/** Record today's result (once) and move the streak on. Throws if already played. */
export async function saveResult(user: string, date: string, points: unknown): Promise<{ result: DailyResult; streak: Streak }> {
  if (!validPoints(points)) throw new Error('Not a finished daily challenge.');
  const result: DailyResult = { user, date, points, at: Date.now() };
  const ALREADY = 'You’ve already played today’s challenge — come back tomorrow!';
  if (!blobEnabled()) {
    const d = await readLocal();
    if (d.results[`${date}/${user}`]) throw new Error(ALREADY);
    d.results[`${date}/${user}`] = result;
    d.streaks[user] = nextStreak(d.streaks[user] ?? { last: null, count: 0, best: 0 }, date);
    await writeLocal(d);
    return { result, streak: d.streaks[user] };
  }
  try {
    await writeBlob(resultPath(date, user), JSON.stringify(result), { overwrite: false }); // once per day
  } catch (err) {
    if (/exist/i.test((err as Error).message)) throw new Error(ALREADY);
    throw err;
  }
  const streak = nextStreak(await getStreak(user), date);
  await writeBlob(streakPath(user), JSON.stringify(streak));
  return { result, streak };
}

/** Everyone's results for a day, best first. */
export async function board(date: string): Promise<{ name: string; points: number[]; total: number }[]> {
  let results: DailyResult[];
  if (!blobEnabled()) results = Object.values((await readLocal()).results).filter((r) => r.date === date);
  else {
    const paths = await listBlobPaths(`daily/${date}/`);
    results = (await Promise.all(paths.slice(0, 200).map((p) => readBlobDoc(p).then((d) => (d ? (JSON.parse(d.text) as DailyResult) : null)).catch(() => null)))).filter((r): r is DailyResult => !!r);
  }
  return results.map((r) => ({ name: r.user, points: r.points, total: total(r.points) })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

/** Has this player done the challenge for that date? (for skipping the morning nudge) */
export const played = async (user: string, date: string) => !!(await getResult(user, date));
