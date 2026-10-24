// The island environment: sky (gradient + painted cumulus), sea (lagoon → deep, swell, glints, foam), terrain (meadow and
// palm oases inland, golden dunes and beach behind the stations), date palms, ghaf/sidr trees (a lone "Tree of Life" behind
// the weathering station), mangroves, a Bahraini fishing village, a gateway at the back of the hub plaza, distant islands,
// two dhows, birds, the hub plaza, the challenge-hall arcade, a landmark flag per zone and a "closed stage" cover over every
// station pit (shown whenever the game hides that diorama). Palms and static props are merged per angular sector of the island
// so frustum culling drops what is behind the viewer; only the current zone's near props are shown.
// The game re-aims the sun for every place (lookdev.aimSun → the sky's uSun): baked ground shadows are cast for the place
// each object is seen best from (env_flora.shadowStep), so they agree with the live light where it matters.
import { THREE, PAL, vcMat } from '../core/kit.js';
import { ZONE_KEYS, zoneTransform } from '../core/layout.js';
import { TIME, SEA_Y, GATE, Batch, swayMaterial, brightMaterial, sectorBatches } from './env_util.js';
import { buildTerrain, buildStageCovers } from './env_terrain.js';
import { buildSky, buildSea, buildClouds, buildBirds } from './env_sky.js';
import { planFlora, floraShadows, floraLush, buildFlora, addMangroves } from './env_flora.js';
import { addHouse, addIslands, addBeachLife, addGate, buildDhow } from './env_build.js';
import { buildAtlas, addLandmarks, landmarkFeet } from './env_marks.js';
import { addHallArcade, buildHallNear, arcadeFeet } from './env_hall.js';
import { buildNear, HUB_PLANTERS } from './env_near.js';

// a small fishing village on the west shore (seen from the hub between the volcano and weathering stations)
const VILLAGE = [
  { x: -31.2, z: -2.6, yaw: Math.PI / 2 + 0.08, w: 5, d: 4.2, h: 3.1, wall: '#f7e4c6', tower: true },
  { x: -30.6, z: 3.0, yaw: Math.PI / 2 - 0.12, w: 4.2, d: 3.8, h: 2.8, wall: PAL.wallB, upper: true },
  { x: -32.6, z: 0.4, yaw: Math.PI / 2 - 0.05, w: 3.6, d: 3.2, h: 2.5, wall: PAL.wallC },
];

/**
 * @param {{ scene: THREE.Scene, frames?: object, quality?: 'high' | 'low' }} opts
 * Everything lives under one 'world' group; zone transforms come from core/layout.js (the frames are left untouched).
 * Returns { root, hallAnchors, setZone(key), update(dt, time) }.
 */
export function buildWorld({ scene, quality = 'high' }) {
  const root = new THREE.Group();
  root.name = 'world';
  scene.add(root);
  const fogColor = scene.fog?.color ?? new THREE.Color('#d8eef7');

  const plan = planFlora(quality);
  const shadows = [...floraShadows(plan), ...VILLAGE.flatMap((h) => [{ x: h.x, z: h.z, r: Math.max(h.w, h.d) * 0.75, k: 0.3 }, { x: h.x + 1.2, z: h.z - 1.0, r: 3.6, k: 0.3 }])];
  shadows.push(...arcadeFeet(), ...landmarkFeet(), ...[-1, 1].map((sx) => ({ x: GATE.x + sx * 1.26, z: GATE.z, r: 0.9, k: 0.4 })), ...HUB_PLANTERS.map(([x, z]) => ({ x, z, r: 0.75, k: 0.45 })));
  const lush = [...floraLush(plan), ...VILLAGE.map((h) => ({ x: h.x + 2.5, z: h.z, r: 6 })), { x: 0, z: 0, r: 8.5 }];
  root.add(buildSky(fogColor), buildSea(), buildTerrain({ shadows, lush }), buildStageCovers());

  // static props per sector (bushes, rocks, houses, landmark poles); far islands in one mesh; the hall arcade (self-lit:
  // its inner faces look away from the sun); all cloth (flags, bunting, hall sign) in one textured sway mesh
  const stat = sectorBatches(), far = new Batch(), arcade = new Batch(), cloth = new Batch(true, true);
  root.add(...buildFlora(plan, stat));
  // the village shares the self-lit arcade mesh: whitewashed walls stay bright on their shaded sides
  for (const h of VILLAGE) addHouse(arcade, h.x, h.z, h.yaw, h);
  addBeachLife(stat.pick(33, 0), 33, 0, Math.PI / 2);
  addGate(stat.pick(GATE.x, GATE.z), GATE.x, GATE.z, 0);
  addMangroves(stat);
  addLandmarks(stat, cloth);
  addHallArcade(arcade, cloth);
  addIslands(far);
  const statMat = vcMat();
  stat.list.forEach((b, i) => { if (!b.count) return; const m = new THREE.Mesh(b.build(), statMat); m.name = 'props:' + i; root.add(m); });
  const farMesh = new THREE.Mesh(far.build(), statMat);
  farMesh.name = 'islands';
  const arcadeMesh = new THREE.Mesh(arcade.build(), brightMaterial(0.2));
  arcadeMesh.name = 'arcade+village';
  const clothMesh = new THREE.Mesh(cloth.build(), swayMaterial('cloth', { map: buildAtlas() }));
  clothMesh.name = 'cloth';
  root.add(farMesh, arcadeMesh, clothMesh);

  const clouds = buildClouds();
  const birds = buildBirds(quality === 'low' ? 4 : 7);
  // two dhows riding at anchor off the island (one seen from the quake/volcano side, one from the erosion/human side)
  const dhows = [[-121, 60, 1, buildDhow()], [52, 72, 0.85, buildDhow({ sail: ['#fff3dc', '#ecdcc0'], stripe: '#d88d60' })]].map(([deg, r, sc, mesh], i) => {
    const a = (deg * Math.PI) / 180;
    mesh.position.set(Math.cos(a) * r, SEA_Y, Math.sin(a) * r);
    mesh.rotation.order = 'YXZ';
    mesh.scale.setScalar(sc);
    root.add(mesh);
    return { mesh, yaw: -a + Math.PI + i * 0.9, ph: i * 2.1 };
  });
  root.add(clouds, birds.mesh);

  // near props: one mesh per zone, plus the hall's stage props and anchors
  const near = {};
  for (const k of ZONE_KEYS) { if (k !== 'hall') { near[k] = buildNear(k); root.add(near[k]); } }
  const hallT = zoneTransform('hall');
  const hall = new THREE.Group();
  hall.name = 'hall';
  hall.position.copy(hallT.pos);
  hall.rotation.y = hallT.yaw;
  const hallNear = buildHallNear();
  near.hall = hallNear.mesh;
  hall.add(hallNear.mesh); // the anchors are children of the near mesh, so they hide with it
  root.add(hall);

  function setZone(key) {
    for (const k in near) near[k].visible = k === key;
  }
  setZone('hub');

  return {
    root,
    hallAnchors: hallNear.anchors,
    setZone,
    update(dt, time) {
      TIME.value = time;
      clouds.rotation.y = time * 0.0012;
      birds.update(time);
      for (let i = 0; i < dhows.length; i++) {
        const d = dhows[i];
        d.mesh.position.y = SEA_Y + 0.06 * Math.sin(time * 0.9 + d.ph);
        d.mesh.rotation.set(0.025 * Math.sin(time * 0.7 + 1 + d.ph), d.yaw, 0.035 * Math.sin(time * 0.9 + d.ph));
      }
    },
  };
}
