// The map's markers (battle swords, flags, a voyage's ports and ship) are drawn over the 3D globe,
// so the globe doesn't hide them: zoomed out, one on the far side would float in an odd spot. Each
// marker is tracked here and fades out once it passes over the horizon, and back as it comes round.
import type * as maplibregl from 'maplibre-gl';

const all = new Set<maplibregl.Marker>();

/** Keep this marker hidden while it's on the far side of the globe. */
export const track = <T extends maplibregl.Marker>(mk: T) => { all.add(mk); return mk; };

const R = Math.PI / 180;
/**
 * How far (in degrees of the globe) from the view's centre a marker stays in sight. Two lines, not
 * one: it goes past the farther and comes back inside the nearer, so a marker near the horizon
 * doesn't flicker in and out as someone zooms.
 */
const HIDE_PAST = 80, SHOW_WITHIN = 74;

export function cull(m: maplibregl.Map) {
  const c = m.getCenter();
  for (const mk of all) {
    const el = mk.getElement();
    if (!el.isConnected) { all.delete(mk); continue; }
    const p = mk.getLngLat();
    const cos = Math.sin(c.lat * R) * Math.sin(p.lat * R) + Math.cos(c.lat * R) * Math.cos(p.lat * R) * Math.cos((p.lng - c.lng) * R);
    const deg = Math.acos(Math.max(-1, Math.min(1, cos))) / R;
    const off = el.classList.contains('off-side');
    if (!off && deg > HIDE_PAST) el.classList.add('off-side');
    else if (off && deg < SHOW_WITHIN) el.classList.remove('off-side');
  }
  // Far out (the whole globe in view), the battle markers step back so the map itself leads.
  // (Again two lines apart, so pinching around one zoom doesn't flip it back and forth.)
  const host = m.getContainer(), z = m.getZoom();
  if (z < 2.45) host.classList.add('far');
  else if (z > 2.8) host.classList.remove('far');
}
