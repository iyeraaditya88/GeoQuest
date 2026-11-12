// What George names, on the map as he says it: places (a dot and a name), rivers (traced along their
// course), and things — a fleet, a gunboat, guns, a treaty — standing where they were or moving from
// one place to another while the sentence lasts. Everything belongs to the clip being told: a new
// clip starts clean, a jump back takes away what hasn't been said yet.
import * as maplibregl from 'maplibre-gl';
import { escapeHtml } from '../../lib/html';
import { PLANE_SVG, SHIP_SVG } from '../../lib/sail';
import { loadNature } from '../../lib/nature';
import type { ItemIcon, Mark } from '../../lib/narrator';
import { track } from './cull';

const SIDE = { a: '#2f6fe8', b: '#dc3b3b' } as const;
const NEUTRAL = '#d9b588';
/** Labelled places kept at once: older ones step back to a quiet dot. */
const KEEP_NAMED = 5;
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

// Top-down vessels, pointing north (turned to their course), in the voyage ship's style.
const STEAMSHIP_SVG = `<div class="ss-turn"><div class="ss-bob"><svg viewBox="0 0 48 56" aria-hidden="true">
  <path class="ss-wake" d="M20 44 C 17 49, 13 53, 9 56 M28 44 C 31 49, 35 53, 39 56"/>
  <g class="st-smoke"><circle cx="24" cy="33" r="2.6"/><circle cx="25" cy="40" r="3.3"/><circle cx="23" cy="48" r="4.2"/></g>
  <path class="st-hull" d="M24 3 C 31 11, 32 30, 29 46 L19 46 C 16 30, 17 11, 24 3 Z"/>
  <rect class="st-deck" x="20.5" y="13" width="7" height="24" rx="2.2"/>
  <circle class="st-funnel" cx="24" cy="25" r="3.3"/>
</svg></div></div>`;
const GALLEY_SVG = `<div class="ss-turn"><div class="ss-bob"><svg viewBox="0 0 48 56" aria-hidden="true">
  <path class="ss-wake" d="M21 46 C 18 50, 15 53, 12 56 M27 46 C 30 50, 33 53, 36 56"/>
  <path class="gl-oar" d="M19 16 L11 14 M19 22 L10 21 M19 28 L10 28 M19 34 L10 35 M20 40 L12 42 M29 16 L37 14 M29 22 L38 21 M29 28 L38 28 M29 34 L38 35 M28 40 L36 42"/>
  <path class="ss-hull" d="M24 2 C 30 12, 30 32, 28 47 L20 47 C 18 32, 18 12, 24 2 Z"/>
  <path class="ss-deck" d="M24 9 C 27 16, 27 30, 26 42 L22 42 C 21 30, 21 16, 24 9 Z"/>
  <path class="ss-sail" d="M15 22 Q 24 27 33 22"/><circle class="ss-mast" cx="24" cy="24" r="1.7"/>
</svg></div></div>`;
const MINI_SHIP = (x: number, y: number, s: number) => `<g transform="translate(${x} ${y}) scale(${s})">
  <path class="ss-hull" d="M24 4 C 32 13, 33 29, 29 44 L19 44 C 15 29, 16 13, 24 4 Z"/>
  <path class="ss-deck" d="M24 10 C 28 17, 29 28, 27 40 L21 40 C 19 28, 20 17, 24 10 Z"/>
  <path class="ss-sail" d="M11 19 Q 24 27 37 19"/><path class="ss-sail" d="M14 31 Q 24 37 34 31"/>
  <circle class="ss-mast" cx="24" cy="22" r="1.8"/></g>`;
const FLEET_SVG = `<div class="ss-turn fleet"><div class="ss-bob"><svg viewBox="0 0 72 64" aria-hidden="true">
  ${MINI_SHIP(19, 0, 0.7)}${MINI_SHIP(0, 20, 0.58)}${MINI_SHIP(44, 20, 0.58)}
</svg></div></div>`;
const VESSELS: Partial<Record<ItemIcon, string>> = { ship: SHIP_SVG, steamship: STEAMSHIP_SVG, galley: GALLEY_SVG, fleet: FLEET_SVG, plane: PLANE_SVG };

// Badges: a glyph on a disc of the side's colour (lucide's drawings where it has one, ISC licence).
const G = (inner: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const GLYPHS: Partial<Record<ItemIcon, string>> = {
  army: G('<path d="m13 19 6-6"/><path d="M14.5 17.5 3.586 6.586A2 2 0 013 5.172V3h2.172a2 2 0 011.414.586L17.5 14.5"/><path d="m14.828 6.172 2.586-2.586A2 2 0 0118.828 3H21v2.172a2 2 0 01-.586 1.414l-2.586 2.586"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/><path d="m5 14 4 4"/><path d="m5 21-2-2"/><path d="M7.5 16.5 4 20"/>'),
  fort: G('<path d="M10 5V3"/><path d="M14 5V3"/><path d="M15 21v-3a3 3 0 0 0-6 0v3"/><path d="M18 3v8"/><path d="M18 5H6"/><path d="M22 11H2"/><path d="M22 9v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9"/><path d="M6 3v8"/>'),
  treaty: G('<path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>'),
  train: G('<path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/><path d="m9 15-1-1"/><path d="m15 15 1-1"/><path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/><path d="m8 19-2 3"/><path d="m16 19 2 3"/>'),
  cargo: G('<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/>'),
  cannon: G('<circle cx="8" cy="16" r="4"/><circle cx="8" cy="16" r="0.8"/><path d="M5.5 12.5 18.6 5.2a1.6 1.6 0 0 1 2.2.6l.3.5a1.6 1.6 0 0 1-.6 2.2L9.5 14.6"/><path d="M3 21h11"/>'),
  cavalry: G('<path d="M7 21h10"/><path d="M8.5 21c0-3 .8-5 2.6-6.6L8.4 13c-1.6-.1-2.6-1.1-2.4-2.4L10.5 5l.8-2.2 1.6 2C16.4 6 19 9.6 18.4 15l-.9 6"/><circle cx="12.6" cy="7.6" r="0.6"/>'),
  tank: G('<rect x="2.5" y="15" width="19" height="5" rx="2.5"/><path d="M6 15v-2.4A1.6 1.6 0 0 1 7.6 11h6.8a1.6 1.6 0 0 1 1.6 1.6V15"/><path d="M16 12.6h6"/>'),
};

const R = Math.PI / 180;
/** The point `t` of the way along the great circle from `a` to `b` ([lat, lng]). */
function along(a: [number, number], b: [number, number], t: number): [number, number] {
  const φ1 = a[0] * R, λ1 = a[1] * R, φ2 = b[0] * R, λ2 = b[1] * R;
  const d = 2 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2));
  if (d < 1e-9) return a;
  const A = Math.sin((1 - t) * d) / Math.sin(d), B = Math.sin(t * d) / Math.sin(d);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return [Math.atan2(z, Math.hypot(x, y)) / R, Math.atan2(y, x) / R];
}
/** Which way is `b` from `a`, degrees clockwise from north. */
function bearing(a: [number, number], b: [number, number]) {
  const φ1 = a[0] * R, φ2 = b[0] * R, Δλ = (b[1] - a[1]) * R;
  return (Math.atan2(Math.sin(Δλ) * Math.cos(φ2), Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)) / R + 360) % 360;
}
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
/** Great-circle distance in radians. */
function arc(a: [number, number], b: [number, number]) {
  const φ1 = a[0] * R, φ2 = b[0] * R;
  return 2 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(((b[1] - a[1]) * R) / 2) ** 2));
}
/** A way through several points: where along it a share `t` of the distance falls, and the heading there. */
function route(pts: [number, number][]) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + arc(pts[i - 1], pts[i]));
  const total = cum[cum.length - 1] || 1;
  const seg = (t: number) => { const d = Math.max(0, Math.min(1, t)) * total; let i = 1; while (i < pts.length - 1 && cum[i] < d) i++; return { i, f: (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1) }; };
  return {
    at(t: number): [number, number] { const { i, f } = seg(t); return along(pts[i - 1], pts[i], f); },
    heading(t: number) { const a = Math.min(t, 0.994); return bearing(this.at(a), this.at(a + 0.006)); },
  };
}
const keyOf = (k: number, i: number) => `${k}:${i}`;

interface Shown { mk: maplibregl.Marker; el: HTMLElement; mark: Mark; k: number; raf?: number; heading?: number }

export const ANNOTATION_SOURCES = { 'ann-rivers': { type: 'geojson', data: EMPTY } } as const;
export const ANNOTATION_LAYERS: maplibregl.LayerSpecification[] = [
  { id: 'ann-river-glow', type: 'line', source: 'ann-rivers', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#7cc8ff', 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 5, 7, 12], 'line-blur': 6, 'line-opacity': 0, 'line-opacity-transition': { duration: 900 } } },
  { id: 'ann-river', type: 'line', source: 'ann-rivers', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#bfe6ff', 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1.6, 7, 3.4], 'line-opacity': 0, 'line-opacity-transition': { duration: 900 } } },
];

export function createAnnotations(m: maplibregl.Map, opts: { calm: () => boolean; onPin: (at: [number, number]) => boolean }) {
  let clip: string | null = null;
  const shown = new Map<string, Shown>();
  let rivers: Extract<Mark, { t: 'river' }>[] = [];

  // A vessel's drawing faces its course on the map, whichever way the camera turns.
  const turn = (s: Shown) => {
    if (s.heading === undefined) return;
    const t = s.el.querySelector<HTMLElement>('.ss-turn');
    if (t) t.style.transform = `rotate(${s.heading - m.getBearing()}deg)`;
  };
  const onRotate = () => { for (const s of shown.values()) turn(s); };
  m.on('rotate', onRotate);

  // Names never sit on top of each other, a battle's marker, or a drawing: where they would, the
  // older one steps back (the sentence being spoken leads). Checked as the camera comes to rest.
  const PAD = 3;
  const hits = (a: DOMRect, b: DOMRect) => a.left < b.right + PAD && b.left < a.right + PAD && a.top < b.bottom + PAD && b.top < a.bottom + PAD;
  let tidyFrame = 0, lastTidy = 0;
  function declutter() {
    tidyFrame = 0;
    lastTidy = performance.now();
    const host = m.getContainer();
    const icons: { r: DOMRect; of: HTMLElement | null }[] = [...host.querySelectorAll<HTMLElement>('.cine-clash, .cine-flag')].map((e) => ({ r: e.getBoundingClientRect(), of: null }));
    // Dots and drawings stay where they are; badges fan out around their spot when it's crowded
    // (the battle's marker, a dot, another badge), taking the first place that's clear.
    for (const s of shown.values()) {
      const icon = s.el.querySelector<HTMLElement>(':scope > i, .ss-turn');
      if (icon) icons.push({ r: icon.getBoundingClientRect(), of: s.el });
    }
    let moved = false;
    const FAN: [number, number][] = [[0, 0], [34, 22], [-34, 22], [34, -24], [-34, -24], [0, 40], [0, -42], [62, 0], [-62, 0]];
    for (const s of [...shown.values()].sort((a, b) => b.k - a.k)) {
      const badge = s.el.querySelector<HTMLElement>(':scope > b');
      if (!badge) continue;
      const dx = Number(s.el.dataset.dx ?? 0), dy = Number(s.el.dataset.dy ?? 0);
      const r0 = badge.getBoundingClientRect();
      const at = (ox: number, oy: number) => new DOMRect(r0.x - dx + ox, r0.y - dy + oy, r0.width, r0.height);
      const [ox, oy] = FAN.find(([x, y]) => !icons.some((i) => i.of !== s.el && hits(i.r, at(x, y)))) ?? [0, 0];
      if (ox !== dx || oy !== dy) moved = true;
      s.el.dataset.dx = String(ox); s.el.dataset.dy = String(oy);
      s.el.style.setProperty('--dx', `${ox}px`); s.el.style.setProperty('--dy', `${oy}px`);
      icons.push({ r: at(ox, oy), of: s.el });
    }
    const placed: DOMRect[] = [];
    const order = [...shown.values()].sort((a, b) => b.k - a.k);
    for (const s of order) {
      const label = s.el.querySelector<HTMLElement>(':scope > span');
      if (!label || s.el.classList.contains('past')) continue;
      const r = label.getBoundingClientRect();
      const blocked = icons.some((x) => x.of !== s.el && hits(x.r, r)) || placed.some((p) => hits(p, r));
      s.el.classList.toggle('hush', blocked);
      if (!blocked) placed.push(r);
    }
    if (moved) window.setTimeout(tidy, 450); // (the names follow their badges there: look again then)
  }
  const tidy = () => { if (!tidyFrame) tidyFrame = requestAnimationFrame(declutter); };
  const tidyMoving = () => { if (performance.now() - lastTidy > 300) tidy(); };
  m.on('moveend', tidy);
  m.on('move', tidyMoving);

  function element(mark: Mark): HTMLElement {
    const el = document.createElement('div');
    if (mark.t === 'place' || mark.t === 'river') {
      const kind = mark.t === 'river' ? 'river' : mark.kind ?? 'city';
      el.className = `cine-place k-${kind}`;
      el.innerHTML = `${kind === 'region' || kind === 'sea' || kind === 'river' ? '' : '<i aria-hidden="true"></i>'}<span>${escapeHtml(mark.name)}</span>`;
    } else if (mark.t === 'item') {
      const c = mark.side ? SIDE[mark.side] : NEUTRAL;
      el.style.setProperty('--c', c);
      const vessel = VESSELS[mark.icon];
      el.className = `cine-item ${vessel ? 'vessel' : 'badge'} i-${mark.icon}`;
      el.innerHTML = `${vessel ?? `<b>${GLYPHS[mark.icon] ?? ''}</b>`}${mark.label ? `<span>${escapeHtml(mark.label)}</span>` : ''}`;
    }
    return el;
  }

  function add(key: string, mark: Mark, k: number, animate: boolean, spanMs: number) {
    if (mark.t === 'person') return;
    const start = mark.t === 'item' ? mark.path?.[0] ?? mark.at : mark.at;
    if (!start) return;
    const el = element(mark);
    // A place where the battle's own marker stands: the marker is its dot, the name steps aside.
    if (mark.t === 'place' && opts.onPin(mark.at)) el.classList.add('by-pin');
    const mk = track(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([start[1], start[0]]).addTo(m));
    const s: Shown = { mk, el, mark, k };
    shown.set(key, s);
    requestAnimationFrame(() => el.classList.add('in'));
    if (mark.t === 'river') showRiver(mark);
    if (mark.t !== 'item' || !mark.path || mark.path.length < 2) return;
    // Along its way (the sea lanes, or up a river, as authored), never across the land.
    const way = route(mark.path);
    const end = mark.path[mark.path.length - 1];
    s.heading = way.heading(1);
    turn(s);
    if (!animate || opts.calm()) { mk.setLngLat([end[1], end[0]]); return; }
    s.heading = way.heading(0);
    turn(s);
    // Under way for most of the sentence, arriving as it ends.
    const dur = Math.max(2600, Math.min(9000, spanMs * 0.92)), t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const p = way.at(ease(t));
      mk.setLngLat([p[1], p[0]]);
      if (t < 0.98) { s.heading = way.heading(ease(t)); turn(s); }
      if (t < 1) s.raf = requestAnimationFrame(step); else el.classList.add('arrived');
    };
    s.raf = requestAnimationFrame(step);
  }

  function drop(key: string) {
    const s = shown.get(key);
    if (!s) return;
    if (s.raf) cancelAnimationFrame(s.raf);
    shown.delete(key);
    s.el.classList.remove('in');
    s.el.classList.add('out');
    window.setTimeout(() => s.mk.remove(), 450);
  }

  async function showRiver(mark: Extract<Mark, { t: 'river' }>) {
    if (rivers.some((r) => r.name === mark.name)) return;
    rivers = [...rivers, mark];
    const want = clip;
    // Its course from the map's own rivers, or (a channel the map doesn't carry) as drawn in the script.
    const nature = rivers.some((r) => r.river) ? await loadNature() : null;
    if (clip !== want) return;
    const features = rivers.flatMap((r): GeoJSON.Feature[] => {
      if (r.line) return [{ type: 'Feature', geometry: { type: 'LineString', coordinates: r.line.map(([la, lo]) => [lo, la]) }, properties: {} }];
      const found = nature?.rivers.find((x) => x.id === r.river);
      return found ? [{ type: 'Feature', geometry: { type: 'MultiLineString', coordinates: found.c }, properties: {} }] : [];
    });
    (m.getSource('ann-rivers') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
    for (const id of ['ann-river-glow', 'ann-river']) if (m.getLayer(id)) m.setPaintProperty(id, 'line-opacity', id === 'ann-river-glow' ? 0.45 : 0.95);
  }
  function hideRivers() {
    rivers = [];
    for (const id of ['ann-river-glow', 'ann-river']) if (m.getLayer(id)) m.setPaintProperty(id, 'line-opacity', 0);
    window.setTimeout(() => { if (!rivers.length) (m.getSource('ann-rivers') as maplibregl.GeoJSONSource | undefined)?.setData(EMPTY); }, 950);
  }

  /** Show what's been said so far in `id` (sentence `k`, which lasts `spanMs`). */
  function update(id: string | null, marks: { k: number; m: Mark }[], k: number, spanMs: number) {
    if (id !== clip) { clear(); clip = id; }
    if (!id) return;
    const want = new Map<string, { k: number; m: Mark }>();
    const at = new Map<number, number>();
    for (const x of marks) { const i = at.get(x.k) ?? 0; at.set(x.k, i + 1); want.set(keyOf(x.k, i), x); }
    for (const key of [...shown.keys()]) if (!want.has(key)) drop(key);
    for (const [key, x] of want) if (!shown.has(key)) add(key, x.m, x.k, x.k === k, spanMs);
    if (!marks.some((x) => x.m.t === 'river') && rivers.length) hideRivers();
    // The places named most recently keep their names; the sentence being spoken leads.
    const places = [...shown.values()].filter((s) => s.mark.t === 'place').sort((a, b) => b.k - a.k);
    places.forEach((s, i) => { s.el.classList.toggle('past', i >= KEEP_NAMED); s.el.classList.toggle('now', s.k === k); });
    window.setTimeout(tidy, 80); // (once the new names have their size)
  }

  function clear() {
    for (const key of [...shown.keys()]) drop(key);
    if (rivers.length) hideRivers();
    clip = null;
  }

  return {
    update,
    clear,
    destroy() { clear(); m.off('rotate', onRotate); m.off('moveend', tidy); m.off('move', tidyMoving); cancelAnimationFrame(tidyFrame); },
  };
}
