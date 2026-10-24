// Sky dome (haze → blue gradient + soft sun), turquoise sea (lagoon → deep, swell, glints, rolling foam), painted cumulus
// billboards, circling birds. The sky and sea share SUN_U, the uniform the game re-aims per place.
import { THREE, PAL, rng, basic, canvas, canvasTexture } from '../core/kit.js';
import { SUN_DIR } from '../core/lighting.js';
import { SEA_Y, TIME, Batch } from './env_util.js';
import { SHORE_GLSL } from './env_terrain.js';

const lin = (hex) => new THREE.Color(hex);

/** The sun-direction uniform shared by the sky and the sea (the game re-aims it for every place: aimSun → uSun). */
export const SUN_U = { value: SUN_DIR.clone().normalize() };

export function buildSky(fogColor) {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTop: { value: lin('#4ea4df') }, uSky: { value: lin('#9bd3f1') }, uHaze: { value: lin('#e9f5f4') }, uHorizon: { value: fogColor.clone() },
      uWarm: { value: lin('#fff0cc') }, uSun: SUN_U,
    },
    vertexShader: `varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uTop, uSky, uHaze, uHorizon, uWarm, uSun; varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        // pale luminous haze hugging the sea horizon → soft sky blue → deeper zenith
        vec3 col = mix(uHaze, uSky, smoothstep(0.0, 0.2, h));
        col = mix(col, uTop, smoothstep(0.16, 0.95, h));
        col = mix(uHorizon, col, smoothstep(-0.015, 0.03, h)); // exactly the fog colour where the far sea fades out
        float s = max(dot(d, uSun), 0.0);
        col = mix(col, uWarm, pow(s, 6.0) * 0.32);
        col += vec3(1.0, 0.92, 0.72) * (smoothstep(0.9972, 0.9984, s) * 0.85 + pow(s, 260.0) * 0.4 + pow(s, 28.0) * 0.14);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(470, 32, 16), m);
  sky.name = 'sky';
  sky.renderOrder = 100; // after the opaque world: only uncovered pixels pay for it
  sky.frustumCulled = false;
  return sky;
}

export function buildSea() {
  // a flat ring from under the beach to beyond the fog: the shader paints depth, ripples, glints and foam
  const radii = [28, 34, 42, 60, 110, 220, 460], seg = 120, pos = [], idx = [];
  for (const r of radii) for (let k = 0; k < seg; k++) { const a = (k / seg) * Math.PI * 2; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); }
  for (let i = 0; i < radii.length - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const a = i * seg + k, b = i * seg + ((k + 1) % seg), c = a + seg, d = b + seg;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uLagoon: { value: lin('#a6eadb') }, uShallow: { value: lin('#5fd3d6') }, uMid: { value: lin('#2fb3d3') }, uDeep: { value: lin('#2a8fca') }, uFoam: { value: lin(PAL.foam) },
    }]),
    vertexShader: `varying vec3 vW;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; uniform vec3 uLagoon, uShallow, uMid, uDeep, uFoam; varying vec3 vW;
      #include <fog_pars_fragment>
      ${SHORE_GLSL}
      void main() {
        float r = length(vW.xz), a = atan(vW.z, vW.x), d = r - shoreR(a), t = uTime;
        // depth: sandy lagoon → turquoise → open-water blue
        vec3 col = mix(uLagoon, uShallow, smoothstep(0.2, 4.5, d));
        col = mix(col, uMid, smoothstep(3.0, 18.0, d));
        col = mix(col, uDeep, smoothstep(18.0, 95.0, d));
        if (r < 115.0) { // near water only: far fragments (most of the sea on screen) skip the detail
          float fade = 1.0 - smoothstep(30.0, 115.0, r);
          // slow crossing swell: soft light crests and slightly deeper troughs
          float w = sin(vW.x * 0.43 + t * 0.55) * sin(vW.z * 0.37 - t * 0.43);
          float w2 = sin((vW.x + vW.z) * 0.83 + t * 1.05) * sin((vW.x - vW.z) * 0.61 - t * 0.8);
          float sw = w * 0.6 + w2 * 0.5;
          col += vec3(0.06, 0.075, 0.075) * smoothstep(0.25, 1.0, sw) * fade;
          col -= vec3(0.025, 0.03, 0.02) * smoothstep(0.35, 1.0, -sw) * fade;
          // tiny sun glints riding on the crests (sparse, slow)
          float gl = sin(vW.x * 2.3 + t * 1.3) * sin(vW.z * 2.9 - t * 1.1) * sin((vW.x - vW.z) * 1.7 + t * 0.7);
          col += vec3(0.32, 0.3, 0.26) * smoothstep(0.78, 0.97, gl) * smoothstep(0.0, 0.8, sw) * fade;
          if (d < 13.0) {
            // gentle swell lines rolling in toward the beach, breaking foam at the waterline and a fainter second line
            float roll = sin(d * 1.05 - t * 0.9 + sin(a * 5.0) * 1.4);
            col += vec3(0.06, 0.07, 0.07) * smoothstep(0.72, 1.0, roll) * (1.0 - smoothstep(1.5, 13.0, d)) * smoothstep(0.4, 1.6, d);
            float wob = sin(a * 17.0 + t * 0.9) * 0.16 + sin(t * 0.75) * 0.28;
            float foam = 1.0 - smoothstep(0.05, 0.55, abs(d - 0.3 - wob));
            float foam2 = (1.0 - smoothstep(0.0, 0.35, abs(d - 2.3 - wob * 1.6 - sin(t * 0.5 + a * 3.0) * 0.5))) * 0.32;
            col = mix(col, uFoam, clamp(foam * 0.92 + foam2, 0.0, 1.0));
          }
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  m.uniforms.uTime = TIME;
  const sea = new THREE.Mesh(g, m);
  sea.name = 'sea';
  sea.position.y = SEA_Y;
  sea.renderOrder = 50; // after the terrain so the island hides it early (fill-rate)
  return sea;
}

// ---------------------------------------------------------------- clouds: painted cumulus on far billboards
const CW = 512, CH = 256; // one cloud cell in the 1024 × 512 cloud canvas (4 shapes)

/** Paints one fluffy cumulus (flat belly, cauliflower top, blue-grey shade) into the cell at (ox, oy). */
function paintCloud(x, ox, oy, seed) {
  const R = rng(seed), base = oy + CH * 0.8, puffs = [];
  const n = 9 + Math.floor(R() * 4);
  for (let i = 0; i < n; i++) {
    const u = 0.17 + 0.66 * (i / (n - 1)) + (R() - 0.5) * 0.04, dome = Math.pow(Math.sin(Math.PI * u), 0.9);
    const r = Math.min(CH * (0.12 + 0.17 * dome) * (0.85 + R() * 0.3), CW * Math.min(u, 1 - u) - 14); // stays inside the cell
    puffs.push({ x: ox + CW * u, y: base - r * 0.55 - dome * CH * (0.12 + R() * 0.1), r });
  }
  for (let i = 0; i < 4; i++) { // a few top turrets
    const u = 0.3 + R() * 0.4, dome = Math.sin(Math.PI * u), r = CH * (0.1 + R() * 0.07);
    puffs.push({ x: ox + CW * u, y: base - CH * (0.36 + 0.14 * dome) - r * 0.4, r });
  }
  puffs.sort((a, b) => a.y - b.y); // upper lobes first: lower lobes overlap them like a real cumulus
  x.save();
  x.beginPath(); x.rect(ox, oy, CW - 16, base - oy); x.clip(); // flat belly
  for (const p of puffs) {
    x.fillStyle = '#c9d9ea'; x.beginPath(); x.arc(p.x + p.r * 0.06, p.y + p.r * 0.1, p.r, 0, Math.PI * 2); x.fill();
    const g = x.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.45, p.r * 0.1, p.x, p.y, p.r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#fbfdff'); g.addColorStop(1, '#e3edf7');
    x.fillStyle = g; x.beginPath(); x.arc(p.x - p.r * 0.04, p.y - p.r * 0.07, p.r * 0.93, 0, Math.PI * 2); x.fill();
  }
  // shaded belly: bluish toward the flat base (only where the cloud already is)
  x.globalCompositeOperation = 'source-atop';
  const b = x.createLinearGradient(0, base - CH * 0.36, 0, base);
  b.addColorStop(0, 'rgba(178,199,224,0)'); b.addColorStop(1, 'rgba(160,184,214,0.75)');
  x.fillStyle = b; x.fillRect(ox, oy, CW, CH);
  x.restore();
}

function cloudTexture() {
  const W = CW * 2, H = CH * 2, cv = canvas(W, H), x = cv.getContext('2d');
  const tmp = canvas(W, H), t = tmp.getContext('2d');
  for (let i = 0; i < 4; i++) paintCloud(t, (i % 2) * CW + 8, Math.floor(i / 2) * CH + 4, 61 + i * 17);
  x.filter = 'blur(2.5px)'; // soft, painterly edges (ignored where unsupported)
  x.drawImage(tmp, 0, 0);
  x.filter = 'none';
  return canvasTexture(cv);
}

/**
 * Fluffy cumulus as painted billboards (one transparent mesh, 2 triangles each) on a ring far out over the sea.
 * They face the island centre (every place is within 17 m of it, so they read the same from all of them), sit low
 * over the horizon (4–20° up) and never right behind a diorama's centre.
 */
export function buildClouds() {
  const R = rng(23), B = new Batch(false, true), N = 13;
  const plane = new THREE.PlaneGeometry(1, 0.5);
  for (let i = 0; i < N; i++) {
    let a = (i / N) * Math.PI * 2 + (R() - 0.5) * 0.3;
    const D = 150 + R() * 110, elev = (3 + R() * 14) * (Math.PI / 180), wAng = (13 + R() * 13) * (Math.PI / 180);
    const W = D * wAng, cx = Math.cos(a) * D, cz = Math.sin(a) * D, y = D * Math.tan(elev) + W * 0.25 * 0.7;
    const cell = i % 4, u0 = (cell % 2) * 0.5, v0 = Math.floor(cell / 2) === 0 ? 0.5 : 0; // canvas row 0 = top = v 0.5..1
    const flip = R() < 0.5;
    B.add(plane, { pos: [cx, y, cz], rot: [0, Math.atan2(-cx, -cz), 0], scale: [W * (flip ? -1 : 1), W, 1], uvRect: [u0, v0, u0 + 0.5, v0 + 0.5], color: '#ffffff' });
  }
  const mat = new THREE.MeshBasicMaterial({ map: cloudTexture(), vertexColors: true, transparent: true, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(B.build(), mat);
  m.name = 'clouds';
  // first in the transparent pass: smoke, glow rings and bubbles in front of a cloud must paint over it, never under it
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

/** A few gulls circling high over the island (instanced; flap = squash the V). */
export function buildBirds(n = 7) {
  const B = new Batch();
  const wing = (s) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.16, s * 0.62, 0.16, -0.02, 0, 0, -0.14], 3)); return g; };
  B.add(wing(1), { color: '#56627b' });
  B.add(wing(-1), { color: '#56627b' });
  B.add(new THREE.IcosahedronGeometry(0.07, 0), { scale: [0.8, 0.7, 2.2], color: '#e9eef5' });
  const mesh = new THREE.InstancedMesh(B.build(), basic('#ffffff', { vertexColors: true, side: THREE.DoubleSide }), n);
  mesh.name = 'birds';
  mesh.frustumCulled = false;
  const R = rng(91), birds = [];
  for (let i = 0; i < n; i++) birds.push({ cx: (R() - 0.5) * 30, cz: (R() - 0.5) * 30, r: 14 + R() * 18, y: 11 + R() * 9, w: (0.12 + R() * 0.08) * (R() < 0.3 ? -1 : 1), ph: R() * 6.28, fl: 5 + R() * 2, s: 1.3 + R() * 0.6 });
  const o = new THREE.Object3D();
  function update(time) {
    for (let i = 0; i < n; i++) {
      const b = birds[i], th = b.ph + time * b.w;
      o.position.set(b.cx + Math.cos(th) * b.r, b.y + Math.sin(time * 0.3 + i) * 0.8, b.cz + Math.sin(th) * b.r);
      o.rotation.set(0, -th + (b.w > 0 ? 0 : Math.PI), (b.w > 0 ? 1 : -1) * 0.25);
      const flap = Math.sin(time * b.fl + i * 1.7);
      o.scale.set(b.s, b.s * (flap > -0.2 ? 0.25 + 0.75 * flap : flap), b.s);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { mesh, update };
}
