// Station 5 helpers: the "story" material (everything that appears, grows or is dug away is ONE merged mesh whose
// vertex shader shows each piece at its own moment — the whole build is a pure function of two uniforms, no CPU work),
// its matching shadow-depth material, and the ground material that turns natural land into graded earth as hills go.
import { THREE, mergeParts } from '../core/kit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** piece modes (aPop.z) */
export const POP = 0, RISE = 1, GROW = 2, HILL = 3, ON_HILL = 4, STATIC = 5;

/**
 * One story piece: coloured parts merged, plus per-vertex story attributes.
 *  anchor: [x,y,z] pivot (station-local) the piece scales about
 *  t: [t0, t1] (POP/RISE/GROW: when it appears; ON_HILL: the hill level range over which it shrinks away)
 *  HILL bodies scale in y about y = -0.02 (anchor [0,-0.02,0]) so a flattened hill hides just under the ground
 *  mode, k (hill index for HILL/ON_HILL), glow (0..1 self-light, for lamps, markings and the sign face)
 */
export function piece(parts, { anchor = [0, 0, 0], t = [-2, -1], mode = STATIC, k = 0, glow = 0 } = {}) {
  const g = Array.isArray(parts) ? mergeParts(parts) : parts;
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3), p = new Float32Array(n * 4), gl = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    a[i * 3] = anchor[0]; a[i * 3 + 1] = anchor[1]; a[i * 3 + 2] = anchor[2];
    p[i * 4] = t[0]; p[i * 4 + 1] = t[1]; p[i * 4 + 2] = mode; p[i * 4 + 3] = k;
    gl[i] = glow;
  }
  g.setAttribute('aAnchor', new THREE.BufferAttribute(a, 3));
  g.setAttribute('aPop', new THREE.BufferAttribute(p, 4));
  g.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1));
  return g;
}
export function mergePieces(list) {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const m = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return m;
}

const STORY_GLSL = /* glsl */`
attribute vec3 aAnchor;
attribute vec4 aPop;
attribute float aGlow;
uniform float uStoryT;
uniform vec3 uLevels;
varying float vHGlow;
vec3 hScale; vec3 hAnchor;
float hOutBack(float x) { float y = x - 1.0; return 1.0 + 2.70158 * y * y * y + 1.70158 * y * y; }
float hLevel(float k) { return k < 0.5 ? uLevels.x : (k < 1.5 ? uLevels.y : uLevels.z); }
void hStory() {
  float mode = aPop.z;
  hAnchor = aAnchor;
  hScale = vec3(1.0);
  if (mode < 2.5) {
    float u = clamp((uStoryT - aPop.x) / max(aPop.y - aPop.x, 1e-5), 0.0, 1.0);
    if (mode < 0.5) hScale = vec3(hOutBack(u));
    else if (mode < 1.5) { float w = mix(0.86, 1.0, u); hScale = vec3(w, hOutBack(u), w); }
    else hScale = vec3(1.0, u * u * (3.0 - 2.0 * u), 1.0);
    if (u <= 0.0) hScale = vec3(0.0);
  } else if (mode < 4.5) {
    float L = hLevel(aPop.w);
    if (mode < 3.5) hScale = vec3(1.0, L, 1.0);
    else { float s = smoothstep(aPop.x, aPop.y, L); hScale = vec3(s); hAnchor.y = (aAnchor.y + 0.02) * L - 0.02; }
  }
}
`;

/** shared uniforms of the story mesh */
export function storyUniforms() { return { uStoryT: { value: 0 }, uLevels: { value: new THREE.Vector3(1, 1, 1) } }; }

/** Lambert (vertex colours) with the story transform; returns { material, depth } (depth = matching shadow caster). */
export function storyMaterials(U) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + STORY_GLSL)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        hStory();
        objectNormal = normalize(objectNormal * vec3(hScale.y * hScale.z, hScale.x * hScale.z, hScale.x * hScale.y) + vec3(0.0, 1e-6, 0.0));
        vHGlow = aGlow;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = hAnchor + (transformed - aAnchor) * hScale;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vHGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vHGlow;');
  };
  material.customProgramCacheKey = () => 'human-story';
  const depth = new THREE.MeshDepthMaterial();
  depth.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + STORY_GLSL)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nhStory();\ntransformed = hAnchor + (transformed - aAnchor) * hScale;');
  };
  depth.customProgramCacheKey = () => 'human-story-depth';
  return { material, depth };
}

/**
 * Ground: vertex colours, plus graded earth where hills were dug (aDig = each hill's footprint, aGrade = the graded colour),
 * a soft contact shade around the hills while they stand, and one for buildings that appear at the end (aAO × uBuilt).
 */
export function groundMaterial(U) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aDig;\nattribute vec3 aGrade;\nattribute float aAO;\nuniform vec3 uLevels;\nuniform float uBuilt;')
      .replace('#include <color_vertex>', `#include <color_vertex>
        float hDug = max(max(aDig.x * (1.0 - uLevels.x), aDig.y * (1.0 - uLevels.y)), aDig.z * (1.0 - uLevels.z));
        float hAO = max(max(aDig.x * uLevels.x, aDig.y * uLevels.y), aDig.z * uLevels.z); // contact shade around standing hills
        vColor.rgb = mix(vColor.rgb, aGrade, hDug) * (1.0 - aAO * uBuilt) * (1.0 - 0.16 * hAO);`);
  };
  m.customProgramCacheKey = () => 'human-ground';
  return m;
}
