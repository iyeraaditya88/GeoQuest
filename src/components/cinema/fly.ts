import * as maplibregl from 'maplibre-gl';

/**
 * maplibre's flyTo, made safe for Safari. Its arc is worked out from how far the camera has to go;
 * a second flight to the same spot a frame after the first (the panel settling as a battle opens
 * re-frames it) leaves that a hair above zero, past maplibre's "already there" check, and on
 * Safari the arc's maths then comes out NaN: the zoom goes with it, the globe fails on every frame,
 * and the map crashes (debug report ecdzw). Close by, a plain glide does the same job.
 */
export function flyTo(m: maplibregl.Map, o: maplibregl.FlyToOptions) {
  const to = maplibregl.LngLat.convert(o.center ?? m.getCenter());
  let here = m.getCenter();
  // (Broken already: start again from where it was going.)
  if (!Number.isFinite(m.getZoom()) || !Number.isFinite(here.lng) || !Number.isFinite(here.lat)) {
    m.stop();
    m.jumpTo({ center: to, zoom: o.zoom ?? 3, pitch: 0, bearing: 0 });
    here = m.getCenter();
  }
  if (Math.abs(here.lng - to.lng) + Math.abs(here.lat - to.lat) < 0.01) {
    const { curve: _c, speed: _s, screenSpeed: _ss, minZoom: _mz, maxDuration: _md, ...glide } = o;
    m.easeTo(glide);
  } else m.flyTo(o);
}
