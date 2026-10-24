// Stub station (integration tests while the real dioramas are being built).
import { THREE, PAL, stageGround, vcMat, mat, roundedBox, blobShadow, smooth } from '../../src/core/kit.js';
const EV = { quake: ['crack', 'post'], volcano: ['crater', 'lava'], weather: ['cracks', 'pieces'], erosion: ['from', 'to'], human: ['digger', 'road'] };
const COL = { quake: PAL.coral, volcano: PAL.lava, weather: PAL.lav, erosion: PAL.teal, human: PAL.machine };
export function makeStub(key) {
  return function build() {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(stageGround({ colorFn: (x, z) => ((Math.floor(x * 2) + Math.floor(z * 2)) % 2 ? PAL.grass : PAL.grassLight) }), vcMat()));
    const box = new THREE.Mesh(roundedBox(0.8, 0.8, 0.8, 0.1), mat(COL[key]));
    box.position.y = 0.4; group.add(box); blobShadow(0.6, 0.6, 0.35, group);
    const evidence = {};
    EV[key].forEach((id, i) => (evidence[id] = { pos: new THREE.Vector3(i ? 1.0 : -1.0, 0.3, 0.2), radius: 0.35 }));
    return {
      key, group, duration: 5, evidence,
      setProgress(t) { box.rotation.y = t * Math.PI; box.scale.y = 1 + smooth(0.3, 0.8, t) * 0.8; box.position.y = 0.4 * box.scale.y; },
      update() {}, play() {}, stop() {},
      thumb: { cam: [0.5, 1.6, 2.8], target: [0, 0.4, 0], t: 1 },
    };
  };
}
