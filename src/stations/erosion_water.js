// Water for station 4 «التعرية»: one small unlit shader pair (stream + pond) and one tileable data texture.
// The water knows how deep it is at every vertex (water height minus ground height, for the "before" land and for each
// "after" shape), so it can be turquoise in the deep middle, pale in the shallows and draw a clean white foam line exactly
// where it meets the ground: the shoreline stays crisp and never z-fights, whatever the land does.
import { THREE, rng, canvas, canvasTexture } from '../core/kit.js';

/** 64×256 tileable data texture: R = flow streaks, G = clouds of silt, B = soft blotchy noise (glints, foam breakup). */
export function waterTexture() {
  const W = 64, H = 256, r = rng(77);
  const layer = (draw) => {
    const c = canvas(W, H), x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'lighter';
    draw(x);
    return x.getImageData(0, 0, W, H).data;
  };
  const wrap = (x, f) => { for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) f(ox, oy); };
  const blobs = (x, n, rx0, rx1, ry0, ry1, a) => {
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.55, `rgba(255,255,255,${a * 0.5})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    for (let i = 0; i < n; i++) {
      const cx = r() * W, cy = r() * H, rx = rx0 + r() * (rx1 - rx0), ry = ry0 + r() * (ry1 - ry0);
      wrap(x, (ox, oy) => { x.setTransform(rx, 0, 0, ry, cx + ox, cy + oy); x.fillRect(-1, -1, 2, 2); });
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
  };
  const R = layer((x) => {
    x.lineCap = 'round';
    for (let i = 0; i < 30; i++) {
      const y = r() * H, x0 = r() * W, len = 8 + r() * 22, bow = 2 + r() * 5;
      x.strokeStyle = `rgba(255,255,255,${0.55 + r() * 0.45})`; x.lineWidth = 1.5 + r() * 2.5;
      wrap(x, (ox, oy) => { x.beginPath(); x.moveTo(x0 + ox, y + oy); x.quadraticCurveTo(x0 + len / 2 + ox, y + bow + oy, x0 + len + ox, y + oy); x.stroke(); });
    }
  });
  const G = layer((x) => blobs(x, 18, 6, 16, 16, 46, 0.85));
  const B = layer((x) => blobs(x, 46, 3, 9, 3, 12, 0.7));
  const c = canvas(W, H), x = c.getContext('2d'), img = x.createImageData(W, H);
  for (let i = 0; i < img.data.length; i += 4) { img.data[i] = R[i]; img.data[i + 1] = G[i]; img.data[i + 2] = B[i]; img.data[i + 3] = 255; }
  x.putImageData(img, 0, 0);
  return canvasTexture(c, { repeat: true, srgb: false });
}

const lin = (hex) => new THREE.Color(hex);

// ------------------------------------------------------------------ stream
const STREAM_VS = /* glsl */ `
attribute vec3 aE;   // offset to the water surface once the gully is cut
attribute vec3 aD;   // offset once the fan is built (the water narrows into its groove and rides over it)
attribute vec4 aInfo; // across (-1..1), metres along the path, depth (before), steepness 0..1
attribute vec2 aDep; // depth change for the gully, for the fan
uniform float uE, uD;
varying vec4 vInfo; varying float vDepth;
void main() {
  vInfo = aInfo;
  vDepth = aInfo.z + aDep.x * uE + aDep.y * uD;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position + aE * uE + aD * uD, 1.0);
}`;
const STREAM_FS = /* glsl */ `
uniform sampler2D uTex;
uniform float uOff, uMud, uFront;
uniform vec3 uShallow, uDeep, uMudCol, uMudDeep, uFoam, uHi;
varying vec4 vInfo; varying float vDepth;
void main() {
  float across = vInfo.x, along = vInfo.y, steep = vInfo.w;
  vec4 a = texture2D(uTex, vec2(across * 0.42 + 0.5, along * 2.2 - uOff));
  vec4 b = texture2D(uTex, vec2(across * 0.3 + 0.17, along * 1.15 - uOff * 0.63));
  float dk = smoothstep(0.006, 0.03, vDepth) * (1.0 - 0.35 * across * across);
  vec3 col = mix(uShallow, uDeep, dk);
  // the water carries soil: brown swirls of silt drift in the turquoise water (it never turns grey)
  float silt = clamp(uMud * (0.18 + 1.05 * a.g * (0.5 + 0.9 * b.b)), 0.0, 0.78);
  col = mix(col, mix(uMudCol, uMudDeep, dk * 0.6), silt);
  // bright streaks run with the flow
  col = mix(col, uHi, a.r * (0.2 + 0.35 * steep) * (1.0 - 0.45 * silt));
  // foam: where it meets the banks, the leading edge of the water, white water on the steep stretch
  float foam = 1.0 - smoothstep(0.002, 0.014, vDepth + (b.b - 0.4) * 0.008);
  foam = max(foam, smoothstep(uFront - 0.16, uFront - 0.015, along) * (0.65 + 0.35 * b.b));
  foam = max(foam, steep * smoothstep(0.42, 0.75, a.r * (0.5 + b.b)));
  col = mix(col, uFoam, clamp(foam, 0.0, 1.0) * 0.9);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function streamMaterial(tex) {
  return new THREE.ShaderMaterial({
    vertexShader: STREAM_VS, fragmentShader: STREAM_FS,
    // "transparent" only so the game's shadow pass leaves the water out (it is fully opaque and writes depth)
    transparent: true, depthWrite: true,
    uniforms: {
      uTex: { value: tex }, uE: { value: 0 }, uD: { value: 0 }, uOff: { value: 0 }, uMud: { value: 0 }, uFront: { value: 0 },
      uShallow: { value: lin('#63d5e6') }, uDeep: { value: lin('#169dcf') }, uMudCol: { value: lin('#b8875a') }, uMudDeep: { value: lin('#8d6240') },
      uFoam: { value: lin('#f7fffd') }, uHi: { value: lin('#e6fbff') },
    },
  });
}

// ------------------------------------------------------------------ pond
const POND_VS = /* glsl */ `
attribute vec4 aG; // ground height under this point (before, with the fan), ground slope there (before, with the fan)
uniform float uLevel, uD;
varying vec3 vP; varying float vDepth; varying float vBand;
void main() {
  vP = position;
  vDepth = uLevel - mix(aG.x, aG.y, uD);
  vBand = clamp(mix(aG.z, aG.w, uD) * 0.04, 0.0025, 0.011); // foam band in depth units ≈ 4 cm wide on the shore
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const POND_FS = /* glsl */ `
uniform sampler2D uTex;
uniform float uOff, uTime, uFlow, uPlume, uMudTint;
uniform vec2 uMouth, uFanO, uFanDir;
uniform vec3 uShallow, uDeep, uMudCol, uFoam, uHi, uPad, uPadDark;
uniform vec3 uPads[3];
varying vec3 vP; varying float vDepth; varying float vBand;
void main() {
  vec2 q = vP.xz - uMouth;
  float r = length(q);
  vec4 a = texture2D(uTex, vec2(atan(q.y, q.x) * 0.955, r * 3.2 - uOff));
  vec4 b = texture2D(uTex, vP.xz * vec2(0.9, 2.1) + vec2(0.0, uOff * 0.3));
  float dk = smoothstep(0.0, 0.1, vDepth);
  vec3 col = mix(uShallow, uDeep, dk);
  // the muddy plume where the stream pours its soil into the pond, and a light muddy tint overall
  vec2 f = vP.xz - uFanO;
  float fa = dot(f, uFanDir), fc = dot(f, vec2(-uFanDir.y, uFanDir.x));
  float plume = uPlume * (1.0 - smoothstep(0.25, 1.0, length(vec2(fa * 0.85 - 0.25 * uPlume, fc * 1.25)) / (0.25 + 0.55 * uPlume)));
  plume = clamp(plume * (0.55 + 0.75 * a.g), 0.0, 0.9);
  col = mix(col, uMudCol, max(plume, uMudTint * (0.5 + 0.5 * b.g)));
  // ripples: arcs drifting from the mouth, rings spreading while water pours in, small glints
  col = mix(col, uHi, (a.r * 0.08 + b.g * 0.1) * (1.0 - 0.6 * plume));
  float ring = smoothstep(0.82, 1.0, sin(r * 52.0 - uTime * 3.2)) * (1.0 - smoothstep(0.08, 0.75, r)) * uFlow;
  col = mix(col, uFoam, ring * 0.42);
  col += uHi * smoothstep(0.74, 0.95, b.b * a.b * 1.9) * 0.35;
  // lily pads (round leaf with a notch) on the quiet side of the pond
  for (int i = 0; i < 3; i++) {
    vec2 d = vP.xz - uPads[i].xy;
    float pr = uPads[i].z, dl = length(d);
    float notch = smoothstep(0.08, 0.2, abs(atan(d.y, d.x) - 0.6 - float(i) * 1.9));
    float pad = (1.0 - smoothstep(pr - 0.006, pr, dl)) * notch;
    vec3 pc = mix(uPad, uPadDark, smoothstep(pr * 0.55, pr, dl) * 0.6 + 0.25 * step(0.5, fract(atan(d.y, d.x) * 1.43)));
    col = mix(col, uPadDark * 0.8, (1.0 - smoothstep(pr, pr + 0.012, dl)) * notch * 0.35);
    col = mix(col, pc, pad);
  }
  // a clean white foam line where the water meets the land (the shore, and the new fan as it rises)
  float foam = 1.0 - smoothstep(vBand * 0.2, vBand, vDepth + (b.b - 0.45) * vBand * 0.5);
  col = mix(col, uFoam, foam * 0.92);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function pondMaterial(tex, { mouth, fanO, fanDir, pads }) {
  return new THREE.ShaderMaterial({
    vertexShader: POND_VS, fragmentShader: POND_FS,
    transparent: true, depthWrite: true, // opaque; see streamMaterial
    uniforms: {
      uTex: { value: tex }, uLevel: { value: 0 }, uD: { value: 0 }, uOff: { value: 0 }, uTime: { value: 0 }, uFlow: { value: 0 },
      uPlume: { value: 0 }, uMudTint: { value: 0 },
      uMouth: { value: new THREE.Vector2(mouth.x, mouth.z) }, uFanO: { value: new THREE.Vector2(fanO.x, fanO.z) },
      uFanDir: { value: new THREE.Vector2(fanDir.x, fanDir.z) },
      uShallow: { value: lin('#97e8e2') }, uDeep: { value: lin('#27a6c8') }, uMudCol: { value: lin('#b58a5c') },
      uFoam: { value: lin('#f7fffd') }, uHi: { value: lin('#e6fbff') }, uPad: { value: lin('#6fc35d') }, uPadDark: { value: lin('#3f9448') },
      uPads: { value: pads.map(([x, z, r]) => new THREE.Vector3(x, z, r)) },
    },
  });
}
