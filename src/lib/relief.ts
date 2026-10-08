// Terrain relief: a hillshade computed on the GPU from the elevation map, draped over the
// globe. Mountains get light and shadow (lit from the north-west, like a printed atlas),
// so ranges read as ranges — not just as a label floating over flat colour.
import * as THREE from 'three';
import type { MapStyle } from '../components/GlobeView';
import { loadTexture } from './daynight';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D heightMap;
  uniform vec2 texel;        // 1 / heightmap size
  uniform float strength;    // overall opacity of the shading
  uniform float exaggerate;  // vertical exaggeration
  uniform vec3 tint;         // colour for high ground (political style)
  uniform float tintAmt;
  uniform vec2 sun;          // lng, lat of the subsolar point (Day/Night)
  uniform float sunOn;
  uniform float fade;        // 0..1 show/hide
  uniform vec3 mtnColor;     // mountain outline colour
  uniform float mtnAmt;      // mountain outline strength
  varying vec2 vUv;

  // A crisp line (in screen pixels) where elevation crosses 'level', plus a soft glow around it.
  vec2 contour(float e, float level, float px) {
    float d = abs(e - level) / max(fwidth(e), 1e-5);
    return vec2(1.0 - smoothstep(0.0, px, d), 1.0 - smoothstep(0.0, px * 5.0, d));
  }

  float h(vec2 uv) { return texture2D(heightMap, uv).r; }
  // Lightly smoothed elevation (9 taps, ~1.5 texels): clean mountain outlines, no speckle.
  float hs(vec2 uv) {
    vec2 o = texel * 1.5;
    return 0.25 * h(uv)
      + 0.125 * (h(uv + vec2(o.x, 0.0)) + h(uv - vec2(o.x, 0.0)) + h(uv + vec2(0.0, o.y)) + h(uv - vec2(0.0, o.y)))
      + 0.0625 * (h(uv + o) + h(uv - o) + h(uv + vec2(o.x, -o.y)) + h(uv + vec2(-o.x, o.y)));
  }
  vec3 dir(vec2 lngLat) {
    float lng = radians(lngLat.x), lat = radians(lngLat.y);
    return vec3(cos(lat) * cos(lng), sin(lat), cos(lat) * sin(lng));
  }

  void main() {
    float lat = radians(vUv.y * 180.0 - 90.0);
    float c = max(cos(lat), 0.2); // a texel spans less ground toward the poles
    float hx = (h(vUv + vec2(texel.x, 0.0)) - h(vUv - vec2(texel.x, 0.0))) / c;
    float hy = (h(vUv + vec2(0.0, texel.y)) - h(vUv - vec2(0.0, texel.y)));
    vec3 n = normalize(vec3(-hx * exaggerate, -hy * exaggerate, 1.0));
    vec3 L = normalize(vec3(-0.65, 0.65, 0.55)); // north-west, 40° up
    float d = dot(n, L) - L.z;                   // + sunlit slope, − shaded slope

    float elev = h(vUv);
    // Only real high ground: plains, plateaus and deserts stay clean, ranges stand out.
    float land = smoothstep(0.07, 0.24, elev);
    float a = clamp(abs(d) * 1.9, 0.0, 1.0) * land;
    vec3 col = d > 0.0 ? vec3(1.0, 0.97, 0.9) : vec3(0.1, 0.075, 0.05);
    a *= d > 0.0 ? 0.4 : 1.0; // shadows carry the form; highlights stay gentle

    // Hypsometric hint: high ground warms slightly (political map only).
    float hi = smoothstep(0.28, 0.7, elev) * tintAmt;
    float outA = a + hi * (1.0 - a);
    vec3 outC = outA > 0.0 ? (col * a + tint * hi * (1.0 - a)) / outA : col;

    // Mountains: a faint outline where land rises into mountains, a brighter one around the high
    // ranges, and a gentle warm wash inside them — drawn from real elevation, so it follows each
    // range's true shape (unlike a line between two points).
    outA *= strength; // the hillshade's own opacity — outlines below keep theirs
    // One outline where land rises into real mountains (Alps, Rockies, Andes, Caucasus,
    // Himalaya, Ethiopian highlands…) with a soft glow, and a light wash inside the high ground.
    float em = hs(vUv);
    vec2 rim = contour(em, 0.26, 1.2);
    float inside = smoothstep(0.25, 0.34, em);
    float wash = inside * (0.13 + 0.08 * smoothstep(0.5, 0.85, em));
    float cA = clamp(rim.x * 0.9 + rim.y * 0.24 + wash, 0.0, 1.0) * mtnAmt;
    float mixA = cA + outA * (1.0 - cA);
    outC = mixA > 0.0 ? (mtnColor * cA + outC * outA * (1.0 - cA)) / mixA : outC;
    outA = mixA;

    // Day/Night: relief is mostly a daytime thing.
    if (sunOn > 0.5) {
      vec2 here = vec2(vUv.x * 360.0 - 180.0, vUv.y * 180.0 - 90.0);
      float s = dot(dir(here), dir(sun));
      outA *= mix(0.25, 1.0, smoothstep(-0.08, 0.12, s));
    }

    gl_FragColor = vec4(outC, outA * fade);
  }
`;

const STYLE: Record<MapStyle, { strength: number; tintAmt: number; mtn: string; mtnAmt: number }> = {
  political: { strength: 0.55, tintAmt: 0.25, mtn: '#9a4a3a', mtnAmt: 0.7 },
  satellite: { strength: 0.42, tintAmt: 0, mtn: '#ffb3c1', mtnAmt: 1 },
  daynight: { strength: 0.45, tintAmt: 0, mtn: '#ffb3c1', mtnAmt: 0.9 },
};

/** A lng/lat grid sphere whose UVs line up with an equirectangular map (independent of three-globe's mesh). */
function gridSphere(radius: number, W = 192, H = 96) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= H; j++) {
    const lat = -90 + (180 * j) / H;
    for (let i = 0; i <= W; i++) {
      const lng = -180 + (360 * i) / W;
      // three-globe's polar2Cartesian convention
      const phi = ((90 - lat) * Math.PI) / 180, theta = ((90 - lng) * Math.PI) / 180;
      pos.push(radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
      uv.push(i / W, j / H);
    }
  }
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const a = j * (W + 1) + i, b = a + 1, c = a + W + 1, d = c + 1;
    idx.push(a, b, c, b, d, c); // counter-clockwise from outside (front faces)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function createReliefLayer(scene: THREE.Scene, R: number) {
  const tex = loadTexture('/textures/earth-topology.png', true).t; // data, not colour (shared with the bump map)
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      heightMap: { value: tex },
      texel: { value: new THREE.Vector2(1 / 2048, 1 / 1024) },
      strength: { value: STYLE.political.strength },
      exaggerate: { value: 24 },
      tint: { value: new THREE.Color('#b08d62') },
      tintAmt: { value: STYLE.political.tintAmt },
      sun: { value: new THREE.Vector2() },
      sunOn: { value: 0 },
      fade: { value: 0 },
      mtnColor: { value: new THREE.Color(STYLE.political.mtn) },
      mtnAmt: { value: STYLE.political.mtnAmt },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(gridSphere(R * 1.002), mat);
  mesh.renderOrder = 1.5; // over the country fills, under borders, rivers and labels
  scene.add(mesh);

  let target = 0, raf = 0;
  const animate = () => {
    const f = mat.uniforms.fade;
    f.value += (target - f.value) * 0.15;
    if (Math.abs(target - f.value) < 0.01) f.value = target;
    mesh.visible = f.value > 0.001;
    raf = f.value !== target ? requestAnimationFrame(animate) : 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(animate); };

  return {
    setStyle(style: MapStyle) {
      const s = STYLE[style];
      mat.uniforms.strength.value = s.strength;
      mat.uniforms.tintAmt.value = s.tintAmt;
      (mat.uniforms.mtnColor.value as THREE.Color).set(s.mtn);
      mat.uniforms.mtnAmt.value = s.mtnAmt;
      mat.uniforms.sunOn.value = style === 'daynight' ? 1 : 0;
    },
    setSun(lng: number, lat: number) { (mat.uniforms.sun.value as THREE.Vector2).set(lng, lat); },
    setVisible(v: boolean) { target = v ? 1 : 0; kick(); },
    dispose() { cancelAnimationFrame(raf); scene.remove(mesh); mesh.geometry.dispose(); mat.dispose(); },
  };
}
