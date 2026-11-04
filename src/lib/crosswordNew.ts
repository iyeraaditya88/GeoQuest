// The blinking "New" tag on Geo Crossword: gone for good once the player has opened the game once.
// Remembered on this device and, signed in, on the account (so a second device doesn't show it).
import { useSyncExternalStore } from 'react';
import { api } from './api';
import { cleanXwCareer } from './crosswordLevels';
import { canUseAccount, getAuth } from './session';

const FLAG = 'gq-xw-seen';
const seenHere = () => { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } };

// Signed in with no note on this device: ask the account first, so the tag never flashes on.
let show = false;
let asked = false;
const subs = new Set<() => void>();
const set = (v: boolean) => { show = v; subs.forEach((f) => f()); };

function check() {
  if (asked || !getAuth().known) return;
  asked = true;
  if (seenHere()) return;
  if (!canUseAccount(getAuth())) { set(true); return; }
  void api('/api/progress').then((r) => (r.ok ? r.json() : null)).then((d) => {
    if (cleanXwCareer(d?.crossword)?.seen) markCrosswordSeen(); else if (!seenHere()) set(true);
  }).catch(() => { if (!seenHere()) set(true); });
}
export function markCrosswordSeen() {
  try { localStorage.setItem(FLAG, '1'); } catch { /* private mode */ }
  asked = true;
  set(false);
}
export function useCrosswordNew(authKnown: boolean) {
  if (authKnown) check();
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => show);
}
