// Look development that stays cheap on Quest 2:
// - one sun shadow map that only covers the place the child is standing in (refit on every arrival),
// - a soft rim light on the silhouettes of objects (not on floors), which gives the "lit toy diorama" depth.
import * as THREE from 'three';
import { SUN_DIR } from './lighting.js';

const _c = new THREE.Vector3();

export function enableShadows(renderer, sun, { size = 1024 } = {}) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // hardware 2×2 compare: soft enough, cheap
  sun.castShadow = true;
  sun.shadow.mapSize.set(size, size);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.025;
  const cam = sun.shadow.camera;
  cam.near = 1; cam.far = 40;
  return sun;
}

const _d = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
/**
 * Aim the sun for the place the child stands in: the light comes from the same side of every diorama
 * (front-right, as in the sandbox where each station was lit and tuned), and the shadow box fits that place.
 * yaw = the zone frame's rotation; sky = optional { value: Vector3 } uniform of the sky's sun disc.
 */
export function aimSun(sun, center, { yaw = 0, radius = 3.4, sky = null } = {}) {
  _d.copy(SUN_DIR).applyAxisAngle(Y, yaw);
  sky?.value.copy(_d);
  _c.copy(center);
  sun.target.position.copy(_c);
  sun.position.copy(_c).addScaledVector(_d, 18);
  const cam = sun.shadow.camera;
  cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius;
  cam.updateProjectionMatrix();
  sun.target.updateMatrixWorld();
  sun.updateMatrixWorld();
}

/** Mark meshes in a subtree as shadow casters/receivers (skips sprites, particles and see-through things). */
export function shadowTree(root, { cast = true, receive = true } = {}) {
  root.traverse((o) => {
    if (!o.isMesh || o.isPoints) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.visible === false) return;
    const see = m.transparent || m.blending === THREE.AdditiveBlending || m.isMeshBasicMaterial;
    o.castShadow = cast && !see;
    o.receiveShadow = receive && !m.isMeshBasicMaterial;
  });
}

// ------------------------------------------------------------------ rim light
const RIM = { color: new THREE.Color('#fff1d6'), strength: 0.2 };
const rimUniforms = { rimColor: { value: RIM.color }, rimStrength: { value: RIM.strength } };

/** Add the rim term to a Lambert material (shared program; horizontal faces get none, so floors never glow). */
export function polish(material) {
  if (!material?.isMeshLambertMaterial || material.userData.polished) return;
  material.userData.polished = true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.uniforms.rimColor = rimUniforms.rimColor;
    sh.uniforms.rimStrength = rimUniforms.rimStrength;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;\nuniform float rimStrength;')
      .replace('#include <opaque_fragment>', `{
        vec3 V = normalize( vViewPosition );
        float rim = pow( 1.0 - clamp( dot( normal, V ), 0.0, 1.0 ), 3.0 );
        vec3 upV = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
        rim *= 1.0 - smoothstep( 0.45, 0.9, dot( normal, upV ) );
        outgoingLight += rimColor * rim * rimStrength;
      }
      #include <opaque_fragment>`);
  };
  // keep shader variants apart: a material with its own patch keeps its own key (the default key reads
  // onBeforeCompile's source, which is now this wrapper, so capture the previous patch's source instead)
  const custom = material.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? material.customProgramCacheKey.bind(material) : null;
  const base = prev ? prev.toString() : '';
  material.customProgramCacheKey = () => (custom ? custom() : base) + '|rim';
  material.needsUpdate = true;
}
export function polishTree(root) {
  root.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) polish(m);
  });
}
export function setRim(strength) { rimUniforms.rimStrength.value = strength; }
