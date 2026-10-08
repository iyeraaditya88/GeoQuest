// Live day & night: where the sun is overhead right now, and a globe shader that lights
// the day side with the satellite image and the night side with city lights.
import * as THREE from 'three';

/**
 * The subsolar point (where the sun is directly overhead) for a moment in time.
 * Standard low-precision solar formulas — accurate to a fraction of a degree, plenty
 * for drawing the terminator.
 */
function subsolarPoint(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = (date.getTime() - start) / 86400000; // day of year (fractional)
  const g = (2 * Math.PI / 365) * (day - 1 + (date.getUTCHours() - 12) / 24); // fractional year (rad)
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g)); // minutes
  const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  let lng = -(utcMin + eqTime - 720) / 4; // 4 minutes per degree; noon at Greenwich ↔ lng 0
  lng = ((lng + 540) % 360) - 180;
  return { lat: (decl * 180) / Math.PI, lng };
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Works in texture (lng/lat) space, so it doesn't care how the globe mesh is oriented.
const FRAG = /* glsl */ `
  #define PI 3.141592653589793
  uniform sampler2D dayTexture;
  uniform sampler2D nightTexture;
  uniform vec2 sunPosition; // lng, lat in degrees
  uniform float uOpacity;
  varying vec2 vUv;

  vec3 dir(vec2 lngLat) {
    float lng = radians(lngLat.x), lat = radians(lngLat.y);
    return vec3(cos(lat) * cos(lng), sin(lat), cos(lat) * sin(lng));
  }

  void main() {
    vec2 here = vec2(vUv.x * 360.0 - 180.0, vUv.y * 180.0 - 90.0);
    float sun = dot(dir(here), dir(sunPosition)); // cos of the sun's zenith angle

    vec3 day = texture2D(dayTexture, vUv).rgb;
    vec3 night = texture2D(nightTexture, vUv).rgb;

    // Day side dims gently toward dusk; night side is city lights over a deep blue.
    day *= 0.6 + 0.4 * smoothstep(0.0, 0.55, sun);
    night = night * 1.45 + vec3(0.006, 0.012, 0.03);

    // Civil → nautical twilight: a soft blend across the terminator.
    float k = smoothstep(-0.11, 0.07, sun);
    vec3 col = mix(night, day, k);

    // A warm glow right along the terminator.
    float band = exp(-pow((sun + 0.015) / 0.04, 2.0));
    col += vec3(0.42, 0.22, 0.08) * band * 0.13;

    // Sunlight you can see: a warm lift across the day side and a soft glare where the
    // sun is high (open ocean is very dark in satellite imagery, so this keeps "day" reading as day).
    float high = max(sun, 0.0);
    col *= 1.0 + 0.18 * pow(high, 3.0);
    col += vec3(1.0, 0.9, 0.7) * (pow(high, 24.0) * 0.1 + pow(high, 260.0) * 0.2);

    gl_FragColor = vec4(col, uOpacity);
    #include <colorspace_fragment>
  }
`;

const loader = new THREE.TextureLoader();
const texCache = new Map<string, { t: THREE.Texture; ready: Promise<void> }>();
/** Load a texture once and share it (colour textures in sRGB; `data` maps like heightfields stay linear). */
export function loadTexture(url: string, data = false) {
  let e = texCache.get(url);
  if (!e) {
    let done!: () => void;
    const ready = new Promise<void>((r) => { done = r; });
    const t = loader.load(url, () => done(), undefined, () => done());
    t.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.anisotropy = 4;
    e = { t, ready };
    texCache.set(url, e);
  }
  return e;
}
const tex = (url: string) => loadTexture(url).t;

export function createDayNightMaterial() {
  const sun = subsolarPoint();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      dayTexture: { value: tex('/textures/earth-blue-marble.jpg') },
      nightTexture: { value: tex('/textures/earth-night.jpg') },
      sunPosition: { value: new THREE.Vector2(sun.lng, sun.lat) },
      uOpacity: { value: 1 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
  return mat;
}

/** Point the material's sun at `date` (call every minute or so). */
export function updateSun(mat: THREE.ShaderMaterial, date = new Date()) {
  const s = subsolarPoint(date);
  (mat.uniforms.sunPosition.value as THREE.Vector2).set(s.lng, s.lat);
  return s;
}
