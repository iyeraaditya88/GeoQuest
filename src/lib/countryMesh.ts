// All country fills as ONE mesh and all borders as ONE line set.
//
// three-globe draws every polygon part as its own objects (the 1:50m borders have
// 1,616 parts → ~4,800 draw calls per frame, many of them transparent and re-sorted
// every frame). Merging them collapses that to 2 draw calls; per-country colours
// live in a vertex-colour buffer that we patch in place.
import * as THREE from 'three';
import ConicPolygonGeometry from 'three-conic-polygon-geometry';
import GeoJsonGeometry from 'three-geojson-geometry';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { CountryFeature } from './data';

export type RGBA = [number, number, number, number];

const colorCache = new Map<string, RGBA>();
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
/** Parses '#rrggbb', 'rgb(...)' or 'rgba(...)' into linear 0–1 floats (cached) — three.js works in linear space. */
export function rgba(css: string): RGBA {
  const hit = colorCache.get(css);
  if (hit) return hit;
  let out: RGBA;
  if (css.startsWith('#')) {
    const n = parseInt(css.slice(1), 16);
    out = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
  } else {
    const [r, g, b, a = 1] = css.replace(/[^\d.,]/g, '').split(',').map(Number);
    out = [r / 255, g / 255, b / 255, a];
  }
  out = [toLinear(out[0]), toLinear(out[1]), toLinear(out[2]), out[3]];
  colorCache.set(css, out);
  return out;
}

export interface CountryLayer {
  group: THREE.Group;
  /** Recolour every country. */
  paintAll: (color: (cca3: string | null) => RGBA) => void;
  /** Recolour just these countries (cheap partial GPU upload). */
  paint: (ids: (string | null)[], color: (cca3: string | null) => RGBA) => void;
  /** Border colours: a fine core line over a soft halo that keeps it readable on any terrain. */
  setBorder: (core: string, halo: string) => void;
  dispose: () => void;
}

export function buildCountryLayer(features: CountryFeature[], R: number): CountryLayer {
  const fills: THREE.BufferGeometry[] = [];
  const lines: THREE.BufferGeometry[] = [];
  const ranges = new Map<string | null, [number, number][]>(); // vertex [start, count] per country
  let cursor = 0;

  for (const f of features) {
    const g = f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
    const parts = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    const id = f.properties.cca3;
    for (const coords of parts) {
      const geo = new ConicPolygonGeometry(coords as number[][][], R, R * 1.0045, false, true, false, 6).toNonIndexed();
      geo.clearGroups();
      const count = geo.getAttribute('position').count;
      const list = ranges.get(id) ?? [];
      list.push([cursor, count]);
      ranges.set(id, list);
      cursor += count;
      fills.push(geo);
    }
    if (parts.length) lines.push(new GeoJsonGeometry(g as never, R * 1.0048, 6));
  }

  const fillGeo = mergeGeometries(fills, false)!;
  fills.forEach((g) => g.dispose());
  const colors = new Float32Array(cursor * 4);
  const colorAttr = new THREE.BufferAttribute(colors, 4);
  colorAttr.setUsage(THREE.DynamicDrawUsage);
  fillGeo.setAttribute('color', colorAttr);

  const lineGeo = mergeGeometries(lines.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
  lines.forEach((g) => g.dispose());

  const fillMat = new THREE.MeshLambertMaterial({
    vertexColors: true, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  // Borders in real pixel widths (WebGL's own lines are always a hairline): a soft dark halo
  // underneath and a fine light core on top, so they read over desert, snow and ocean alike.
  const segs = new LineSegmentsGeometry().setPositions(lineGeo.getAttribute('position').array as Float32Array);
  lineGeo.dispose();
  const mat = (width: number) => new LineMaterial({ linewidth: width, transparent: true, depthWrite: false, worldUnits: false });
  const haloMat = mat(3), coreMat = mat(1);
  const halo = new LineSegments2(segs, haloMat);
  const core = new LineSegments2(segs, coreMat);
  const fillMesh = new THREE.Mesh(fillGeo, fillMat);
  fillMesh.renderOrder = 1;
  halo.renderOrder = 2;
  core.renderOrder = 2.1;
  // Finer from far away (borders crowd together), crisper as you zoom in.
  // (LineSegments2 keeps its own resolution in sync; the fills render first, so set widths there.)
  fillMesh.onBeforeRender = (_renderer, _scene, camera) => {
    const alt = camera.position.length() / R - 1;
    const t = Math.max(0, Math.min(1, (1.9 - alt) / 1.5)); // 0 = whole globe, 1 = zoomed in
    coreMat.linewidth = 0.9 + 0.6 * t;
    haloMat.linewidth = 2.4 + 1.4 * t;
  };
  const group = new THREE.Group();
  group.add(fillMesh, halo, core);

  const write = (id: string | null, c: RGBA) => {
    for (const [start, count] of ranges.get(id) ?? []) {
      for (let i = start * 4, end = (start + count) * 4; i < end; i += 4) {
        colors[i] = c[0]; colors[i + 1] = c[1]; colors[i + 2] = c[2]; colors[i + 3] = c[3];
      }
      colorAttr.addUpdateRange(start * 4, count * 4);
    }
  };

  return {
    group,
    paintAll(color) {
      colorAttr.clearUpdateRanges();
      for (const id of ranges.keys()) {
        const c = color(id);
        for (const [start, count] of ranges.get(id)!) {
          for (let i = start * 4, end = (start + count) * 4; i < end; i += 4) {
            colors[i] = c[0]; colors[i + 1] = c[1]; colors[i + 2] = c[2]; colors[i + 3] = c[3];
          }
        }
      }
      colorAttr.needsUpdate = true;
    },
    paint(ids, color) {
      for (const id of new Set(ids)) write(id, color(id));
      colorAttr.needsUpdate = true;
    },
    setBorder(coreCss, haloCss) {
      for (const [m, css] of [[coreMat, coreCss], [haloMat, haloCss]] as const) {
        const [r, g, b, a] = rgba(css);
        m.color.setRGB(r, g, b);
        m.opacity = a;
        m.visible = a > 0;
      }
    },
    dispose() {
      fillGeo.dispose(); segs.dispose(); fillMat.dispose(); haloMat.dispose(); coreMat.dispose();
    },
  };
}
