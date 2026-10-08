// Small per-player data: favourite friends, and when someone last used the app ("last seen").
// Private Blob store when hosted (one tiny document per player, so nobody's write can clobber
// anyone else's); a local JSON file on your own machine.
import { readFile, writeFile } from 'node:fs/promises';
import { blobEnabled, readBlobDoc, writeBlob } from './storage.js';

const localFile = () => process.env.GQ_PREFS_FILE ?? '.prefs.local.json';
type Local = Record<string, { favorites?: string[]; seen?: number }>;
const readLocal = async (): Promise<Local> => { try { return JSON.parse(await readFile(localFile(), 'utf8')); } catch { return {}; } };

async function readBlob<T>(path: string): Promise<T | null> {
  try {
    const doc = await readBlobDoc(path);
    return doc ? (JSON.parse(doc.text) as T) : null;
  } catch { return null; } // small, non-critical data: treat a failed read as "not set"
}
const writeJson = (path: string, value: unknown) => writeBlob(path, JSON.stringify(value));

export async function getFavorites(user: string): Promise<string[]> {
  if (!blobEnabled()) return (await readLocal())[user]?.favorites ?? [];
  return (await readBlob<{ favorites: string[] }>(`prefs/${user}.json`))?.favorites ?? [];
}
export async function setFavorites(user: string, favorites: string[]) {
  if (!blobEnabled()) {
    const all = await readLocal();
    all[user] = { ...all[user], favorites };
    await writeFile(localFile(), JSON.stringify(all), { mode: 0o600 });
    return;
  }
  await writeJson(`prefs/${user}.json`, { favorites });
}

// Last seen: written at most every few minutes per player (per server instance).
const SEEN_EVERY = 4 * 60_000;
const lastWrite = new Map<string, number>();
export function touchSeen(user: string) {
  const now = Date.now();
  if (now - (lastWrite.get(user) ?? 0) < SEEN_EVERY) return;
  lastWrite.set(user, now);
  if (!blobEnabled()) return; // locally there's nobody else to see it
  void writeJson(`seen/${user}.json`, { at: now }).catch(() => lastWrite.delete(user));
}
export async function lastSeen(users: string[]): Promise<Record<string, number | null>> {
  if (!blobEnabled()) return Object.fromEntries(users.map((u) => [u, null]));
  const vals = await Promise.all(users.map((u) => readBlob<{ at: number }>(`seen/${u}.json`)));
  return Object.fromEntries(users.map((u, i) => [u, vals[i]?.at ?? null]));
}
