// Touch screens: say "Tap" instead of "Click" in prompts.
export const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(hover: none) and (pointer: coarse)').matches;
export const Click = TOUCH ? 'Tap' : 'Click';
