// The games a player reached for last, so the sidebar can show theirs first (and the rest
// behind "All games"). Kept on this device only.

const KEY = 'gq-recent-games';
const KEEP = 9;

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

/** A game was opened: it goes to the front. */
export function noteGame(key: string) {
  const list = [key, ...read().filter((k) => k !== key)].slice(0, KEEP);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode: the defaults stay */ }
}

/** The `n` games to show: the most recently opened first, topped up from `fallback` (a newcomer's set). */
export function recentGames(n: number, fallback: readonly string[], known: readonly string[] = fallback): string[] {
  const out: string[] = [];
  for (const k of [...read(), ...fallback]) {
    if (out.length >= n) break;
    if (known.includes(k) && !out.includes(k)) out.push(k);
  }
  return out;
}
