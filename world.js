/* =====================================================
   Benian Walls — the 3D trail world (three.js)
   Everything here is procedural: terrain, trees, the
   landmark buildings, and the rigged rider (leg IK).
   ===================================================== */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { COIN_GLYPHS } from "./icons.js";

/* ---------- helpers ---------- */
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* value noise + fractal sums for the terrain */
function hash2(ix, iy) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x, y, oct = 4) {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, y * f);
    n += amp; amp *= 0.5; f *= 2.03;
  }
  return s / n;
}
function ridged(x, y, oct = 5) {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    let v = 1 - Math.abs(vnoise(x * f, y * f) * 2 - 1);
    s += amp * v * v;
    n += amp; amp *= 0.5; f *= 2.1;
  }
  return s / n;
}

/* =====================================================
   THE TRAIL — one landmark every SPACING metres
   ===================================================== */

export const SECTION_IDS = ["about", "experience", "projects", "skills", "education", "leadership", "contact"];
const SPACING = 56;
const TRAIL_LEN = SPACING * SECTION_IDS.length;
const LM_AHEAD = 3.5;   // landmark sits a little past where the rider stops
const LM_BACK = 11;     // and this far off the far side of the trail

const trailZ = (x) => 3.2 * Math.sin(x * 0.018) + 1.6 * Math.sin(x * 0.047 + 1.3);
const trailY = (x) => 0.9 * Math.sin(x * 0.03) + 0.5 * Math.sin(x * 0.071 + 2);
const trailSlopeZ = (x) => (trailZ(x + 0.05) - trailZ(x - 0.05)) / 0.1;
const trailSlopeY = (x) => (trailY(x + 0.05) - trailY(x - 0.05)) / 0.1;

const lmX = (i) => (i + 1) * SPACING + LM_AHEAD;
const PADS = SECTION_IDS.map((id, i) => {
  const x = lmX(i);
  return { id, x, z: trailZ(x) - LM_BACK, y: trailY(x), r: id === "education" ? 10 : 8 };
});
const LAKE = (() => {
  const x = lmX(0) + 27;
  return { x, z: trailZ(x) - 27, r: 11, y: trailY(x) - 0.35 };
})();

/* open, level ground for the runway beside the Experience stop */
const AIRFIELD = (() => {
  const p = PADS[1];
  const local = { x0: 6, x1: 44, z: -6 }; // runway, in the landmark's own space
  return { local, y: p.y, x0: p.x + 3, x1: p.x + 47, z0: p.z + local.z - 4.5, z1: p.z + 4.5 };
})();

function terrainHeight(x, z) {
  const d = Math.abs(z - trailZ(x));
  const base = trailY(x);
  const near = smooth(2.4, 14, d);
  const rolling = (fbm(x * 0.035 + 11, z * 0.035 - 7, 3) - 0.35) * 5;
  const hills = fbm(x * 0.012 - 4, z * 0.012 + 2, 3) * 26 * smooth(14, 70, d);
  const far = smooth(28, 190, d);
  const mtn = Math.pow(ridged(x * 0.0055 + 3, z * 0.0055 + 9, 5), 1.5) * 170 * far * far;
  let h = base + near * rolling + hills + mtn;

  for (const p of PADS) {
    const dd = Math.hypot(x - p.x, z - p.z);
    if (dd < p.r + 8) h = lerp(p.y, h, smooth(p.r, p.r + 8, dd));
  }
  const ax = Math.max(AIRFIELD.x0 - x, 0, x - AIRFIELD.x1), az = Math.max(AIRFIELD.z0 - z, 0, z - AIRFIELD.z1);
  if (ax < 4 && az < 4) h = lerp(AIRFIELD.y, h, smooth(0, 4, Math.hypot(ax, az)));
  const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (ld < LAKE.r * 2.6) h = lerp(LAKE.y + 0.5, h, smooth(LAKE.r * 1.1, LAKE.r * 2.6, ld)); // a gentle basin
  if (ld < LAKE.r * 1.6) {
    const bowl = LAKE.y - 1.6 * (1 - smooth(0, LAKE.r, ld));
    h = Math.min(h, lerp(bowl, h, smooth(LAKE.r * 0.8, LAKE.r * 1.55, ld)));
  }
  return h;
}

/* =====================================================
   MATERIAL + MESH KIT
   ===================================================== */

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...opts }));
  }
  return matCache.get(key);
}

function shadowed(mesh, cast = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

/* a box whose y is its bottom edge */
function box(parent, w, h, d, material, x, y, z) {
  const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof material === "string" ? mat(material) : material));
  m.position.set(x, y + h / 2, z);
  parent.add(m);
  return m;
}

/* gable roof: a triangle in XY extruded along Z */
function prism(parent, w, h, d, color, x, y, z) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  const m = shadowed(new THREE.Mesh(g, mat(color)));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
/* stretch a unit-height cylinder between two points */
function placeBetween(mesh, a, b) {
  _v.subVectors(b, a);
  const len = _v.length();
  mesh.position.copy(a).addScaledVector(_v, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, _v.divideScalar(len || 1));
  mesh.scale.set(1, len, 1);
}
function tube(parent, r, material, a, b, seg = 8) {
  const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, seg), typeof material === "string" ? mat(material) : material));
  if (a && b) placeBetween(m, a, b);
  parent.add(m);
  return m;
}

function textTexture(text, { w = 512, h = 112, bg = "#7a5c3e", fg = "#f5ead5", size = 50, font = '"IBM Plex Mono", monospace', weight = 600, radius = 10 } = {}) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  if (bg) {
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(0, 0, w, h, radius);
    g.fill();
  }
  g.fillStyle = fg;
  g.textAlign = "center";
  g.textBaseline = "middle";
  let px = size;
  g.font = `${weight} ${px}px ${font}`;
  while (g.measureText(text).width > w * 0.9 && px > 10) g.font = `${weight} ${--px}px ${font}`;
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* =====================================================
   WORLD
   ===================================================== */

export async function createWorld({ canvas, quality }) {
  const q = quality;

  // canvas text uses the site font — give it a moment to arrive
  try {
    await Promise.race([
      document.fonts.load('600 40px "IBM Plex Mono"'),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch { /* fonts API unavailable: fall back to monospace */ }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !q.bloom, powerPreference: "high-performance" });
  renderer.setPixelRatio(q.dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe3ea, 70, 650);

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 3200);
  const GLOW = glowTexture();

  /* ---------- per-frame animators ---------- */
  const tickers = [];
  const onTick = (fn) => tickers.push(fn);

  /* ---------- shared night-reactive materials ---------- */
  const windowMat = new THREE.MeshStandardMaterial({ color: 0x51626b, emissive: 0xffc766, emissiveIntensity: 0, roughness: 0.25, metalness: 0.1 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff1c9, emissive: 0xffd58a, emissiveIntensity: 0.2 });

  /* =====================================================
     SKY — gradient dome, sun, moon, stars
     ===================================================== */

  const sky = new THREE.Group();
  scene.add(sky);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color() },
      uHor: { value: new THREE.Color() },
      uBot: { value: new THREE.Color(0x1a2a22) },
      uSunCol: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() },
      uSunVis: { value: 1 },
      uHacked: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHor, uBot, uSunCol, uSunDir;
      uniform float uSunVis, uHacked;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(uHor, uTop, pow(clamp(h * 1.6, 1e-4, 1.0), 0.6)) : mix(uHor, uBot, clamp(-h * 5.0, 0.0, 1.0));
        float s = max(dot(d, normalize(uSunDir)), 1e-4);
        col += uSunCol * (smoothstep(0.9986, 0.9992, s) * 6.0 + pow(s, 60.0) * 0.6 + pow(s, 6.0) * 0.14) * uSunVis;
        vec3 hack = vec3(0.0, 0.025, 0.012) + vec3(0.0, 0.12, 0.06) * pow(max(1.0 - abs(h), 1e-4), 12.0);
        col = mix(col, hack, uHacked);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), skyMat);
  skyDome.renderOrder = -10;
  skyDome.userData.noHack = true;
  sky.add(skyDome);

  // stars
  const starGeo = new THREE.BufferGeometry();
  {
    const r = mulberry32(7);
    const n = q.mobile ? 700 : 1400;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = r() * Math.PI * 2;
      const y = 0.04 + Math.pow(r(), 0.8) * 0.96;
      const rr = Math.sqrt(1 - y * y);
      p.set([Math.cos(th) * rr * 1400, y * 1400, Math.sin(th) * rr * 1400], i * 3);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(p, 3));
  }
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -9;
  sky.add(stars);

  // moon
  const MOON_DIR = new THREE.Vector3(0.42, 0.3, -0.86).normalize();
  const moonMat = new THREE.MeshBasicMaterial({ color: 0xf6f1dc, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(26, 24, 16), moonMat);
  moon.position.copy(MOON_DIR).multiplyScalar(1300);
  moon.userData.noHack = true;
  sky.add(moon);
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xbfd0ff, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  moonGlow.scale.setScalar(240);
  moonGlow.position.copy(moon.position);
  sky.add(moonGlow);

  /* ---------- lights ---------- */
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x4a5a3a, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3d6, 2.6);
  sun.castShadow = q.shadows;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 220 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  /* =====================================================
     TERRAIN — one low-poly mesh, rows dense near the trail
     ===================================================== */

  function buildTerrain() {
    const X0 = -280, X1 = TRAIL_LEN + 280;
    const dx = q.mobile ? 4 : 3;
    const cols = Math.ceil((X1 - X0) / dx);
    const offs = [];
    for (let o = 0; o > -560; o -= 0.9 + Math.abs(o) * 0.085) offs.unshift(o);
    for (let o = 0.9; o < 240; o += 0.9 + o * 0.085) offs.push(o);
    const rows = offs.length;

    const H = new Float32Array((cols + 1) * rows);
    const Z = new Float32Array((cols + 1) * rows);
    for (let c = 0; c <= cols; c++) {
      const x = X0 + c * dx;
      const tz = trailZ(x);
      for (let r = 0; r < rows; r++) {
        const z = tz + offs[r];
        Z[c * rows + r] = z;
        H[c * rows + r] = terrainHeight(x, z);
      }
    }

    const triCount = cols * (rows - 1) * 2;
    const pos = new Float32Array(triCount * 9);
    const nor = new Float32Array(triCount * 9);
    const col = new Float32Array(triCount * 9);
    const rnd = mulberry32(42);
    const C = {
      snow: new THREE.Color(0xeef3f6), rockA: new THREE.Color(0x6f7672), rockB: new THREE.Color(0x8b8f87),
      worn: new THREE.Color(0x8f8a55), g1: new THREE.Color(0x5f9443), g2: new THREE.Color(0x4c7d38),
      g3: new THREE.Color(0x7aa64f), fall: new THREE.Color(0x9b8f3e), mud: new THREE.Color(0x6b5a3a),
    };
    const tmp = new THREE.Color();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3();
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
    let k = 0;

    const vtx = (c, r, out) => out.set(X0 + c * dx, H[c * rows + r], Z[c * rows + r]);
    const tri = (c0, r0, c1, r1, c2, r2, dTrail) => {
      vtx(c0, r0, a); vtx(c1, r1, b); vtx(c2, r2, cc);
      e1.subVectors(b, a); e2.subVectors(cc, a);
      n.crossVectors(e1, e2).normalize();
      const cx = (a.x + b.x + cc.x) / 3, cy = (a.y + b.y + cc.y) / 3, cz = (a.z + b.z + cc.z) / 3;
      const hRel = cy - trailY(cx);
      const nz = vnoise(cx * 0.05, cz * 0.05);
      const j = rnd();
      if (Math.hypot(cx - LAKE.x, cz - LAKE.z) < LAKE.r * 1.05) tmp.copy(C.mud);
      else if (hRel > 70 + nz * 26 && n.y > 0.45) tmp.copy(C.snow);
      else if (n.y < 0.72 || hRel > 46 + nz * 16) tmp.copy(C.rockA).lerp(C.rockB, j);
      else if (dTrail < 3.4) tmp.copy(C.worn).lerp(C.g1, j * 0.5);
      else {
        tmp.copy(C.g2).lerp(C.g3, nz);
        if (j > 0.93) tmp.lerp(C.fall, 0.6);
      }
      tmp.multiplyScalar(0.94 + j * 0.1);
      for (const p of [a, b, cc]) {
        pos[k] = p.x; pos[k + 1] = p.y; pos[k + 2] = p.z;
        nor[k] = n.x; nor[k + 1] = n.y; nor[k + 2] = n.z;
        col[k] = tmp.r; col[k + 1] = tmp.g; col[k + 2] = tmp.b;
        k += 3;
      }
    };

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows - 1; r++) {
        const d = Math.min(Math.abs(offs[r]), Math.abs(offs[r + 1]));
        tri(c, r, c, r + 1, c + 1, r, d);
        tri(c + 1, r, c, r + 1, c + 1, r + 1, d);
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    m.receiveShadow = true;
    scene.add(m);
  }

  /* dirt ribbon that follows the trail curve */
  function buildTrail() {
    const step = 0.7, half = 0.9;
    const xs = [];
    for (let x = -80; x <= TRAIL_LEN + 90; x += step) xs.push(x);
    const pos = [], col = [], idx = [];
    const rnd = mulberry32(3);
    const dirt = new THREE.Color(0xb08a5c), edge = new THREE.Color(0x8f7048), tmp = new THREE.Color();
    xs.forEach((x, i) => {
      const s = trailSlopeZ(x);
      const len = Math.hypot(1, s);
      const px = -s / len, pz = 1 / len;
      for (const [o, c] of [[-half, edge], [0, dirt], [half, edge]]) {
        const vx = x + px * o, vz = trailZ(x) + pz * o;
        pos.push(vx, terrainHeight(vx, vz) + 0.05 + (o === 0 ? 0.015 : 0), vz);
        tmp.copy(c).multiplyScalar(0.92 + rnd() * 0.14);
        col.push(tmp.r, tmp.g, tmp.b);
      }
      if (i > 0) {
        const p = (i - 1) * 3, c = i * 3;
        idx.push(p, p + 1, c, c, p + 1, c + 1, p + 1, p + 2, c + 1, c + 1, p + 2, c + 2);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.receiveShadow = true;
    scene.add(m);
  }

  /* =====================================================
     PROPS — instanced trees, rocks, bushes (clickable)
     ===================================================== */

  class PropSet {
    constructor(parts, items, kind) {
      this.items = items;
      this.kind = kind;
      this.anim = new Map(); // instance id -> start time
      this.meshes = parts.map((p) => {
        const m = new THREE.InstancedMesh(p.geo, p.mat, items.length);
        m.castShadow = p.cast !== false;
        m.receiveShadow = true;
        m.userData.pick = { type: kind, set: this };
        if (p.tint) items.forEach((it, i) => m.setColorAt(i, it.color));
        scene.add(m);
        return m;
      });
      items.forEach((_, i) => this.write(i, 0));
      for (const m of this.meshes) {
        m.instanceMatrix.needsUpdate = true;
        m.computeBoundingSphere();
      }
    }
    write(i, t) {
      const it = this.items[i];
      const e = new THREE.Euler(0, it.ry, 0);
      const p = new THREE.Vector3(it.x, it.y, it.z);
      if (t > 0) {
        if (this.kind === "tree") e.z = Math.sin(t * 22) * 0.16 * (1 - t / 0.6);
        else p.y += Math.abs(Math.sin(t * 9)) * 0.9 * (1 - t / 0.6);
      }
      const m4 = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(e), it.scale);
      for (const m of this.meshes) m.setMatrixAt(i, m4);
    }
    poke(i, now) { this.anim.set(i, now); }
    tick(now) {
      if (!this.anim.size) return;
      for (const [i, t0] of this.anim) {
        const t = (now - t0) / 1000;
        if (t > 0.6) { this.write(i, 0); this.anim.delete(i); }
        else this.write(i, t);
      }
      for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
    }
  }

  const props = [];

  function prep(geo, y = 0) {
    const g = geo.toNonIndexed();
    g.translate(0, y, 0);
    return g;
  }

  function buildProps() {
    const r = mulberry32(1234);
    const cell = new Map();
    const free = (x, z, rad) => {
      const k = `${Math.round(x / 2.5)},${Math.round(z / 2.5)}`;
      if (cell.has(k)) return false;
      if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.25 + rad) return false;
      for (const p of PADS) if (Math.hypot(x - p.x, z - p.z) < p.r + rad) return false;
      if (Math.abs(x - (TRAIL_LEN + 11)) < 7 && Math.abs(z - trailZ(x)) < 5) return false; // finish arch
      if (x > -14 && x < 2 && Math.abs(z - trailZ(x)) < 7) return false; // trailhead
      if (x > AIRFIELD.x0 - 2 && x < AIRFIELD.x1 + 2 && z > AIRFIELD.z0 - 3 && z < trailZ(x) - 1.2) return false; // airfield stays open
      cell.set(k, 1);
      return true;
    };

    // trees
    const pines = [], leafy = [];
    const pineCols = [0x2f6b3f, 0x285d38, 0x3a7a47, 0x24543a];
    const leafCols = [0x4f8a3a, 0x5f9a40, 0x6e9f3c, 0xd9822b, 0xe0a32e, 0xc4532a, 0xb8432e, 0xe6b84a];
    const want = q.mobile ? 700 : 1300;
    for (let tries = 0; tries < want * 4 && pines.length + leafy.length < want; tries++) {
      const x = lerp(-240, TRAIL_LEN + 240, r());
      const farSide = r() < 0.84;
      const d = farSide ? 3.6 + Math.pow(r(), 1.7) * 190 : 16 + r() * 110;
      const z = trailZ(x) + (farSide ? -d : d);
      if (!free(x, z, 2.5)) continue;
      const y = terrainHeight(x, z);
      if (y - trailY(x) > 52 - vnoise(x * 0.05, z * 0.05) * 14) continue; // treeline
      const slope = Math.abs(terrainHeight(x + 1, z) - y) + Math.abs(terrainHeight(x, z + 1) - y);
      if (slope > 1.1) continue;
      const s = 0.75 + r() * 0.75;
      const isPine = d > 40 ? r() < 0.8 : r() < 0.35;
      const item = { x, y: y - 0.1, z, ry: r() * 6.28, scale: new THREE.Vector3(s, s * (0.9 + r() * 0.3), s) };
      if (isPine) { item.color = new THREE.Color(pineCols[(r() * 4) | 0]); pines.push(item); }
      else { item.color = new THREE.Color(leafCols[(r() * leafCols.length) | 0]); leafy.push(item); }
    }

    const pineCanopy = mergeGeometries([
      prep(new THREE.ConeGeometry(1.25, 2.0, 7), 2.1),
      prep(new THREE.ConeGeometry(0.98, 1.7, 7), 3.05),
      prep(new THREE.ConeGeometry(0.68, 1.4, 7), 3.9),
    ]);
    const leafCanopy = mergeGeometries([
      prep(new THREE.IcosahedronGeometry(1.55, 0).scale(1, 1.1, 1), 3.3),
      prep(new THREE.IcosahedronGeometry(1.0, 0).translate(0.95, 0, 0.3), 2.7),
      prep(new THREE.IcosahedronGeometry(0.9, 0).translate(-0.85, 0, -0.2), 2.9),
    ]);
    const trunkMat = mat(0x6b4a2e);
    const canopyMat = mat(0xffffff, { roughness: 0.9 });
    props.push(new PropSet([
      { geo: pineCanopy, mat: canopyMat, tint: true },
      { geo: prep(new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6), 0.8), mat: trunkMat },
    ], pines, "tree"));
    props.push(new PropSet([
      { geo: leafCanopy, mat: canopyMat, tint: true },
      { geo: prep(new THREE.CylinderGeometry(0.14, 0.22, 2.6, 6), 1.3), mat: trunkMat },
    ], leafy, "tree"));

    // rocks + bushes hug the trail
    const rocks = [], bushes = [];
    const rockCols = [0x7d8580, 0x6c736e, 0x8e928a];
    for (let i = 0; i < (q.mobile ? 140 : 220); i++) {
      const x = lerp(-60, TRAIL_LEN + 60, r());
      const side = r() < 0.5 ? -1 : 1;
      const d = 1.5 + Math.pow(r(), 2) * (side > 0 ? 4 : 14);
      const z = trailZ(x) + side * d;
      if (!free(x, z, 0.8)) continue;
      const s = side > 0 ? 0.2 + r() * 0.35 : 0.3 + r() * 0.7;
      rocks.push({ x, y: terrainHeight(x, z) - 0.08 * s, z, ry: r() * 6.28, scale: new THREE.Vector3(s * (1 + r() * 0.6), s * (0.6 + r() * 0.5), s), color: new THREE.Color(rockCols[(r() * 3) | 0]) });
    }
    const bushCols = [0x3f7a3a, 0x4a8a3c, 0x356b33, 0x7a8a2e];
    for (let i = 0; i < (q.mobile ? 200 : 360); i++) {
      const x = lerp(-60, TRAIL_LEN + 60, r());
      const side = r() < 0.4 ? 1 : -1;
      const d = 1.9 + r() * (side > 0 ? 3 : 9);
      const z = trailZ(x) + side * d;
      if (!free(x, z, 1)) continue;
      const s = side > 0 ? 0.3 + r() * 0.35 : 0.5 + r() * 0.7;
      bushes.push({ x, y: terrainHeight(x, z) - 0.1, z, ry: r() * 6.28, scale: new THREE.Vector3(s * 1.4, s * 0.75, s * 1.1), color: new THREE.Color(bushCols[(r() * 4) | 0]) });
    }
    props.push(new PropSet([{ geo: prep(new THREE.DodecahedronGeometry(0.6, 0), 0.25), mat: mat(0xffffff), tint: true }], rocks, "rock"));
    props.push(new PropSet([{ geo: prep(new THREE.IcosahedronGeometry(0.7, 0), 0.3), mat: mat(0xffffff), tint: true }], bushes, "tree"));
  }

  /* drifting low-poly clouds */
  const clouds = [];
  function buildClouds() {
    const r = mulberry32(99);
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, emissive: 0xffffff, emissiveIntensity: 0.15 });
    for (let i = 0; i < 14; i++) {
      const parts = [];
      const n = 3 + ((r() * 4) | 0);
      for (let j = 0; j < n; j++) {
        const s = 6 + r() * 7;
        parts.push(prep(new THREE.IcosahedronGeometry(s, 1).scale(1.3, 0.75, 1).translate(j * 8 - n * 4 + r() * 3, r() * 3, r() * 5)));
      }
      const m = new THREE.Mesh(mergeGeometries(parts), cloudMat);
      m.position.set(lerp(-250, TRAIL_LEN + 250, r()), 85 + r() * 50, -220 - r() * 260);
      m.userData.speed = 1 + r() * 1.5;
      scene.add(m);
      clouds.push(m);
    }
  }

  /* =====================================================
     ANIMATED BITS — flags, smoke, glow sprites
     ===================================================== */

  function flag(parent, w, h, color, x, y, z) {
    const g = new THREE.PlaneGeometry(w, h, 12, 4);
    g.translate(w / 2, 0, 0);
    const base = g.attributes.position.array.slice();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 }));
    m.castShadow = true;
    m.position.set(x, y, z);
    parent.add(m);
    const phase = Math.random() * 10;
    onTick((t) => {
      const p = g.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) {
        const bx = base[i];
        p[i + 2] = Math.sin(bx * 2.6 - t * 5 + phase) * 0.16 * (bx / w) + Math.sin(base[i + 1] * 3 + t * 3) * 0.03 * (bx / w);
      }
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
    });
    return m;
  }

  function lamp(parent, x, z, bulb = bulbMat) {
    tube(parent, 0.07, "#2d3436", new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 3.2, z), 6);
    box(parent, 0.5, 0.12, 0.5, "#2d3436", x, 3.2, z);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), bulb);
    b.position.set(x, 3.08, z);
    parent.add(b);
  }

  function windowAt(parent, w, h, x, y, z, frame = "#3d3328", glass = windowMat) {
    box(parent, w + 0.18, h + 0.18, 0.08, frame, x, y - 0.09, z);
    box(parent, w, h, 0.1, glass, x, y, z + 0.02);
  }

  /* =====================================================
     ARRIVAL MOMENTS — each building comes alive for a few
     seconds when the rider arrives or its card opens.
     `live()` is 0..1: how awake a landmark is right now.
     ===================================================== */

  const envelope = (x, attack, hold, release) =>
    x < 0 ? 0 : x < attack ? x / attack : x < attack + hold ? 1 : 1 - smooth(0, release, x - attack - hold);
  const live = (s, id, hold = 5) => Math.max(envelope(s.since(id), 0.3, hold, 1.5), s.openId === id ? 1 : 0);
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

  function smokePuffs(parent, x, y, z, id) {
    const puffs = [];
    const pm = new THREE.MeshStandardMaterial({ color: 0xdedede, transparent: true, opacity: 0.6, roughness: 1, flatShading: true, depthWrite: false });
    for (let i = 0; i < 5; i++) {
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), pm.clone());
      parent.add(p);
      puffs.push(p);
    }
    let phase = 0;
    onTick((t, s) => {
      phase += s.dt * (0.25 + live(s, id) * 0.5);
      puffs.forEach((p, i) => {
        const k = ((phase + i / puffs.length) % 1);
        p.position.set(x + k * 1.6, y + k * 3.4, z - k * 0.4);
        p.scale.setScalar(0.6 + k * 1.8);
        p.material.opacity = 0.55 * (1 - k);
      });
    });
  }

  /* =====================================================
     LANDMARKS — one low-poly building per resume section
     ===================================================== */

  /* About: the porch light and windows come on (and the fish jumps, see buildLake) */
  function buildHouse(g) {
    const glass = windowMat.clone(), porch = bulbMat.clone();
    box(g, 6.4, 3.6, 5, "#efe3c8", 0, 0, 0);
    prism(g, 7.4, 2.6, 5.8, "#a85638", 0, 3.6, 0);
    box(g, 0.7, 2.2, 0.7, "#7a5c3e", 1.8, 4.0, -0.9);
    smokePuffs(g, 1.8, 6.4, -0.9, "about");
    box(g, 1.1, 2.0, 0.12, "#7a5c3e", 0, 0, 2.52);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat("#ffd166", { metalness: 0.6, roughness: 0.3 }));
    knob.position.set(0.35, 1.0, 2.62);
    g.add(knob);
    windowAt(g, 1.2, 1.1, -2.0, 1.4, 2.52, undefined, glass);
    windowAt(g, 1.2, 1.1, 2.0, 1.4, 2.52, undefined, glass);
    const attic = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), glass);
    attic.position.set(0, 4.5, 2.92);
    g.add(attic);
    box(g, 1.8, 0.2, 0.9, "#9c8a6a", 0, 0, 2.9);
    lamp(g, 3.9, 2.8, porch);
    let k = 0;
    onTick((t, s) => {
      k = damp(k, live(s, "about"), 5, s.dt);
      glass.emissiveIntensity = Math.max(s.glow, k * 2.2);
      porch.emissiveIntensity = Math.max(0.2 + s.night * 5, k * 5);
    });
    return 6.7;
  }

  function buildPlane() {
    const plane = new THREE.Group();
    const white = mat("#f4f6f8"), orange = mat("#ff7a3d"), dark = mat("#2d3436");
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 3.4, 4, 10), white);
    body.rotation.z = Math.PI / 2;
    plane.add(body);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 6), white);
    wing.position.set(0.2, -0.1, 0);
    plane.add(wing);
    const tailW = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 2.2), white);
    tailW.position.set(-1.9, 0.15, 0);
    plane.add(tailW);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.08), orange);
    fin.position.set(-1.9, 0.7, 0);
    plane.add(fin);
    const stripe = new THREE.Mesh(new THREE.CapsuleGeometry(0.43, 1.2, 4, 10), orange);
    stripe.rotation.z = Math.PI / 2;
    stripe.scale.set(1, 1, 0.3);
    plane.add(stripe);
    for (const z of [-1.6, 1.6]) {
      const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.8, 8), dark);
      engine.rotation.z = Math.PI / 2;
      engine.position.set(0.45, -0.35, z);
      plane.add(engine);
    }
    for (const [x, z] of [[1.4, 0], [-0.2, -0.9], [-0.2, 0.9]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 8), dark);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, -0.6, z);
      plane.add(wheel);
    }
    const navR = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3344 }));
    navR.position.set(0.2, -0.1, -3);
    const navG = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: 0x33ff88 }));
    navG.position.set(0.2, -0.1, 3);
    plane.add(navR, navG);
    plane.traverse((o) => { o.castShadow = true; });
    return plane;
  }

  /* Experience: a small airport (he interned at the Indianapolis Airport
     Authority). The runway lights chase and the plane takes off. */
  function buildAirport(g) {
    const glass = windowMat.clone();
    // terminal
    box(g, 9, 3.2, 5, "#dfe6ea", -1, 0, 0);
    box(g, 9.5, 0.3, 5.5, "#3d4a52", -1, 3.2, 0);
    for (const x of [-4, -1, 2]) windowAt(g, 2.4, 1.5, x, 0.9, 2.5, "#3d4a52", glass);
    box(g, 9.2, 0.14, 1.3, "#ff7a3d", -1, 2.65, 2.95);
    const signMat = new THREE.MeshStandardMaterial({ map: textTexture("AIRPORT", { bg: "#14231a", fg: "#ffffff", size: 66 }), roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0 });
    signMat.emissiveMap = signMat.map;
    const dark = mat("#14231a");
    const sign = shadowed(new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.9, 0.15), [dark, dark, dark, dark, signMat, dark]));
    sign.position.set(-1, 4.0, 1.6);
    g.add(sign);
    lamp(g, 4.6, 2.8);

    // control tower
    const tx = -7.4, tz = -0.4;
    const shaft = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 8, 10), mat("#c9d3d9")));
    shaft.position.set(tx, 4, tz);
    g.add(shaft);
    const cab = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.25, 1.5, 10), glass));
    cab.position.set(tx, 8.75, tz);
    g.add(cab);
    const cap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.85, 1.85, 0.25, 10), mat("#3d4a52")));
    cap.position.set(tx, 9.62, tz);
    g.add(cap);
    tube(g, 0.05, "#3d4a52", new THREE.Vector3(tx, 9.7, tz), new THREE.Vector3(tx, 11.2, tz), 6);
    const beaconMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x7dffb0, emissiveIntensity: 1 });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), beaconMat);
    beacon.position.set(tx, 11.3, tz);
    g.add(beacon);

    // runway + apron
    const R = AIRFIELD.local; // { x0, x1, z }
    const len = R.x1 - R.x0, mid = (R.x0 + R.x1) / 2;
    const tarmac = mat("#3a3f44", { roughness: 0.95 });
    box(g, len, 0.08, 6, tarmac, mid, 0, R.z).castShadow = false;
    box(g, 7, 0.07, 7.5, tarmac, 6.5, 0, -2.6).castShadow = false;
    const paint = mat("#f4f6f8");
    for (let x = R.x0 + 4; x < R.x1 - 3; x += 4) box(g, 2, 0.02, 0.22, paint, x, 0.08, R.z).castShadow = false;
    for (const x of [R.x0 + 1, R.x1 - 1]) for (let i = -2; i <= 2; i++) box(g, 1.4, 0.02, 0.5, paint, x, 0.08, R.z + i * 1.05).castShadow = false;
    const lights = [];
    for (let x = R.x0; x <= R.x1; x += 3.8) {
      for (const dz of [-3.3, 3.3]) {
        const m = new THREE.MeshStandardMaterial({ color: 0xfff1c9, emissive: 0xffd58a, emissiveIntensity: 0.3 });
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), m);
        l.position.set(x, 0.2, R.z + dz);
        g.add(l);
        lights.push({ m, u: (x - R.x0) / len });
      }
    }
    // windsock
    tube(g, 0.05, "#3d4a52", new THREE.Vector3(R.x0 - 1.5, 0, R.z + 4.6), new THREE.Vector3(R.x0 - 1.5, 3, R.z + 4.6), 6);
    const sock = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.5, 8, 1, true).rotateZ(Math.PI / 2).translate(0.75, 0, 0), mat("#ff7a3d", { side: THREE.DoubleSide }));
    sock.position.set(R.x0 - 1.5, 2.85, R.z + 4.6);
    g.add(sock);

    const plane = buildPlane();
    const PARK = { x: R.x0 + 3.5, y: 0.82 };
    g.add(plane);

    onTick((t, s) => {
      const k = live(s, "experience", 7);
      const since = s.since("experience");
      glass.emissiveIntensity = Math.max(s.glow, k * 1.6);
      signMat.emissiveIntensity = Math.max(s.night * 0.5, k * 0.5);
      beaconMat.emissive.setHex(Math.sin(t * 2.4) > 0 ? 0x7dffb0 : 0xffffff);
      beaconMat.emissiveIntensity = Math.abs(Math.sin(t * 2.4)) > 0.75 ? 4 : 0.3;
      sock.rotation.y = Math.sin(t * 1.3) * 0.25;
      sock.rotation.z = -0.15 + Math.sin(t * 2.1) * 0.06;
      // edge lights: steady at night, a chasing wave during the moment
      for (const l of lights) {
        const wave = Math.max(0, Math.sin((since * 1.4 - l.u) * Math.PI * 2));
        l.m.emissiveIntensity = Math.max(0.3 + s.night * 3.5, since < 6 ? wave * wave * 6 : 0);
      }
      // takeoff roll, rotate, climb out; then a fresh plane taxis in
      const u = since - 0.5;
      if (u < 0 || since > 11) {
        const back = since > 11 ? easeOut((since - 11) / 0.8) : 1;
        plane.visible = true;
        plane.position.set(PARK.x - (1 - back) * 5, PARK.y, R.z);
        plane.rotation.set(0, 0, 0);
        plane.scale.setScalar(back);
      } else if (u < 7.5) {
        const climb = Math.max(0, u - 2.1);
        plane.visible = true;
        plane.scale.setScalar(1);
        plane.position.set(PARK.x + 3.4 * u * u, PARK.y + 1.9 * climb * climb, R.z - climb * climb * 0.5);
        plane.rotation.set(0, 0, smooth(1.7, 2.9, u) * 0.3);
      } else plane.visible = false;
    });
    return 5.2; // label sits over the terminal, not the tower
  }

  /* Projects: the roll-up door opens on the workshop and the gear spins up */
  function buildGarage(g) {
    box(g, 8, 4, 6, "#cdd6c0", 0, 0, 0);
    prism(g, 9, 2.4, 6.6, "#5d7050", 0, 4, 0);
    // workshop interior behind the door
    const glow = new THREE.MeshStandardMaterial({ color: 0x2a2a22, emissive: 0xc8742a, emissiveIntensity: 0.3 });
    box(g, 4.6, 3.3, 0.06, glow, 0, 0, 3.0).castShadow = false;
    box(g, 1.9, 0.9, 0.1, "#3d3328", -1.1, 0, 3.04);
    for (const y of [1.9, 2.5]) box(g, 1.8, 0.07, 0.1, "#3d3328", 1.1, y, 3.04);
    for (const [x, y, c] of [[0.5, 1.97, "#ff7a3d"], [0.95, 1.97, "#2563a8"], [1.5, 1.97, "#ffd166"], [0.7, 2.57, "#5d7050"], [1.4, 2.57, "#ff7a3d"]]) box(g, 0.32, 0.3, 0.1, c, x, y, 3.05);
    const screen = new THREE.MeshStandardMaterial({ color: 0x0b1f14, emissive: 0x41ff9a, emissiveIntensity: 1.2 });
    box(g, 0.8, 0.5, 0.06, screen, -1.1, 1.0, 3.06);
    box(g, 0.5, 1.5, 0.1, "#54644a", 1.4, 0, 3.04);
    // the door hangs from the top of the opening and rolls up
    const door = new THREE.Group();
    door.position.set(0, 3.3, 3.1);
    box(door, 4.6, 3.3, 0.14, "#6b7d5e", 0, -3.3, 0);
    for (let i = 0; i < 6; i++) box(door, 4.6, 0.08, 0.06, "#54644a", 0, -3.1 + i * 0.52, 0.09);
    g.add(door);
    windowAt(g, 0.9, 0.9, -3.2, 2.0, 3.0);
    windowAt(g, 0.9, 0.9, 3.2, 2.0, 3.0);
    // gear on the gable
    const gear = new THREE.Group();
    const gm = mat("#ffd166", { metalness: 0.4, roughness: 0.4 });
    gear.add(shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.17, 6, 16), gm)));
    for (let i = 0; i < 8; i++) {
      const tooth = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.26), gm));
      const a = (i / 8) * Math.PI * 2;
      tooth.position.set(Math.cos(a) * 0.86, Math.sin(a) * 0.86, 0);
      tooth.rotation.z = a;
      gear.add(tooth);
    }
    gear.position.set(0, 4.95, 3.35);
    g.add(gear);
    lamp(g, 4.8, 2.8);
    let k = 0;
    onTick((t, s) => {
      k = damp(k, live(s, "projects"), 3.5, s.dt);
      door.scale.y = 1 - lerp(0.33, 0.9, k); // a third open at rest, rolled right up when live
      glow.emissiveIntensity = 0.3 + s.night * 1.2 + k * 0.45;
      screen.emissiveIntensity = 1.2 + k * 2 * (0.7 + 0.3 * Math.sin(t * 9));
      gear.rotation.z -= s.dt * (0.8 + k * 5);
    });
    return 6.4;
  }

  /* Skills: the sign flickers on and the spare bike's wheels spin */
  function buildGearShop(g) {
    const glass = windowMat.clone();
    box(g, 7, 3.8, 5, "#e8d9bd", 0, 0, 0);
    box(g, 7.4, 0.3, 5.4, "#6b5135", 0, 3.8, 0);
    // striped awning
    for (let i = 0; i < 7; i++) {
      const s = box(g, 1.0, 0.08, 1.5, i % 2 ? "#fff5e6" : "#ff7a3d", -3 + i, 2.75, 3.15);
      s.rotation.x = 0.42;
    }
    windowAt(g, 3.4, 1.6, 0.9, 0.7, 2.52, "#6b5135", glass);
    box(g, 1.1, 2.1, 0.12, "#6b5135", -2.5, 0, 2.52);
    // rooftop sign
    const signMat = new THREE.MeshStandardMaterial({ map: textTexture("GEAR SHOP", { bg: "#ff7a3d", fg: "#ffffff", size: 64 }), roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0 });
    signMat.emissiveMap = signMat.map;
    const signMats = [mat("#c2531a"), mat("#c2531a"), mat("#c2531a"), mat("#c2531a"), signMat, mat("#c2531a")];
    const sign = shadowed(new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.95, 0.15), signMats));
    sign.position.set(0, 4.75, 1.4);
    g.add(sign);
    tube(g, 0.05, "#3d3328", new THREE.Vector3(-1.5, 4.1, 1.35), new THREE.Vector3(-1.5, 4.3, 1.35));
    tube(g, 0.05, "#3d3328", new THREE.Vector3(1.5, 4.1, 1.35), new THREE.Vector3(1.5, 4.3, 1.35));
    // a spare bike on its stand out front
    const spare = buildBike(false);
    spare.group.position.set(-3.9, 0, 3.5);
    spare.group.rotation.set(0, 0.25, 0.12);
    spare.setCrank(1.2);
    g.add(spare.group);
    let k = 0, crank = 1.2;
    onTick((t, s) => {
      const since = s.since("skills");
      k = damp(k, live(s, "skills"), 4, s.dt);
      // neon-style stutter for the first second, then steady
      const stutter = since < 1 ? (Math.sin(since * 46) > -0.2 ? 1 : 0.1) : 1;
      signMat.emissiveIntensity = Math.max(s.night * 0.55, k * 0.75 * stutter);
      glass.emissiveIntensity = Math.max(s.glow, k * 2 * stutter);
      for (const w of spare.wheels) w.rotation.z -= s.dt * k * 14;
      crank += s.dt * k * 6;
      if (k > 0.01) spare.setCrank(crank);
    });
    return 5.4;
  }

  function clockTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const draw = () => {
      const g = c.getContext("2d");
      g.fillStyle = "#fff7e8";
      g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#6e3c2a"; g.lineWidth = 10; g.stroke();
      g.lineCap = "round";
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.lineWidth = i % 3 ? 4 : 8;
        g.beginPath();
        g.moveTo(128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96);
        g.lineTo(128 + Math.sin(a) * 110, 128 - Math.cos(a) * 110);
        g.stroke();
      }
      const now = new Date();
      const hA = ((now.getHours() % 12) + now.getMinutes() / 60) / 12 * Math.PI * 2;
      const mA = now.getMinutes() / 60 * Math.PI * 2;
      g.lineWidth = 12;
      g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(hA) * 58, 128 - Math.cos(hA) * 58); g.stroke();
      g.lineWidth = 7;
      g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(mA) * 88, 128 - Math.cos(mA) * 88); g.stroke();
      g.fillStyle = "#9d2235";
      g.beginPath(); g.arc(128, 128, 10, 0, Math.PI * 2); g.fill();
      tex.needsUpdate = true;
    };
    draw();
    setInterval(draw, 30000);
    return tex;
  }

  /* Education: the clock hands race round, the flag runs up, the windows light */
  function buildSchool(g) {
    const glass = windowMat.clone();
    box(g, 13, 4.6, 6, "#c97f64", 0, 0, 0);
    box(g, 13.4, 0.4, 6.4, "#6e3c2a", 0, 4.6, 0);
    // clock tower
    box(g, 3.2, 4.4, 3.2, "#b56a52", 0, 5.0, 0.6);
    const roof = shadowed(new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.6, 4), mat("#6e3c2a")));
    roof.position.set(0, 10.7, 0.6);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    const face = new THREE.Mesh(new THREE.CircleGeometry(1.05, 32), new THREE.MeshStandardMaterial({ map: clockTexture(), roughness: 0.6, emissive: 0xfff1d0, emissiveIntensity: 0 }));
    face.position.set(0, 7.3, 2.22);
    g.add(face);
    face.material.emissiveMap = face.material.map;
    tube(g, 0.06, "#6e3c2a", new THREE.Vector3(0, 11.8, 0.6), new THREE.Vector3(0, 14.2, 0.6), 6);
    const banner = flag(g, 1.6, 0.9, 0x9d2235, 0.04, 13.7, 0.6);
    let k = 0;
    onTick((t, s) => {
      const since = s.since("education");
      k = damp(k, live(s, "education"), 4, s.dt);
      face.material.emissiveIntensity = Math.max(s.night * 0.5, k * 0.45);
      face.rotation.z = since < 1.8 ? -Math.PI * 4 * easeOut(since / 1.8) : 0;
      banner.position.y = since < 1.6 ? lerp(12.3, 13.7, easeOut((since - 0.2) / 1.2)) : 13.7;
      glass.emissiveIntensity = Math.max(s.glow, k * 2);
    });
    // columned entrance
    prism(g, 4.6, 1.2, 1.6, "#efe6d6", 0, 3.9, 3.7);
    box(g, 4.6, 0.3, 1.6, "#efe6d6", 0, 3.6, 3.7);
    for (const x of [-1.8, -0.6, 0.6, 1.8]) tube(g, 0.2, "#f4ede0", new THREE.Vector3(x, 0, 4.1), new THREE.Vector3(x, 3.6, 4.1), 10);
    box(g, 4.8, 0.25, 2, "#bdb3a2", 0, 0, 3.8);
    box(g, 1.4, 2.4, 0.12, "#5a3526", 0, 0, 3.02);
    for (const x of [-5.3, -3.6, 3.6, 5.3]) {
      windowAt(g, 1.1, 1.1, x, 0.9, 3.02, "#6e3c2a", glass);
      windowAt(g, 1.1, 1.1, x, 2.8, 3.02, "#6e3c2a", glass);
    }
    lamp(g, -7.6, 3.4);
    lamp(g, 7.6, 3.4);
    return 14.5;
  }

  /* Leadership: the campfire flares up and throws sparks */
  function buildLodge(g) {
    box(g, 7.8, 3.9, 5.6, "#8a5d38", 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const log = tube(g, 0.28, i % 2 ? "#9a6b43" : "#8a5d38", new THREE.Vector3(-4.1, 0.28 + i * 0.52, 2.85), new THREE.Vector3(4.1, 0.28 + i * 0.52, 2.85), 7);
      log.receiveShadow = true;
    }
    prism(g, 9.2, 2.7, 6.8, "#5a4330", 0, 3.85, 0);
    box(g, 1.3, 2.3, 0.15, "#3f2d1d", 0.4, 0, 3.15);
    windowAt(g, 1.1, 1.0, -2.4, 1.5, 3.15, "#3f2d1d");
    windowAt(g, 1.1, 1.0, 2.6, 1.5, 3.15, "#3f2d1d");
    tube(g, 0.08, "#5a4330", new THREE.Vector3(5.4, 0, 2.2), new THREE.Vector3(5.4, 9.5, 2.2), 6);
    flag(g, 2.4, 1.4, 0xffd166, 5.45, 8.7, 2.2);

    // campfire: the pack hangs out here after dark
    const fire = new THREE.Group();
    fire.position.set(-6.4, 0, 3.6);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      tube(fire, 0.1, "#5a3a22", new THREE.Vector3(Math.cos(a) * 0.6, 0.1, Math.sin(a) * 0.6), new THREE.Vector3(-Math.cos(a) * 0.6, 0.1, -Math.sin(a) * 0.6), 6);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const st = shadowed(new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), mat("#7d8580")));
      st.position.set(Math.cos(a) * 0.8, 0.08, Math.sin(a) * 0.8);
      fire.add(st);
    }
    const flameMat = new THREE.MeshStandardMaterial({ color: 0xff8a3d, emissive: 0xff6a1d, emissiveIntensity: 2, flatShading: true, transparent: true, opacity: 0.92 });
    const flames = [0, 1, 2].map((i) => {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.28 - i * 0.05, 0.9 - i * 0.15, 5), flameMat);
      f.position.set((i - 1) * 0.15, 0.5, (i % 2) * 0.1);
      fire.add(f);
      return f;
    });
    for (const [x, z, ry] of [[-1.9, 0.4, 0.3], [1.9, 0.2, -0.3]]) {
      const bench = tube(fire, 0.22, "#7a5232", new THREE.Vector3(x, 0.22, z - 0.9), new THREE.Vector3(x, 0.22, z + 0.9), 7);
      bench.rotation.y += ry;
    }
    const fireLight = new THREE.PointLight(0xff8a3d, 0, 16, 1.6);
    fireLight.position.set(0, 1.1, 0);
    fire.add(fireLight);
    g.add(fire);
    // sparks
    const N = 36;
    const sp = { pos: new Float32Array(N * 3), a: new Float32Array(N), size: new Float32Array(N), vel: [], life: new Float32Array(N) };
    for (let i = 0; i < N; i++) sp.vel.push(new THREE.Vector3());
    const spGeo = new THREE.BufferGeometry();
    spGeo.setAttribute("position", new THREE.BufferAttribute(sp.pos, 3));
    spGeo.setAttribute("aAlpha", new THREE.BufferAttribute(sp.a, 1));
    spGeo.setAttribute("aSize", new THREE.BufferAttribute(sp.size, 1));
    const sparks = new THREE.Points(spGeo, new THREE.ShaderMaterial({
      uniforms: { uScale: dustMat.uniforms.uScale, uColor: { value: new THREE.Color(0xffb347) } },
      vertexShader: dustMat.vertexShader, fragmentShader: dustMat.fragmentShader,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    sparks.frustumCulled = false;
    fire.add(sparks);
    let last = 1e9;
    onTick((t, s) => {
      const since = s.since("leadership");
      const flare = envelope(since, 0.15, 1.2, 2.5);
      if (since < last) { // just triggered: throw a burst
        for (let i = 0; i < N; i++) {
          sp.pos.set([(Math.random() - 0.5) * 0.4, 0.5, (Math.random() - 0.5) * 0.4], i * 3);
          sp.vel[i].set((Math.random() - 0.5) * 1.6, 2 + Math.random() * 3.2, (Math.random() - 0.5) * 1.6);
          sp.life[i] = 0.8 + Math.random() * 1.4;
          sp.size[i] = 0.1 + Math.random() * 0.12;
        }
      }
      last = since;
      for (let i = 0; i < N; i++) {
        sp.life[i] -= s.dt;
        sp.vel[i].y -= s.dt * 1.2;
        sp.pos[i * 3] += (sp.vel[i].x + Math.sin(t * 5 + i) * 0.4) * s.dt;
        sp.pos[i * 3 + 1] += sp.vel[i].y * s.dt;
        sp.pos[i * 3 + 2] += sp.vel[i].z * s.dt;
        sp.a[i] = clamp(sp.life[i], 0, 1);
      }
      spGeo.attributes.position.needsUpdate = spGeo.attributes.aAlpha.needsUpdate = spGeo.attributes.aSize.needsUpdate = true;

      const lit = Math.max(0.35, s.night, live(s, "leadership") * 0.8) * (1 + flare * 0.9);
      flames.forEach((f, i) => {
        const k = 0.8 + Math.sin(t * 13 + i * 2) * 0.12 + Math.sin(t * 7.3 + i) * 0.08;
        f.scale.set(lit, k * lit, lit);
      });
      flameMat.emissiveIntensity = 1.5 + s.night * 2.5 + flare * 3;
      fireLight.intensity = Math.max(s.night, flare * 0.9, live(s, "leadership") * 0.4) * (14 + Math.sin(t * 17) * 2.5 + Math.sin(t * 7) * 2);
    });
    return 6.6;
  }

  /* Contact: the flag goes up and a paper plane flies out */
  function buildMailbox(g) {
    const mb = new THREE.Group();
    mb.scale.setScalar(1.9);
    g.add(mb);
    box(mb, 0.28, 2.0, 0.28, "#5a4330", 0, 0, 0);
    const orange = mat("#ff7a3d");
    box(mb, 1.7, 0.6, 0.95, orange, 0, 2.0, 0);
    const top = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.475, 0.475, 1.7, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), orange));
    top.position.set(0, 2.6, 0);
    mb.add(top);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.4), new THREE.MeshStandardMaterial({ map: textTexture("MAIL", { bg: null, fg: "#ffffff", size: 80 }), transparent: true }));
    label.position.set(0, 2.32, 0.485);
    mb.add(label);
    const flagPivot = new THREE.Group();
    flagPivot.position.set(0.5, 2.3, -0.52);
    box(flagPivot, 0.08, 0.9, 0.05, "#9d2235", 0, 0, 0);
    box(flagPivot, 0.4, 0.28, 0.05, "#9d2235", 0.2, 0.62, 0);
    mb.add(flagPivot);
    const dartGeo = new THREE.BufferGeometry();
    dartGeo.setAttribute("position", new THREE.Float32BufferAttribute([
      0.55, 0, 0, -0.4, 0.06, 0.3, -0.4, -0.16, 0,
      0.55, 0, 0, -0.4, -0.16, 0, -0.4, 0.06, -0.3,
    ], 3));
    dartGeo.computeVertexNormals();
    const dart = new THREE.Mesh(dartGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8, flatShading: true, emissive: 0xffffff, emissiveIntensity: 0.25 }));
    dart.castShadow = true;
    dart.visible = false;
    g.add(dart);
    let up = 0;
    onTick((t, s) => {
      up = damp(up, live(s, "contact", 6) > 0.05 ? 1 : 0, 7, s.dt);
      flagPivot.rotation.z = lerp(-1.4, 0, up);
      const u = s.since("contact") - 0.35;
      dart.visible = u > 0 && u < 3.2;
      if (dart.visible) {
        const pos = (v) => new THREE.Vector3(1.7 + 4.2 * v, 4.6 + 2.2 * v - 0.4 * v * v + Math.sin(v * 3.2) * 0.3, 0.9 * v);
        const a = pos(u), b = pos(u + 0.05);
        dart.position.copy(a);
        dart.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), b.sub(a).normalize());
        dart.scale.setScalar(0.9 * Math.min(1, u / 0.25) * (1 - smooth(2.7, 3.2, u)));
      }
    });
    lamp(g, 2.6, 1.2);
    return 6.2;
  }

  const LANDMARK_BUILDERS = {
    about: buildHouse, experience: buildAirport, projects: buildGarage, skills: buildGearShop,
    education: buildSchool, leadership: buildLodge, contact: buildMailbox,
  };

  /* where the camera settles when a landmark's card is open: [position], [look-at], relative to it */
  const LANDMARK_VIEWS = {
    default: { pos: [-1, 5.5, 27], look: [0, 3.2, 0] },
    leadership: { pos: [-4, 5.2, 27], look: [-2.5, 3, 0] }, // keep the campfire in frame
    experience: { pos: [-13, 5.5, 15], look: [22, 4, -6] }, // look down the runway from beside the terminal
    education: { pos: [0, 7.5, 36], look: [0, 5.4, 0] },
    contact: { pos: [3, 4.8, 19], look: [3, 3.8, 0] },
  };
  const landmarks = {};
  function buildLandmarks() {
    for (const p of PADS) {
      const g = new THREE.Group();
      const top = LANDMARK_BUILDERS[p.id](g);
      g.position.set(p.x, p.y - 0.05, p.z);
      g.rotation.y = p.id === "experience" ? 0 : 0.12; // turn a touch toward the approaching rider (the runway stays square)
      g.traverse((o) => { o.userData.pick = { type: "landmark", id: p.id }; });
      scene.add(g);
      landmarks[p.id] = { group: g, anchor: new THREE.Vector3(p.x, p.y + top + 1.4, p.z), hover: 0, label: null, near: false, view: LANDMARK_VIEWS[p.id] ?? LANDMARK_VIEWS.default };
    }
  }

  /* lake, dock, rowboat — and a fish that can't stay in the water */
  function buildLake() {
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(LAKE.r * 1.32, 48),
      new THREE.MeshStandardMaterial({ color: 0x3b7fa6, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.88 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(LAKE.x, LAKE.y, LAKE.z);
    water.receiveShadow = true;
    scene.add(water);

    const dock = new THREE.Group();
    const shore = new THREE.Vector3(LAKE.x - 2, 0, LAKE.z + LAKE.r * 1.1);
    dock.position.set(shore.x, LAKE.y + 0.25, shore.z);
    for (let i = 0; i < 9; i++) box(dock, 1.6, 0.1, 0.55, i % 2 ? "#8a6a48" : "#9a7a52", 0, 0, -i * 0.6);
    for (const z of [0, -2.4, -4.8]) for (const x of [-0.75, 0.75]) box(dock, 0.14, 1.4, 0.14, "#5a4330", x, -1.3, z);
    // fishing rod propped at the end
    tube(dock, 0.025, "#2d3436", new THREE.Vector3(0.4, 0.1, -4.6), new THREE.Vector3(0.9, 2.3, -6.6), 5);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.9, 2.3, -6.6), new THREE.Vector3(1.1, -0.2, -7.6)]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
    );
    dock.add(line);
    const bobber = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat("#ff3b3b"));
    bobber.position.set(1.1, -0.2, -7.6);
    dock.add(bobber);
    scene.add(dock);

    const boat = new THREE.Group();
    const hull = shadowed(new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.75, 3.2, 10, 1, false, Math.PI, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.7, 0.6),
      mat("#c2622a", { side: THREE.DoubleSide })
    ));
    boat.add(hull);
    box(boat, 1.4, 0.08, 0.3, "#8a6a48", 0, -0.1, 0);
    boat.position.set(LAKE.x + 4, LAKE.y + 0.25, LAKE.z - 2);
    boat.rotation.y = 0.6;
    scene.add(boat);

    const fish = new THREE.Group();
    const fishBody = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0).scale(1, 0.45, 0.28), mat("#5f8a6a"));
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.32, 4).rotateZ(Math.PI / 2), mat("#4d7558"));
    tail.position.x = -0.45;
    fish.add(fishBody, tail);
    scene.add(fish);
    onTick((t, s) => {
      const jump = s.since("about") - 0.4;
      const cycle = jump > 0 && jump < 0.84 ? (jump / 0.84) * 0.12 : (t % 7) / 7;
      bobber.position.y = -0.2 + Math.sin(t * 2.2) * 0.04;
      boat.position.y = LAKE.y + 0.25 + Math.sin(t * 1.3) * 0.05;
      boat.rotation.z = Math.sin(t * 1.1) * 0.04;
      if (cycle < 0.12) {
        const k = cycle / 0.12;
        fish.visible = true;
        fish.position.set(LAKE.x - 3 + k * 3, LAKE.y + Math.sin(k * Math.PI) * 1.6 - 0.2, LAKE.z + 2);
        fish.rotation.z = Math.cos(k * Math.PI) * 0.9;
      } else fish.visible = false;
    });
  }

  /* wooden signs: trailhead, mile markers, finish arch */
  const signs = [];
  function signBoard(text, x, z, { w = 2.6, h = 0.55, post = 1.25, id = null, bg = "#7a5c3e" } = {}) {
    const g = new THREE.Group();
    const y = terrainHeight(x, z);
    g.position.set(x, y, z);
    g.rotation.y = -0.18;
    tube(g, 0.07, "#5a4330", new THREE.Vector3(-w * 0.35, -0.1, 0), new THREE.Vector3(-w * 0.35, post + h, 0), 6);
    const front = new THREE.MeshStandardMaterial({ map: textTexture(text, { bg, w: 640, h: 128 }), roughness: 0.8 });
    const wood = mat(bg);
    const b = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), [wood, wood, wood, wood, front, wood]));
    b.position.set(0, post + h / 2, 0.06);
    g.add(b);
    if (id) g.traverse((o) => { o.userData.pick = { type: "sign", id }; });
    scene.add(g);
    signs.push(g);
    return g;
  }

  function buildSigns() {
    const labels = ["MILE 01 · ABOUT", "MILE 02 · EXPERIENCE", "MILE 03 · PROJECTS", "MILE 04 · SKILLS", "MILE 05 · EDUCATION", "MILE 06 · LEADERSHIP", "END OF TRAIL"];
    SECTION_IDS.forEach((id, i) => {
      const x = lmX(i) - 7;
      signBoard(labels[i], x, trailZ(x) + 1.8, { id });
    });
    signBoard("TRAILHEAD", -9, trailZ(-9) - 2.6, { w: 2.2, post: 1.4 });

    // finish arch over the trail
    const ax = TRAIL_LEN + 11;
    const g = new THREE.Group();
    g.position.set(ax, trailY(ax), trailZ(ax));
    g.rotation.y = -Math.atan(trailSlopeZ(ax));
    for (const z of [-2.6, 2.6]) tube(g, 0.16, "#5a4330", new THREE.Vector3(0, 0, z), new THREE.Vector3(0, 4.4, z), 8);
    const front = new THREE.MeshStandardMaterial({ map: textTexture("THANKS FOR RIDING", { bg: "#ff7a3d", fg: "#fff", w: 1024, h: 128, size: 76 }), roughness: 0.7 });
    const wood = mat("#c2531a");
    // the banner faces the approaching rider (-x)
    const banner = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 5.6), [wood, front, wood, wood, wood, wood]));
    banner.position.set(0, 4.0, 0);
    g.add(banner);
    scene.add(g);
  }

  /* =====================================================
     THE RIDER — bike + body, legs driven by two-bone IK
     ===================================================== */

  function buildBike(withRider) {
    const k = 0.34 / 26; // the old SVG's units -> metres
    const P = (x, y, z = 0) => new THREE.Vector3((x - 100) * k, (131 - y) * k, z);
    const frameMat = mat("#ff7a3d", { metalness: 0.35, roughness: 0.45, flatShading: false });
    const dark = mat("#1c1f24", { roughness: 0.9, flatShading: false });
    const steel = mat("#b6bec9", { metalness: 0.7, roughness: 0.35, flatShading: false });

    const group = new THREE.Group();   // sits on the trail at the bottom bracket
    const pivot = new THREE.Group();   // rear contact patch: hops lift the nose about this
    const body = new THREE.Group();
    const rearAxle = P(45, 105), frontAxle = P(155, 105), bb = P(100, 103);
    pivot.position.set(rearAxle.x, 0, 0);
    body.position.set(-rearAxle.x, 0, 0);
    group.add(pivot);
    pivot.add(body);

    // wheels
    const wheels = [rearAxle, frontAxle].map((axle) => {
      const w = new THREE.Group();
      w.position.copy(axle);
      w.add(shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.04, 8, 32), dark)));
      w.add(new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.012, 6, 32), steel));
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.56, 3), steel);
        sp.rotation.z = a;
        sp.position.z = (i % 2 ? 1 : -1) * 0.012;
        w.add(sp);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10), mat("#ff7a3d"));
      hub.rotation.x = Math.PI / 2;
      w.add(hub);
      body.add(w);
      return w;
    });

    // frame
    const seatTop = P(78, 58), headTop = P(142, 52), downTop = P(140, 57);
    tube(body, 0.026, frameMat, bb, seatTop);
    tube(body, 0.03, frameMat, bb, downTop);
    tube(body, 0.024, frameMat, P(78, 60), P(138, 55));
    for (const z of [-0.06, 0.06]) {
      tube(body, 0.016, frameMat, P(100, 103, z * 0.5), P(45, 105, z));
      tube(body, 0.014, frameMat, P(78, 60, 0), P(45, 105, z));
      tube(body, 0.02, dark, P(142, 52, z * 0.4), P(155, 105, z));
    }
    tube(body, 0.034, frameMat, headTop, P(140, 58));
    tube(body, 0.018, dark, seatTop, P(78, 53));
    box(body, 0.28, 0.05, 0.12, dark, P(78, 53).x - 0.02, P(78, 53).y, 0);
    tube(body, 0.02, dark, headTop, P(147, 47));
    const bars = tube(body, 0.016, dark, P(147, 47, -0.34), P(147, 47, 0.34));
    bars.castShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 20), steel);
    ring.position.copy(bb).setZ(0.06);
    body.add(ring);

    // cranks + pedals
    const crank = [1, -1].map((side) => {
      const arm = tube(body, 0.016, steel);
      const pedal = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.09), dark));
      body.add(pedal);
      return { side, arm, pedal };
    });

    // headlight
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff1b8, emissiveIntensity: 0 });
    const lampHead = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.08, 10), lampMat);
    lampHead.rotation.z = Math.PI / 2;
    lampHead.position.copy(P(149, 50)).add(new THREE.Vector3(0.05, 0, 0));
    body.add(lampHead);

    const rider = {};
    if (withRider) {
      const skin = mat("#9c6644", { flatShading: false, roughness: 0.7 });
      const jersey = mat("#2563a8", { flatShading: false, roughness: 0.75 });
      const shorts = mat("#1f2a36", { flatShading: false, roughness: 0.8 });
      const helmetMat = mat("#ff7a3d", { flatShading: false, roughness: 0.4, metalness: 0.1 });
      const hip = P(80, 54.5);
      const shoulder = P(120, 34);
      const R = new THREE.Group();
      body.add(R);
      rider.root = R;

      // torso + pack
      tube(R, 0.13, jersey, hip, shoulder, 12);
      for (const p of [hip, shoulder]) {
        const j = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), jersey));
        j.position.copy(p);
        R.add(j);
      }
      const pack = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.24), mat("#2d3436")));
      pack.position.copy(hip).lerp(shoulder, 0.55).add(new THREE.Vector3(-0.04, 0.13, 0));
      pack.rotation.z = Math.atan2(shoulder.y - hip.y, shoulder.x - hip.x);
      R.add(pack);

      // head + helmet
      const headC = P(133, 25);
      tube(R, 0.05, skin, shoulder.clone().add(new THREE.Vector3(0.04, 0.05, 0)), headC, 8);
      const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), skin));
      head.position.copy(headC);
      R.add(head);
      const helmet = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.128, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), helmetMat));
      helmet.position.copy(headC).add(new THREE.Vector3(-0.01, 0.015, 0));
      helmet.rotation.z = -0.35;
      helmet.scale.set(1.12, 1, 1);
      R.add(helmet);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.015, 0.2), mat("#1c1f24"));
      visor.position.copy(headC).add(new THREE.Vector3(0.12, 0.06, 0));
      visor.rotation.z = -0.25;
      R.add(visor);

      // arms reach to the grips
      for (const side of [1, -1]) {
        const sh = shoulder.clone().setZ(0.17 * side);
        const hand = P(147, 47, 0.3 * side);
        const elbow = sh.clone().lerp(hand, 0.5).add(new THREE.Vector3(-0.03, -0.08, 0.05 * side));
        tube(R, 0.055, jersey, sh, sh.clone().lerp(elbow, 0.55), 8);
        tube(R, 0.045, skin, sh.clone().lerp(elbow, 0.5), elbow, 8);
        tube(R, 0.04, skin, elbow, hand, 8);
        const glove = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat("#1c1f24")));
        glove.position.copy(hand);
        R.add(glove);
      }

      // legs (posed every frame)
      rider.legs = [1, -1].map((side) => ({
        side,
        hip: hip.clone().setZ(0.1 * side),
        thigh: tube(R, 0.07, shorts, null, null, 10),
        shin: tube(R, 0.052, skin, null, null, 10),
        knee: R.add(shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), skin))).children.at(-1),
        shoe: R.add(shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.07, 0.09), mat("#1c1f24")))).children.at(-1),
      }));
    }

    const THIGH = 0.47, SHIN = 0.445, CR = 0.17;
    const knee2 = new THREE.Vector2();
    function solveKnee(hx, hy, fx, fy) {
      let dx = fx - hx, dy = fy - hy;
      let d = Math.hypot(dx, dy);
      d = clamp(d, Math.abs(THIGH - SHIN) + 0.01, THIGH + SHIN - 0.01);
      const a = (THIGH * THIGH - SHIN * SHIN + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, THIGH * THIGH - a * a));
      const ux = dx / Math.hypot(dx, dy), uy = dy / Math.hypot(dx, dy);
      const k1x = hx + a * ux - h * uy, k1y = hy + a * uy + h * ux;
      const k2x = hx + a * ux + h * uy, k2y = hy + a * uy - h * ux;
      return k1x > k2x ? knee2.set(k1x, k1y) : knee2.set(k2x, k2y);
    }

    const foot = new THREE.Vector3(), knee = new THREE.Vector3();
    function setCrank(angle) {
      for (const c of crank) {
        const a = -angle + (c.side < 0 ? Math.PI : 0);
        foot.set(bb.x + Math.cos(a) * CR, bb.y + Math.sin(a) * CR, 0.15 * c.side);
        placeBetween(c.arm, bb.clone().setZ(0.09 * c.side), foot);
        c.pedal.position.copy(foot);
        if (rider.legs) {
          const leg = rider.legs.find((l) => l.side === c.side);
          const kk = solveKnee(leg.hip.x, leg.hip.y, foot.x, foot.y);
          knee.set(kk.x, kk.y, 0.12 * c.side);
          placeBetween(leg.thigh, leg.hip, knee);
          placeBetween(leg.shin, knee, foot.clone().add(new THREE.Vector3(0, 0.04, 0)));
          leg.knee.position.copy(knee);
          leg.shoe.position.copy(foot).add(new THREE.Vector3(0.02, 0.045, 0));
        }
      }
    }
    setCrank(0);

    return { group, pivot, body, wheels, setCrank, lampMat, lampPos: lampHead.position, rider };
  }

  /* the hero bike + headlight + hit box */
  const bike = buildBike(true);
  bike.group.scale.setScalar(1.25); // a little heroic scale so the rider reads at a distance
  scene.add(bike.group);
  const hitBox = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.9, 0.9), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
  hitBox.position.set(0, 0.95, 0);
  hitBox.userData.pick = { type: "biker" };
  hitBox.userData.noHack = true;
  bike.group.add(hitBox);

  const headlight = new THREE.SpotLight(0xfff1c4, 0, 38, 0.42, 0.6, 1.1);
  headlight.position.copy(bike.lampPos);
  headlight.target.position.copy(bike.lampPos).add(new THREE.Vector3(10, -1.4, 0));
  bike.body.add(headlight, headlight.target);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: `varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uOpacity; varying float vY; void main(){ gl_FragColor = vec4(1.0, 0.95, 0.75, vY * vY * vY * uOpacity); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1.5, 6, 20, 1, true), beamMat);
  beam.geometry.translate(0, -3, 0);
  beam.rotation.z = Math.PI / 2 + 0.12;
  beam.position.copy(bike.lampPos);
  beam.userData.noHack = true;
  bike.body.add(beam);

  /* =====================================================
     PARTICLES — dust behind the rear wheel, fireflies at night
     ===================================================== */

  const DUST_N = 70;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(DUST_N * 3), dustA = new Float32Array(DUST_N), dustS = new Float32Array(DUST_N);
  const dustVel = Array.from({ length: DUST_N }, () => new THREE.Vector3());
  const dustLife = new Float32Array(DUST_N);
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute("aAlpha", new THREE.BufferAttribute(dustA, 1));
  dustGeo.setAttribute("aSize", new THREE.BufferAttribute(dustS, 1));
  const pointVS = `
    attribute float aAlpha; attribute float aSize; uniform float uScale; varying float vA;
    void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / -mv.z; vA = aAlpha; }`;
  const dustMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 300 }, uColor: { value: new THREE.Color(0xc8a06a) } },
    vertexShader: pointVS,
    fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(uColor, vA * (1.0 - d * 2.0)); }`,
    transparent: true, depthWrite: false,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);
  let dustNext = 0;
  function emitDust(at, n, power) {
    for (let i = 0; i < n; i++) {
      const j = dustNext; dustNext = (dustNext + 1) % DUST_N;
      dustPos.set([at.x + (Math.random() - 0.5) * 0.3, at.y + 0.05, at.z + (Math.random() - 0.5) * 0.5], j * 3);
      dustVel[j].set(-0.6 - Math.random() * 1.2 * power, 0.5 + Math.random() * 0.9 * power, (Math.random() - 0.5) * 0.8);
      dustLife[j] = 1;
      dustS[j] = 0.25 + Math.random() * 0.35;
    }
  }

  const FF_N = q.mobile ? 90 : 180;
  const ffGeo = new THREE.BufferGeometry();
  {
    const r = mulberry32(5);
    const p = new Float32Array(FF_N * 3), ph = new Float32Array(FF_N);
    for (let i = 0; i < FF_N; i++) {
      const x = lerp(TRAIL_LEN * 0.45, TRAIL_LEN + 30, r());
      const z = trailZ(x) - 1 - r() * 16;
      p.set([x, terrainHeight(x, z) + 0.4 + r() * 2.2, z], i * 3);
      ph[i] = r() * 100;
    }
    ffGeo.setAttribute("position", new THREE.BufferAttribute(p, 3));
    ffGeo.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1));
  }
  const ffMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uScale: { value: 300 } },
    vertexShader: `
      attribute float aPhase; uniform float uTime, uNight, uScale; varying float vA;
      void main(){
        vec3 p = position + vec3(sin(uTime*0.4+aPhase)*0.8, sin(uTime*0.7+aPhase*1.3)*0.4, cos(uTime*0.35+aPhase)*0.8);
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 0.22 * uScale / -mv.z;
        vA = uNight * smoothstep(0.2, 1.0, sin(uTime*2.0 + aPhase*7.0)*0.5+0.5);
      }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord-0.5); if (d>0.5) discard; gl_FragColor = vec4(0.85,1.0,0.45, vA*(1.0-d*2.0)); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const fireflies = new THREE.Points(ffGeo, ffMat);
  fireflies.frustumCulled = false;
  scene.add(fireflies);

  /* =====================================================
     BADGES — floating coins, click to collect
     ===================================================== */

  const badges = {};
  /* gold face with the section's glyph engraved in it */
  function coinTexture(id) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(110, 96, 20, 128, 128, 140);
    grd.addColorStop(0, "#ffe9a8");
    grd.addColorStop(1, "#f0b93a");
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "rgba(122, 78, 10, 0.55)";
    g.lineWidth = 6;
    g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
    g.translate(128 - 12 * 6.2, 128 - 12 * 6.2);
    g.scale(6.2, 6.2);
    g.strokeStyle = "#6b4308";
    g.lineWidth = 1.9;
    g.lineCap = g.lineJoin = "round";
    g.stroke(new Path2D(COIN_GLYPHS[id]));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    // cylinder caps map u along the axis we rotated away; turn the art upright
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI / 2;
    return t;
  }

  function addBadge(id, i) {
    const x = lmX(i) - 27;
    const g = new THREE.Group();
    g.position.set(x, trailY(x) + 2.5, trailZ(x));
    const rim = mat("#e0a32e", { metalness: 0.6, roughness: 0.3, flatShading: false });
    const face = new THREE.MeshStandardMaterial({ map: coinTexture(id), roughness: 0.4, metalness: 0.1, emissive: 0xffffff, emissiveIntensity: 0.15 });
    face.emissiveMap = face.map;
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.09, 32), [rim, face, face]);
    coin.geometry.rotateX(Math.PI / 2);
    coin.castShadow = true;
    g.add(coin);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xffd166, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(2.6);
    halo.userData.noHack = true;
    g.add(halo);
    g.traverse((o) => { o.userData.pick = { type: "badge", id }; });
    scene.add(g);
    badges[id] = { group: g, coin, halo, phase: i * 1.7, collectAt: 0, hover: 0 };
  }

  function collectBadge(id) {
    const b = badges[id];
    if (b && !b.collectAt) b.collectAt = performance.now();
  }

  /* =====================================================
     BUILD
     ===================================================== */

  buildTerrain();
  buildTrail();
  buildProps();
  buildClouds();
  buildLandmarks();
  buildLake();
  buildSigns();

  /* =====================================================
     POST-PROCESSING (desktop): bloom makes the night glow
     ===================================================== */

  let composer = null, bloom = null;
  function setupComposer() {
    const w = window.innerWidth, h = window.innerHeight;
    const rt = new THREE.WebGLRenderTarget(w * q.dpr, h * q.dpr, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(q.dpr);
    composer.setSize(w, h);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.3, 0.55, 0.9);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }
  if (q.bloom) setupComposer();

  /* =====================================================
     DAY → NIGHT palette across the ride
     ===================================================== */

  const KEYS = [
    { p: 0.0, top: 0x4f9fd6, hor: 0xd6edf5, fog: 0xcfe3ea, sun: 0xfff3d6, sunI: 2.7, hemi: 1.15, exp: 1.0 },
    { p: 0.38, top: 0x5d9bd0, hor: 0xffe2b8, fog: 0xe6dccb, sun: 0xffe2b0, sunI: 2.5, hemi: 1.05, exp: 1.0 },
    { p: 0.6, top: 0x4f63a6, hor: 0xff9d5c, fog: 0xd9967a, sun: 0xff9050, sunI: 1.9, hemi: 0.8, exp: 1.05 },
    { p: 0.76, top: 0x1d2552, hor: 0x7a3f6b, fog: 0x4a3456, sun: 0xc06070, sunI: 0.6, hemi: 0.45, exp: 1.1 },
    { p: 0.9, top: 0x050915, hor: 0x241d48, fog: 0x121630, sun: 0x8fa8ff, sunI: 0.6, hemi: 0.42, exp: 1.15 },
  ].map((k) => ({ ...k, top: new THREE.Color(k.top), hor: new THREE.Color(k.hor), fog: new THREE.Color(k.fog), sun: new THREE.Color(k.sun) }));

  function palette(p, out) {
    let i = 0;
    while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = smooth(0, 1, clamp((p - a.p) / (b.p - a.p), 0, 1));
    out.top.copy(a.top).lerp(b.top, t);
    out.hor.copy(a.hor).lerp(b.hor, t);
    out.fog.copy(a.fog).lerp(b.fog, t);
    out.sun.copy(a.sun).lerp(b.sun, t);
    out.sunI = lerp(a.sunI, b.sunI, t);
    out.hemi = lerp(a.hemi, b.hemi, t);
    out.exp = lerp(a.exp, b.exp, t);
    return out;
  }
  const pal = { top: new THREE.Color(), hor: new THREE.Color(), fog: new THREE.Color(), sun: new THREE.Color() };
  const WHITE = new THREE.Color(0xffffff), HACK_FOG = new THREE.Color(0x020805);

  /* =====================================================
     HACKER MODE — the whole world goes wireframe
     ===================================================== */

  let hacked = false;
  const hackMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, transparent: true, opacity: 0.3, depthWrite: false });
  function setHacked(on) {
    hacked = on;
    scene.traverse((o) => {
      if (!o.isMesh || o.userData.noHack) return;
      if (on) {
        o.userData.origMat ??= o.material;
        o.userData.origTint ??= o.instanceColor ?? null;
        o.material = hackMat;
        if (o.isInstancedMesh) o.instanceColor = null; // keep the wireframe one colour
      } else if (o.userData.origMat) {
        o.material = o.userData.origMat;
        if (o.isInstancedMesh) o.instanceColor = o.userData.origTint;
      }
    });
    skyMat.uniforms.uHacked.value = on ? 1 : 0;
    starMat.color.set(on ? 0x41ff9a : 0xffffff);
    moon.visible = moonGlow.visible = !on;
  }

  /* =====================================================
     PICKING + HOVER
     ===================================================== */

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pickables = [
    ...Object.values(landmarks).map((l) => l.group),
    ...signs,
    hitBox,
    ...props.flatMap((p) => p.meshes),
  ];
  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const targets = [...Object.values(badges).filter((b) => !b.collectAt).map((b) => b.group), ...pickables];
    const hits = raycaster.intersectObjects(targets, true);
    for (const h of hits) {
      const info = h.object.userData.pick;
      if (!info) continue;
      if (info.set) return { type: info.type, set: info.set, instanceId: h.instanceId };
      return info;
    }
    return null;
  }

  let hoverId = null;
  function setHover(info) {
    const id = info && (info.type === "landmark" || info.type === "badge") ? info.type + ":" + info.id : null;
    hoverId = id;
    document.body.classList.toggle("pointing", !!info);
  }

  function poke(info) {
    if (info?.set) info.set.poke(info.instanceId, performance.now());
  }

  /* =====================================================
     CAMERA RIG
     ===================================================== */

  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), tmpD = new THREE.Vector3();
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  window.addEventListener("pointermove", (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  let focus = 0, focusId = null;

  /* =====================================================
     RESIZE
     ===================================================== */

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    composer?.setSize(w, h);
    const scale = h * q.dpr * 0.5;
    dustMat.uniforms.uScale.value = scale;
    ffMat.uniforms.uScale.value = scale;
  }
  resize();

  /* =====================================================
     FRAME
     ===================================================== */

  const moments = {}; // landmark id -> world time its moment last started
  const state = { night: 0, glow: 0, dt: 0, openId: null, since: (id) => time - (moments[id] ?? -1e9) };
  let motionOk = true;
  function activate(id) {
    if (!motionOk || !landmarks[id]) return;
    if (state.since(id) > 6) moments[id] = time; // don't restart one that's still playing
  }
  let hopY = 0, hopV = 0, wasAirborne = false;
  let introT = 0;
  let lastS = 0;
  let time = 0;
  let hoverFrame = 0;
  const projected = new THREE.Vector3();

  function hop() {
    if (hopY === 0) hopV = 4.4;
  }

  function frame({ progress, dt, popupId, reducedMotion, labels }) {
    time += dt;
    introT = Math.min(1, introT + dt / 1.7);
    const intro = reducedMotion ? 1 : 1 - Math.pow(1 - introT, 3);

    const s = progress * TRAIL_LEN - (1 - intro) * 16;
    const speed = dt > 0 ? (s - lastS) / dt : 0;
    lastS = s;
    const night = smooth(0.55, 0.9, progress);
    state.night = night;
    state.dt = dt;
    state.openId = popupId;
    state.glow = smooth(0.5, 0.85, progress) * 2.4;
    motionOk = !reducedMotion;

    /* --- rider on the trail --- */
    const by = trailY(s) + 0.05;
    bike.group.position.set(s, by, trailZ(s));
    bike.group.rotation.set(0, -Math.atan(trailSlopeZ(s)), Math.atan(trailSlopeY(s)), "YZX");
    const wheelA = -s / 0.35;
    for (const w of bike.wheels) w.rotation.z = wheelA;
    bike.setCrank(s / (0.35 * 2.1) + (reducedMotion ? 0 : time * 0.6 * (1 - smooth(0.3, 2, Math.abs(speed)))));

    if (hopV !== 0 || hopY > 0) {
      hopY += hopV * dt;
      hopV -= 13 * dt;
      if (hopY <= 0) { hopY = 0; hopV = 0; }
    }
    if (wasAirborne && hopY === 0) emitDust(bike.group.position, 14, 1.6);
    wasAirborne = hopY > 0;
    const bob = reducedMotion ? 0 : Math.sin(s * 1.6) * 0.012 * smooth(0.2, 3, Math.abs(speed));
    bike.pivot.position.y = hopY + bob;
    bike.pivot.rotation.z = Math.min(hopY * 0.55, 0.4);
    if (bike.rider.root) bike.rider.root.position.y = Math.sin(s * 3.2) * 0.012;

    // dust from the rear wheel
    if (Math.abs(speed) > 1.2 && Math.random() < Math.min(1, Math.abs(speed) * 0.08)) {
      tmpA.set(s - 0.75, by, trailZ(s - 0.75));
      emitDust(tmpA, 1, clamp(Math.abs(speed) / 8, 0.3, 1.5));
    }
    for (let i = 0; i < DUST_N; i++) {
      if (dustLife[i] <= 0) { dustA[i] = 0; continue; }
      dustLife[i] -= dt * 1.1;
      dustVel[i].y -= dt * 0.6;
      dustPos[i * 3] += dustVel[i].x * dt;
      dustPos[i * 3 + 1] += dustVel[i].y * dt;
      dustPos[i * 3 + 2] += dustVel[i].z * dt;
      dustA[i] = Math.max(0, dustLife[i]) * 0.5 * (hacked ? 0 : 1);
      dustS[i] += dt * 0.5;
    }
    dustGeo.attributes.position.needsUpdate = true;
    dustGeo.attributes.aAlpha.needsUpdate = true;
    dustGeo.attributes.aSize.needsUpdate = true;

    /* --- sky, sun, light --- */
    palette(progress, pal);
    const el = lerp(0.62, -0.1, smooth(0.0, 0.82, progress));
    const az = lerp(0.55, -0.45, progress);
    const sunDir = tmpB.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    skyMat.uniforms.uTop.value.copy(pal.top);
    skyMat.uniforms.uHor.value.copy(pal.hor);
    skyMat.uniforms.uBot.value.copy(pal.fog).multiplyScalar(0.6);
    skyMat.uniforms.uSunDir.value.copy(sunDir);
    skyMat.uniforms.uSunCol.value.copy(pal.sun);
    skyMat.uniforms.uSunVis.value = 1 - smooth(0.7, 0.86, progress);
    scene.fog.color.copy(hacked ? HACK_FOG : pal.fog);
    scene.fog.near = hacked ? 10 : 70;
    scene.fog.far = hacked ? 140 : 650;

    // the key light comes from over the viewer's shoulder so building fronts
    // stay lit; it lowers and warms as the visible sun sets
    const lightDir = tmpC.set(lerp(-0.55, 0.45, progress), lerp(0.95, 0.42, smooth(0, 0.8, progress)), 0.62).normalize();
    sun.color.copy(pal.sun);
    sun.intensity = pal.sunI;
    sun.position.copy(bike.group.position).addScaledVector(lightDir, 90);
    sun.target.position.copy(bike.group.position);
    hemi.intensity = pal.hemi;
    hemi.color.copy(pal.top).lerp(WHITE, 0.5);
    renderer.toneMappingExposure = pal.exp;

    starMat.opacity = night * 0.95;
    moonMat.opacity = night;
    moonGlow.material.opacity = night * 0.35;

    windowMat.emissiveIntensity = state.glow;
    bulbMat.emissiveIntensity = 0.2 + night * 5;
    bike.lampMat.emissiveIntensity = night * 4;
    headlight.intensity = night * 55;
    beamMat.uniforms.uOpacity.value = hacked ? 0 : night * 0.085;
    beam.visible = beamMat.uniforms.uOpacity.value > 0.002;
    ffMat.uniforms.uTime.value = time;
    ffMat.uniforms.uNight.value = hacked ? 0 : night;

    if (bloom) {
      bloom.strength = hacked ? 0.45 : lerp(0.25, 0.85, night);
      bloom.threshold = hacked ? 0.15 : lerp(0.92, 0.55, night);
      bloom.radius = hacked ? 0.25 : 0.55;
    }

    for (const c of clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > TRAIL_LEN + 320) c.position.x = -320;
    }

    /* --- badges --- */
    const now = performance.now();
    for (const [id, b] of Object.entries(badges)) {
      if (b.collectAt) {
        const t = (now - b.collectAt) / 550;
        if (t >= 1) { scene.remove(b.group); delete badges[id]; continue; }
        b.group.scale.setScalar(t < 0.4 ? 1 + t * 1.5 : 1.6 * (1 - (t - 0.4) / 0.6));
        b.coin.rotation.y += dt * 18;
        b.group.position.y += dt * 2;
        continue;
      }
      const hv = hoverId === "badge:" + id ? 1 : 0;
      b.hover = damp(b.hover, hv, 10, dt);
      b.group.position.y = trailY(b.group.position.x) + 2.5 + Math.sin(time * 1.9 + b.phase) * 0.18;
      b.coin.rotation.y = reducedMotion ? 0 : Math.sin(time * 1.4 + b.phase) * 0.7 + b.hover * time * 6;
      b.group.scale.setScalar(1 + b.hover * 0.2);
      b.halo.material.opacity = 0.55 + Math.sin(time * 3 + b.phase) * 0.2 + b.hover * 0.3;
    }

    /* --- landmarks: hover lift --- */
    for (const [id, lm] of Object.entries(landmarks)) {
      const hv = hoverId === "landmark:" + id || lm.label?.matches(":hover, :focus-visible") ? 1 : 0;
      lm.hover = damp(lm.hover, hv, 10, dt);
      lm.group.scale.setScalar(1 + lm.hover * 0.04);
    }

    for (const p of props) p.tick(now);
    for (const fn of tickers) fn(time, state);

    // arriving beside a building wakes it up
    for (const [i, id] of SECTION_IDS.entries()) {
      const near = Math.abs(s - (lmX(i) - LM_AHEAD)) < 4;
      if (near && !landmarks[id].near && introT >= 1) activate(id);
      landmarks[id].near = near;
    }

    /* --- camera --- */
    const B = bike.group.position;
    const w = window.innerWidth, h = window.innerHeight, aspect = w / h;
    const portrait = aspect < 0.9;
    const pull = portrait ? 1 + (1 / aspect - 0.9) * 0.4 : 1;
    const hero = 1 - smooth(0, 0.12, progress);

    // chase: off the near side, looking a little ahead
    tmpA.set(B.x - 3.4 * pull, B.y + 3.6 + (pull - 1) * 2, B.z + 13 * pull);
    tmpB.set(B.x + (portrait ? 2 : 4.6), B.y + 2.0, B.z - 4);

    // hero: a low, slow three-quarter orbit of the rider
    const orbit = reducedMotion ? 0 : Math.sin(time * 0.13) * 0.16;
    const ha = 0.86 + orbit;
    const hr = portrait ? 7.2 * pull * 0.72 : 7.4;
    tmpC.set(B.x + Math.sin(ha) * hr, B.y + (portrait ? 2.2 : 1.5), B.z + Math.cos(ha) * hr);
    tmpD.set(B.x, B.y + 0.95, B.z);

    camPos.lerpVectors(tmpA, tmpC, hero);
    camLook.lerpVectors(tmpB, tmpD, hero);

    // when a card is open, drift toward that building
    const fid = popupId && landmarks[popupId] ? popupId : null;
    if (fid) focusId = fid;
    focus = damp(focus, fid ? 1 : 0, 2.4, dt);
    if (focusId && focus > 0.001) {
      const L = landmarks[focusId].group.position, v = landmarks[focusId].view;
      tmpA.set(L.x + v.pos[0], L.y + v.pos[1], L.z + v.pos[2] * pull);
      tmpB.set(L.x + v.look[0], L.y + v.look[1], L.z + v.look[2]);
      const f = smooth(0, 1, focus);
      camPos.lerp(tmpA, f);
      camLook.lerp(tmpB, f);
    }

    // a touch of pointer parallax
    pointer.sx = damp(pointer.sx, reducedMotion ? 0 : pointer.x, 3, dt);
    pointer.sy = damp(pointer.sy, reducedMotion ? 0 : pointer.y, 3, dt);
    camPos.x += pointer.sx * 0.7;
    camPos.y -= pointer.sy * 0.35;

    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camera.fov = 42 + (portrait ? 8 : 0) + clamp(Math.abs(speed) * 0.35, 0, 6);
    // hero framing: rider sits right of the headline (below it on phones)
    // with a card open on a wide screen, the building sits left of it
    const side = w >= 1000 && !portrait ? smooth(0, 1, focus) : 0;
    const offX = portrait ? 0 : -w * 0.17 * hero + w * 0.21 * side;
    const offY = portrait ? -h * lerp(0.1, 0.33, hero) : 0;
    camera.setViewOffset(w, h, offX, offY, w, h);
    sky.position.copy(camera.position);

    /* --- hover (desktop, a few times a second) --- */
    if (!q.touch && ++hoverFrame % 4 === 0 && !popupId) {
      const info = pointer.inside ? pick(pointer.cx, pointer.cy) : null;
      setHover(info);
    }

    /* --- HTML labels pinned above each building --- */
    if (labels) {
      for (const [id, lm] of Object.entries(landmarks)) {
        const el = labels[id];
        if (!el) continue;
        lm.label = el;
        projected.copy(lm.anchor).project(camera);
        const visible = projected.z < 1 && Math.abs(projected.x) < 1.3 && projected.y > -1.2 && projected.y < 3;
        const dist = camera.position.distanceTo(lm.anchor);
        const fade = visible ? 1 - smooth(70, 110, dist) : 0;
        if (fade <= 0.01) {
          if (el.style.visibility !== "hidden") el.style.visibility = "hidden";
          continue;
        }
        el.style.visibility = "visible";
        el.style.opacity = (fade * (1 - focus)).toFixed(3);
        lm.labelHalf ??= el.offsetWidth / 2 + 10;
        const sx = clamp((projected.x * 0.5 + 0.5) * w, lm.labelHalf, w - lm.labelHalf);
        const sy = Math.max((-projected.y * 0.5 + 0.5) * h, 96);
        el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%)`;
      }
    }

    if (composer) composer.render();
    else renderer.render(scene, camera);

    return { speed, night };
  }

  window.addEventListener("pointermove", (e) => {
    pointer.cx = e.clientX;
    pointer.cy = e.clientY;
    pointer.inside = e.target === canvas;
  }, { passive: true });

  /* drop quality if the device is struggling */
  function degrade() {
    q.dpr = 1;
    renderer.setPixelRatio(1);
    if (composer) { composer.dispose?.(); composer = null; bloom = null; renderer.setPixelRatio(1); }
    renderer.shadowMap.enabled = false;
    sun.castShadow = false;
    scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    resize();
  }

  if (location.search.includes("debug")) window.__three = { THREE, scene, renderer, camera, sun, hemi, bike, composer: () => composer };

  return {
    frame, resize, pick, poke, hop, setHacked, collectBadge, addBadge, degrade, activate,
    sectionIds: SECTION_IDS,
  };
}
