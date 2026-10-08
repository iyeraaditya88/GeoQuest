// Finished live matches: a short history per player (for "recent matches" and head-to-head
// records). Same private Blob store as the accounts; a local JSON file when running on your machine.
import { readFile, writeFile } from 'node:fs/promises';
import { blobEnabled, readBlobDoc, writeBlob } from './storage.js';

export interface MatchRecord {
  id: string;
  game: string;
  mode?: string;
  host: string;
  at: number;
  players: { name: string; score: number }[];
}

const KEEP = 40;
const localFile = () => process.env.GQ_MATCHES_FILE ?? '.matches.local.json';
const blobPath = (user: string) => `history/${user}.json`;

async function readLocal(): Promise<Record<string, MatchRecord[]>> {
  try { return JSON.parse(await readFile(localFile(), 'utf8')); } catch { return {}; }
}

/** A player's history. `strict`: a failed read throws (before writing), instead of looking empty. */
export async function historyFor(user: string, strict = false): Promise<MatchRecord[]> {
  if (!blobEnabled()) return (await readLocal())[user] ?? [];
  try {
    const doc = await readBlobDoc(blobPath(user));
    return doc ? (JSON.parse(doc.text) as MatchRecord[]) : [];
  } catch (err) {
    if (strict) throw err;
    return [];
  }
}

/** Add a finished match to every player's history (once — repeats are ignored). */
export async function saveMatch(rec: MatchRecord) {
  const local = blobEnabled() ? null : await readLocal();
  for (const { name } of rec.players) {
    const list = local ? local[name] ?? [] : await historyFor(name, true);
    if (list.some((m) => m.id === rec.id)) continue;
    const next = [rec, ...list].slice(0, KEEP);
    if (local) local[name] = next;
    else await writeBlob(blobPath(name), JSON.stringify(next));
  }
  if (local) await writeFile(localFile(), JSON.stringify(local), { mode: 0o600 });
}
