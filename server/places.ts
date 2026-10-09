// "My places": pins a player puts on the globe (home, friends, favourite spots). Private to that
// player — nobody else can read them. One small document each in the private Blob store; a local
// JSON file on your own machine.
import { readFile, writeFile } from 'node:fs/promises';
import { blobEnabled, readBlobDoc, writeBlob } from './storage.js';

export const KINDS = ['home', 'family', 'friend', 'favorite', 'memory', 'dream'] as const;
export type PlaceKind = (typeof KINDS)[number];
export interface MyPlace { id: string; lat: number; lng: number; name: string; kind: PlaceKind; note?: string; at: number }
export const MAX_PLACES = 100;

const localFile = () => process.env.GQ_PLACES_FILE ?? '.places.local.json';
const path = (user: string) => `places/${user}.json`;
const text = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '');

/** Tidy what the browser sent; drops anything that isn't a sensible pin. */
export function cleanPlaces(list: unknown): MyPlace[] | null {
  if (!Array.isArray(list) || list.length > MAX_PLACES) return null;
  const out: MyPlace[] = [];
  const ids = new Set<string>();
  for (const raw of list) {
    const p = (raw ?? {}) as Record<string, unknown>;
    const lat = Number(p.lat), lng = Number(p.lng);
    const id = typeof p.id === 'string' && /^[a-z0-9]{6,20}$/.test(p.id) ? p.id : null;
    const name = text(p.name, 60);
    if (!id || ids.has(id) || !name || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    ids.add(id);
    const kind = (KINDS as readonly string[]).includes(p.kind as string) ? (p.kind as PlaceKind) : 'favorite';
    const note = text(p.note, 200);
    out.push({ id, lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, name, kind, ...(note ? { note } : {}), at: Number(p.at) || Date.now() });
  }
  // Only one Home.
  if (out.filter((p) => p.kind === 'home').length > 1) return null;
  return out;
}

export async function getPlaces(user: string): Promise<MyPlace[]> {
  if (!blobEnabled()) {
    try { return (JSON.parse(await readFile(localFile(), 'utf8')) as Record<string, MyPlace[]>)[user] ?? []; } catch { return []; }
  }
  const doc = await readBlobDoc(path(user));
  return doc ? ((JSON.parse(doc.text) as { places: MyPlace[] }).places ?? []) : [];
}

export async function setPlaces(user: string, places: MyPlace[]) {
  if (!blobEnabled()) {
    let all: Record<string, MyPlace[]> = {};
    try { all = JSON.parse(await readFile(localFile(), 'utf8')); } catch { /* first one */ }
    all[user] = places;
    await writeFile(localFile(), JSON.stringify(all), { mode: 0o600 });
    return;
  }
  await writeBlob(path(user), JSON.stringify({ places }));
}
