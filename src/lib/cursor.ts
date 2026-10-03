// Tiny pub/sub store for the custom cursor, so map hover/drag updates never
// re-render React trees on every mouse move.
export interface CursorCountry { name: string; cca2: string; sub: string }
export interface CursorState {
  country: CursorCountry | null;
  dragging: boolean;
  hideLabel: boolean;
}

const state: CursorState = { country: null, dragging: false, hideLabel: false };
const subs = new Set<() => void>();

export const cursor = {
  get: () => state,
  set(patch: Partial<CursorState>) {
    let changed = false;
    for (const k of Object.keys(patch) as (keyof CursorState)[]) {
      if (state[k] !== patch[k]) { (state as unknown as Record<string, unknown>)[k] = patch[k]; changed = true; }
    }
    if (changed) subs.forEach((f) => f());
  },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
};
