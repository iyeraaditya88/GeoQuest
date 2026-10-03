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
  varying vec2 vUv;

  float h(vec2 uv) { return texture2D(heightMap, uv).r; }
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

    // Day/Night: relief is mostly a daytime thing.
    if (sunOn > 0.5) {
      vec2 here = vec2(vUv.x * 360.0 - 180.0, vUv.y * 180.0 - 90.0);
      float s = dot(dir(here), dir(sun));
      outA *= mix(0.25, 1.0, smoothstep(-0.08, 0.12, s));
    }

    gl_FragColor = vec4(outC, outA * strength * fade);
  }
`;

const STYLE: Record<MapStyle, { strength: number; tintAmt: number }> = {
  political: { strength: 0.55, tintAmt: 0.25 },
  satellite: { strength: 0.42, tintAmt: 0 },
  daynight: { strength: 0.45, tintAmt: 0 },
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
      mat.uniforms.sunOn.value = style === 'daynight' ? 1 : 0;
    },
    setSun(lng: number, lat: number) { (mat.uniforms.sun.value as THREE.Vector2).set(lng, lat); },
    setVisible(v: boolean) { target = v ? 1 : 0; kick(); },
    dispose() { cancelAnimationFrame(raf); scene.remove(mesh); mesh.geometry.dispose(); mat.dispose(); },
  };
}
