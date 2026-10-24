// One shared light rig (no shadow maps: stations use kit.blobShadow). Same in the game, the sandbox and thumbnails.
import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(0.55, 0.85, 0.35).normalize();

export function addLights(scene) {
  const hemi = new THREE.HemisphereLight('#e3f3ff', '#cdb68e', 1.7);
  const sun = new THREE.DirectionalLight('#fff2dc', 1.55);
  sun.position.copy(SUN_DIR).multiplyScalar(60);
  scene.add(hemi, sun, sun.target);
  scene.fog = new THREE.Fog('#d8eef7', 70, 260);
  return { hemi, sun };
}
