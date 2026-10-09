// "My places": pins you put on the globe — home, family, friends, favourite spots, memories and
// dream trips. Kept with your account (private to you), so they follow you between devices;
// a local copy makes them appear at once.
import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';

export type PlaceKind = 'home' | 'family' | 'friend' | 'favorite' | 'memory' | 'dream';
export interface MyPlace { id: string; lat: number; lng: number; name: string; kind: PlaceKind; note?: string; at: number }

export const KINDS: { id: PlaceKind; emoji: string; label: string; hint: string }[] = [
  { id: 'home', emoji: '🏠', label: 'Home', hint: 'Where you live' },
  { id: 'family', emoji: '💛', label: 'Family', hint: 'Where your people are' },
  { id: 'friend', emoji: '👋', label: 'Friend', hint: 'A friend’s place' },
  { id: 'favorite', emoji: '⭐', label: 'Favourite', hint: 'A spot you love' },
  { id: 'memory', emoji: '📸', label: 'Memory', hint: 'Somewhere that meant something' },
  { id: 'dream', emoji: '✈️', label: 'Dream trip', hint: 'Somewhere you’ll go one day' },
];
export const kindOf = (k: PlaceKind) => KINDS.find((x) => x.id === k) ?? KINDS[3];

const CACHE = 'gq-places';
let places: MyPlace[] = (() => { try { return JSON.parse(localStorage.getItem(CACHE) ?? '[]') as MyPlace[]; } catch { return []; } })();
let loaded = false;
const subs = new Set<() => void>();
const emit = () => { try { localStorage.setItem(CACHE, JSON.stringify(places)); } catch { /* private mode */ } for (const s of subs) s(); };
const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };

function load() {
  if (loaded) return;
  loaded = true;
  void api('/api/places').then((r) => (r.ok ? r.json() : null)).then((d) => { if (Array.isArray(d?.places)) { places = d.places; emit(); } }).catch(() => { loaded = false; });
}

async function save(next: MyPlace[]) {
  const before = places;
  places = next;
  emit(); // optimistic
  const r = await api('/api/places', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ places: next }) }).catch(() => null);
  if (!r?.ok) { places = before; emit(); throw new Error((await r?.json().catch(() => null))?.error ?? 'Couldn’t save — check your connection.'); }
}

export const newPlaceId = () => Math.random().toString(36).slice(2, 12).padEnd(10, '0');

export function usePlaces() {
  useEffect(load, []);
  const list = useSyncExternalStore(subscribe, () => places);
  return {
    places: list,
    home: list.find((p) => p.kind === 'home') ?? null,
    /** Add or update a place (a new Home replaces the old one's Home tag). */
    put: (p: MyPlace) => save([...list.filter((x) => x.id !== p.id).map((x) => (p.kind === 'home' && x.kind === 'home' ? { ...x, kind: 'favorite' as const } : x)), p]),
    remove: (id: string) => save(list.filter((x) => x.id !== id)),
  };
}

const rad = Math.PI / 180;
/** Great-circle distance in km. */
export function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const s = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}
