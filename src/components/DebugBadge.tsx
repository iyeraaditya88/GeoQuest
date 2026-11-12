import { useSyncExternalStore } from 'react';
import { debug } from '../lib/debug';

/** While debug mode is on: a small badge with this device's code (to find its reports). Tap to turn it off. */
export function DebugBadge() {
  const on = useSyncExternalStore(debug.subscribe, debug.on);
  if (!on) return null;
  return <button className="debug-badge" onClick={() => debug.toggle()} aria-label="Debug mode is on: tap to turn it off">DEBUG · {debug.code}</button>;
}
