// Favourite friends — one shared list (kept on the server, so it follows you between devices),
// used by the Challenge panel and the friends button at the top.
import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';
import { canUseAccount, getAuth } from './session';

let favs: string[] = [];
let loadedFor: string | null = null;
const subs = new Set<() => void>();
const emit = () => { for (const s of subs) s(); };
const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };

function load(me: string) {
  if (loadedFor === me || !canUseAccount(getAuth())) return; // (favourites need an account)
  loadedFor = me;
  void api('/api/favorites', { headers: { 'X-GQ-As': me } }).then((r) => r.json())
    .then((d) => { favs = Array.isArray(d.favorites) ? d.favorites : []; emit(); })
    .catch(() => { loadedFor = null; }); // try again next time
}

export function useFavorites(me: string) {
  useEffect(() => { load(me); }, [me]);
  const list = useSyncExternalStore(subscribe, () => favs);
  const toggle = (name: string) => {
    favs = favs.includes(name) ? favs.filter((f) => f !== name) : [...favs, name];
    emit(); // optimistic
    void api('/api/favorites', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-GQ-As': me }, body: JSON.stringify({ favorites: favs }) }).catch(() => null);
  };
  return { favs: list, toggle };
}
