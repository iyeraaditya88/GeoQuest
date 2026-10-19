// Touch screens: say "Tap" instead of "Click" in prompts.
export const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(hover: none) and (pointer: coarse)').matches;
export const Click = TOUCH ? 'Tap' : 'Click';

/** A short vibration on phones that support it (Android): right / wrong answers. */
export function buzz(kind: 'good' | 'bad' | 'rival') {
  try { navigator.vibrate?.(kind === 'good' ? [18, 40, 18] : kind === 'rival' ? [30, 60, 30] : 45); } catch { /* not supported */ }
}
