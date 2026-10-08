// Small per-player data: favourite friends, and when someone last used the app ("last seen").
// Private Blob store when hosted (one tiny document per player, so nobody's write can clobber
// anyone else's); a local JSON file on your own machine.
import { readFile, writeFile } from 'node:fs/promises';
import { get, put } from '@vercel/blob';

const useBlob = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
const localFile = () => process.env.GQ_PREFS_FILE ?? '.prefs.local.json';
type Local = Record<string, { favorites?: string[]; seen?: number }>;
const readLocal = async (): Promise<Local> => { try { return JSON.parse(await readFile(localFile(), 'utf8')); } catch { return {}; } };

async function readBlob<T>(path: string): Promise<T | null> {
  try {
    const r = await get(path, { access: 'private', useCache: false });
    if (r && r.statusCode === 200) return JSON.parse(await new Response(r.stream).text()) as T;
  } catch { /* not there yet */ }
  return null;
}
const writeBlob = (path: string, value: unknown) =>
  put(path, JSON.stringify(value), { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 0 });

export async function getFavorites(user: string): Promise<string[]> {
  if (!useBlob()) return (await readLocal())[user]?.favorites ?? [];
  return (await readBlob<{ favorites: string[] }>(`prefs/${user}.json`))?.favorites ?? [];
}
export async function setFavorites(user: string, favorites: string[]) {
  if (!useBlob()) {
    const all = await readLocal();
    all[user] = { ...all[user], favorites };
    await writeFile(localFile(), JSON.stringify(all), { mode: 0o600 });
    return;
  }
  await writeBlob(`prefs/${user}.json`, { favorites });
}

// Last seen: written at most every few minutes per player (per server instance).
const SEEN_EVERY = 4 * 60_000;
const lastWrite = new Map<string, number>();
export function touchSeen(user: string) {
  const now = Date.now();
  if (now - (lastWrite.get(user) ?? 0) < SEEN_EVERY) return;
  lastWrite.set(user, now);
  if (!useBlob()) return; // locally there's nobody else to see it
  void writeBlob(`seen/${user}.json`, { at: now }).catch(() => lastWrite.delete(user));
}
export async function lastSeen(users: string[]): Promise<Record<string, number | null>> {
  if (!useBlob()) return Object.fromEntries(users.map((u) => [u, null]));
  const vals = await Promise.all(users.map((u) => readBlob<{ at: number }>(`seen/${u}.json`)));
  return Object.fromEntries(users.map((u, i) => [u, vals[i]?.at ?? null]));
}
