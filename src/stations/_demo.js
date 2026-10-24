import { THREE, PAL, stageGround, vcMat, mat, roundedBox, blobShadow, smooth } from '../core/kit.js';
export default function build({ sfx }) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(stageGround({ heightFn: (x, z) => 0.05 * Math.sin(x * 2) * Math.cos(z * 2) * Math.max(0, 1 - Math.hypot(x, z) / 2.5), colorFn: (x, z, y) => (y > 0.02 ? PAL.grassLight : PAL.grass) }), vcMat()));
  const box = new THREE.Mesh(roundedBox(0.6, 0.6, 0.6, 0.08), mat(PAL.coral));
  box.position.y = 0.3; group.add(box); blobShadow(0.45, 0.45, 0.35, group);
  let playing = false, lastT = 0;
  return {
    key: '_demo', group, duration: 6,
    setProgress(t) { box.rotation.y = t * Math.PI; box.position.y = 0.3 + smooth(0.3, 0.7, t) * 0.5; if (playing && lastT < 0.5 && t >= 0.5) sfx.play('pop'); lastT = t; },
    update(dt, time) { box.scale.setScalar(1 + Math.sin(time * 3) * 0.02); },
    play() { playing = true; }, stop() { playing = false; },
    evidence: { box: { pos: new THREE.Vector3(0, 0.6, 0), radius: 0.4 } },
    thumb: { cam: [0.5, 1.6, 2.8], target: [0, 0.4, 0], t: 1 },
  };
}
