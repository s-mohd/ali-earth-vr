import * as THREE from 'three';
import { mergeParts, vcMat } from '../../src/core/kit.js';
export function buildAli() {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(mergeParts([
    { geo: new THREE.CapsuleGeometry(0.2, 0.55, 4, 12), color: '#ffffff', pos: [0, 0.5, 0] },
    { geo: new THREE.SphereGeometry(0.17, 16, 12), color: '#c98e62', pos: [0, 1.05, 0] },
    { geo: new THREE.SphereGeometry(0.04, 8, 6), color: '#222', pos: [0.06, 1.08, 0.15] },
    { geo: new THREE.SphereGeometry(0.04, 8, 6), color: '#222', pos: [-0.06, 1.08, 0.15] },
  ]), vcMat()));
  const head = new THREE.Object3D(); head.position.y = 1.05; group.add(head);
  const bubbleAnchor = new THREE.Object3D(); bubbleAnchor.position.y = 1.5; group.add(bubbleAnchor);
  let pose = 'idle';
  return { group, head, bubbleAnchor, setPose(p) { pose = p; }, pointAt() {}, lookAt() {}, setTalking() {}, jump() {}, update(dt, t) { group.children[0].position.y = pose === 'cheer' ? Math.abs(Math.sin(t * 6)) * 0.05 : 0; } };
}
