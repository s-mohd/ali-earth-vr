// Shaders of the volcano station (small, Quest-cheap): lava ribbons/pools/lake, billboards (smoke puffs, soft glows),
// and the terrain patch that adds the lava's warm light spill to a Lambert material (keeps real shadows and the rim light).
import * as THREE from 'three';

export const LAVA_VS = /* glsl */ `
attribute vec4 aA; // along (0..1 channel, >1 pool), edge (0 centre .. 1 halo rim), along->edge scale, channel id
attribute vec3 aB; // edge wobble, flow x (m), flow y (m, downstream)
uniform vec4 uFront;
varying vec4 vA; varying vec3 vB; varying float vFront;
void main() {
  vA = aA; vB = aB;
  float ch = aA.w;
  vFront = ch < 0.5 ? uFront.x : (ch < 1.5 ? uFront.y : (ch < 2.5 ? uFront.z : uFront.w));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const LAVA_FS = /* glsl */ `
uniform float uTime, uCool;
uniform vec3 uHot, uMid, uDeep, uCrust, uCrust2, uGlow;
varying vec4 vA; varying vec3 vB; varying float vFront;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float along = vA.x, edge = vA.y, K = vA.z;
  float cb = 0.5 * (0.86 + vB.x);                    // core edge (wobbly)
  float tip = along < 1.0 ? 3.0 * edge * edge : 0.0; // rounded tongue at the flow front
  float ahead = (along - vFront) * K + tip;
  float d = max(edge - cb, ahead);
  if (d > 1.0 - cb) discard;
  float core = 1.0 - smoothstep(-0.035, 0.0, d);
  // slowly drifting noise for the crust and its cracks; hot pulses run downstream
  vec2 q = vec2(vB.y * 18.0, (vB.z - uTime * 0.07) * 10.0);
  float n = vn(q) * 0.62 + vn(q * 2.2 + 7.1) * 0.38;
  float heat = clamp(1.0 - edge / cb, 0.0, 1.0);
  float pulse = 0.5 + 0.5 * sin(vB.z * 5.0 - uTime * 2.0);
  float down = smoothstep(0.15, 1.1, along);
  heat = heat * (0.82 + 0.18 * pulse) * (1.0 - 0.18 * down);
  vec3 col = mix(uDeep, uMid, smoothstep(0.0, 0.36, heat));
  col = mix(col, uHot, smoothstep(0.42, 0.86, heat));
  // crust: the molten centre stays open; the edges (more of the width downstream) skin over with a dark crust
  // that is split by a network of glowing cracks
  float e = 1.0 - heat + 0.22 * (vn(q * 0.6 + 3.3) - 0.5);
  float th = 0.62 - 0.19 * down - 0.06 * uCool;
  float crustAmt = smoothstep(th, th + 0.18, e);
  float crack = 1.0 - smoothstep(0.05, 0.15, abs(n - 0.5) * 2.0);
  vec3 crust = mix(uCrust, uCrust2, smoothstep(0.3, 0.8, vn(q * 3.1 + 2.0)));
  col = mix(col, crust, crustAmt * (1.0 - crack) * 0.9);
  col = mix(col, uHot, crustAmt * crack * 0.55);
  float lev = smoothstep(0.7, 1.0, edge / cb);         // cooled dark levees along the edges
  col = mix(col, uCrust * 0.8, lev * 0.5 * (1.0 - crack));
  col = mix(col, uHot, smoothstep(-0.22, 0.0, ahead) * 0.6 * (1.0 - crustAmt)); // the advancing front glows
  float halo = 1.0 - clamp(d / (1.0 - cb), 0.0, 1.0);
  halo = halo * halo * (1.0 - core) * (vA.w < 2.5 && along <= 1.0 ? 1.0 - smoothstep(0.9, 1.0, along) : 1.0);
  // opaque lava + a soft orange heat glow; encode the straight colour first, then premultiply (no washed-out halos)
  float aOut = core + halo * 0.5;
  gl_FragColor = vec4((col * core + uGlow * halo * 0.55) / max(aOut, 1e-4), 1.0);
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * aOut, aOut);
}`;

// Billboard quads for instanced particles: each instance is a camera-facing square (works per eye in XR).
export const BILL_VS = /* glsl */ `
attribute vec4 aP;
varying vec2 vUv; varying vec4 vP;
void main() {
  vUv = uv; vP = aP;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * length(instanceMatrix[0].xyz);
  gl_Position = projectionMatrix * mv;
}`;

export const SMOKE_FS = /* glsl */ `
uniform sampler2D uTex;
uniform vec3 uLit, uShade, uAshLit, uAshShade, uWarm;
varying vec2 vUv; varying vec4 vP; // alpha, warm, ash, atlas cell
void main() {
  vec2 cell = vec2(mod(vP.w, 2.0), 1.0 - floor(vP.w * 0.5));
  vec4 tx = texture2D(uTex, (vUv + cell) * 0.5);
  float a = tx.a * vP.x;
  if (a < 0.012) discard;
  vec3 lit = mix(uLit, uAshLit, vP.z), sh = mix(uShade, uAshShade, vP.z);
  vec3 col = mix(sh, lit, tx.r) * mix(0.8, 1.0, tx.g);
  col = mix(col, uWarm, vP.y * (1.0 - 0.55 * tx.r) * (1.0 - 0.75 * vUv.y)); // lit orange from the crater below
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

export const GLOW_FS = /* glsl */ `
varying vec2 vUv; varying vec4 vP; // rgb * intensity, alpha share
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = clamp(1.0 - r, 0.0, 1.0); a *= a * a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vP.rgb / max(vP.a, 1e-4), 1.0); // straight colour -> output space -> premultiplied
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * vP.a * a, vP.a * a);
}`;

/**
 * Lambert terrain + a warm emissive "light spill" from the lava. aHeat = (crater weight, channel id or -1,
 * position along the channel where the lava must have reached, weight). uHeatFront = 3 channel fronts + crater glow.
 */
export function terrainMaterial(map, uniforms) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, map });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aHeat;\nuniform vec4 uHeatFront;\nuniform float uTime;\nvarying float vHeat;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        float f = aHeat.y < 0.5 ? uHeatFront.x : (aHeat.y < 1.5 ? uHeatFront.y : uHeatFront.z);
        float reach = aHeat.y < -0.5 ? 0.0 : smoothstep(aHeat.z - 0.02, aHeat.z + 0.05, f);
        vHeat = aHeat.x * uHeatFront.w + aHeat.w * reach * (0.88 + 0.12 * sin(uTime * 1.6 + aHeat.z * 11.0));
      }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uHeatCol;\nvarying float vHeat;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += uHeatCol * vHeat;');
  };
  m.customProgramCacheKey = () => 'volcano-terrain';
  return m;
}
