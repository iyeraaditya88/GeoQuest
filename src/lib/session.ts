// Who's using GeoQuest right now: signed in, or a guest (no account — the hosted site lets anyone
// in). Set from /api/health at start-up; features that need an account check it, and ask the
// person to sign in (a friendly sheet) instead of failing.
import { useSyncExternalStore } from 'react';

export type SignInReason = 'friends' | 'places' | 'daily' | 'reminders' | 'atlas' | 'expired' | 'general';
export interface Auth { known: boolean; hosted: boolean; user: string | null; role: string | null }

let auth: Auth = { known: false, hosted: false, user: null, role: null };
const subs = new Set<() => void>();
const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };

export function setAuth(next: Omit<Auth, 'known'>) {
  if (auth.known && auth.hosted === next.hosted && auth.user === next.user && auth.role === next.role) return;
  auth = { ...next, known: true };
  for (const s of subs) s();
}
export const getAuth = () => auth;
export const useAuth = () => useSyncExternalStore(subscribe, getAuth);
/** On the hosted site without an account. (On your own machine there's no sign-in at all.) */
export const isGuest = (a: Auth = auth) => a.known && a.hosted && !a.user;
/** May this person use account features? (signed in, or running locally) */
export const canUseAccount = (a: Auth = auth) => a.known && (!a.hosted || !!a.user);

/** Ask the person to sign in (or create an account), saying what for. */
export function needSignIn(reason: SignInReason = 'general') {
  window.dispatchEvent(new CustomEvent('gq:signin', { detail: reason }));
}
