import * as THREE from 'three';
import { PAL } from '../../src/core/kit.js';
export function buildWorld({ scene }) {
  scene.background = new THREE.Color('#bfe3f4');
  const g = new THREE.Mesh(new THREE.RingGeometry(0.1, 60, 64).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: PAL.grass }));
  g.position.y = -0.02; scene.add(g);
  return { update() {}, setZone() {} };
}
