// Finished live matches: a short history per player (for "recent matches" and head-to-head
// records). Same private Blob store as the accounts; a local JSON file when running on your machine.
import { readFile, writeFile } from 'node:fs/promises';
import { get, put } from '@vercel/blob';

export interface MatchRecord {
  id: string;
  game: string;
  mode?: string;
  host: string;
  at: number;
  players: { name: string; score: number }[];
}

const KEEP = 40;
const useBlob = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
const localFile = () => process.env.GQ_MATCHES_FILE ?? '.matches.local.json';
const blobPath = (user: string) => `history/${user}.json`;

async function readLocal(): Promise<Record<string, MatchRecord[]>> {
  try { return JSON.parse(await readFile(localFile(), 'utf8')); } catch { return {}; }
}

export async function historyFor(user: string): Promise<MatchRecord[]> {
  if (!useBlob()) return (await readLocal())[user] ?? [];
  try {
    const r = await get(blobPath(user), { access: 'private', useCache: false });
    if (r && r.statusCode === 200) return JSON.parse(await new Response(r.stream).text()) as MatchRecord[];
  } catch { /* none yet */ }
  return [];
}

/** Add a finished match to every player's history (once — repeats are ignored). */
export async function saveMatch(rec: MatchRecord) {
  const local = useBlob() ? null : await readLocal();
  for (const { name } of rec.players) {
    const list = local ? local[name] ?? [] : await historyFor(name);
    if (list.some((m) => m.id === rec.id)) continue;
    const next = [rec, ...list].slice(0, KEEP);
    if (local) local[name] = next;
    else await put(blobPath(name), JSON.stringify(next), { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 0 });
  }
  if (local) await writeFile(localFile(), JSON.stringify(local), { mode: 0o600 });
}
