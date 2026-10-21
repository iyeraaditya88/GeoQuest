// Geo Wordle's daily results: one small document per player per day (written once), holding only
// the coloured marks of each guess — so friends can compare without seeing the country. Private
// Blob store when hosted; a local JSON file on your own machine. Same shape as the map Daily.
import { readFile } from 'node:fs/promises';
import { blobEnabled, listBlobPaths, readBlobDoc, writeBlob, writeLocalFile } from './storage.js';
import { byWordle, validWordle, wordleRow, type WordleResult, type WordleRow } from '../src/lib/wordleResult.js';

const localFile = () => process.env.GQ_WORDLE_FILE ?? '.wordle.local.json';
type Local = { results: Record<string, WordleResult> };
async function readLocal(): Promise<Local> {
  try { const d = JSON.parse(await readFile(localFile(), 'utf8')) as Local; return { results: d.results ?? {} }; } catch { return { results: {} }; }
}
const resultPath = (date: string, user: string) => `wordle/${date}/${user}.json`;
export const ALREADY = 'You’ve already played today’s Geo Wordle — a new country tomorrow!';

export async function getResult(user: string, date: string): Promise<WordleResult | null> {
  if (!blobEnabled()) return (await readLocal()).results[`${date}/${user}`] ?? null;
  const doc = await readBlobDoc(resultPath(date, user)).catch(() => null);
  return doc ? (JSON.parse(doc.text) as WordleResult) : null;
}

/** Record today's game (once). Throws if it isn't a finished game, or was already recorded. */
export async function saveResult(user: string, date: string, rows: unknown, hints: unknown): Promise<WordleResult> {
  if (!validWordle(rows, hints)) throw new Error('Not a finished Geo Wordle.');
  const result: WordleResult = { user, date, rows, hints: hints as number, at: Date.now() };
  if (!blobEnabled()) {
    const d = await readLocal();
    if (d.results[`${date}/${user}`]) throw new Error(ALREADY);
    d.results[`${date}/${user}`] = result;
    await writeLocalFile(localFile(), JSON.stringify(d));
  } else {
    try { await writeBlob(resultPath(date, user), JSON.stringify(result), { overwrite: false }); }
    catch (err) { if (/exist/i.test((err as Error).message)) throw new Error(ALREADY); throw err; }
  }
  remember(result);
  return result;
}

// Today's board, kept for a minute per server (one storage read per result, so not on every view);
// a result just saved goes straight in, and you always see your own row.
const TTL = 60_000;
const boards = new Map<string, { at: number; rows: Promise<WordleRow[]> }>();
export async function board(date: string, now = Date.now()): Promise<WordleRow[]> {
  const hit = boards.get(date);
  if (hit && now - hit.at < TTL) return hit.rows;
  const rows = readBoard(date);
  boards.set(date, { at: now, rows });
  for (const k of boards.keys()) if (k !== date && boards.size > 3) boards.delete(k);
  rows.catch(() => boards.delete(date));
  return rows;
}
export function withRow(rows: WordleRow[], r: WordleResult | null): WordleRow[] {
  if (!r || rows.some((x) => x.name === r.user)) return rows;
  return [...rows, wordleRow(r)].sort(byWordle);
}
function remember(r: WordleResult) {
  const hit = boards.get(r.date);
  if (hit) hit.rows = hit.rows.then((rows) => withRow(rows, r)).catch(() => [wordleRow(r)]);
}
async function readBoard(date: string): Promise<WordleRow[]> {
  let results: WordleResult[];
  if (!blobEnabled()) results = Object.values((await readLocal()).results).filter((r) => r.date === date);
  else {
    const paths = await listBlobPaths(`wordle/${date}/`);
    results = (await Promise.all(paths.slice(0, 200).map((p) => readBlobDoc(p).then((d) => (d ? (JSON.parse(d.text) as WordleResult) : null)).catch(() => null)))).filter((r): r is WordleResult => !!r);
  }
  return results.map(wordleRow).sort(byWordle);
}
