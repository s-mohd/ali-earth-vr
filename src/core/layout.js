// World layout: one hub in the middle, five stations and the challenge hall on a ring around it.
// Every zone is a frame (Group). The viewer stands on the frame origin and faces the frame's local -Z.
import * as THREE from 'three';

export const RING = 17; // meters from the hub to each outer zone
export const ZONE_KEYS = ['hub', 'quake', 'volcano', 'weather', 'erosion', 'human', 'hall'];
export const OUTER = ['quake', 'volcano', 'weather', 'erosion', 'human', 'hall'];

/**
 * Where a station diorama sits inside its zone frame (diorama origin = centre of its ground disc).
 * Stations are authored at radius 2.72 (station-local); the game may shrink them by `scale` to bring them closer.
 * z keeps the plinth's front edge ~0.7 m from the viewer's pad.
 */
const STAGE_SCALE = 1;
export const STAGE = { radius: 2.72, scale: STAGE_SCALE, z: -(0.7 + (2.72 + 0.2) * STAGE_SCALE) };
/** Flat ground radius the environment keeps around every zone origin and diorama centre. */
export const FLAT_RADIUS = 7.5;

/** Ring angle of an outer zone (radians). Zone i faces outward, away from the hub, toward the sea. */
export function zoneAngle(key) { return OUTER.indexOf(key) * (Math.PI / 3); }

/** Pure data form (used by the environment builder before frames exist). */
export function zoneTransform(key) {
  if (key === 'hub') return { pos: new THREE.Vector3(0, 0, 0), yaw: 0 };
  const a = zoneAngle(key);
  return { pos: new THREE.Vector3(-Math.sin(a) * RING, 0, -Math.cos(a) * RING), yaw: a };
}

export function buildFrames(scene) {
  const frames = {};
  for (const key of ZONE_KEYS) {
    const f = new THREE.Group();
    f.name = 'zone:' + key;
    const { pos, yaw } = zoneTransform(key);
    f.position.copy(pos);
    f.rotation.y = yaw;
    scene.add(f);
    f.updateMatrixWorld(true);
    // the viewer anchor (stand here, face -Z)
    const anchor = new THREE.Object3D();
    anchor.name = 'anchor:' + key;
    f.add(anchor);
    f.userData.anchor = anchor;
    frames[key] = f;
  }
  return frames;
}

/**
 * UI placement adapts to the viewer's eye height (children are short; some play seated).
 * eye: eye height above the virtual floor (m); vz: the viewer's z in the zone frame (0 in the headset;
 * on screens the camera stands a little behind the pad so the side boards and Ali fit in the picture).
 */
export function uiHeights(eye = 1.32, vz = 0) {
  const e = Math.max(0.9, Math.min(1.75, eye));
  return {
    eye: e,
    vz,
    console: Math.max(0.6, Math.min(1.15, e - 0.48)), // waist-height control desk
    board: Math.max(1.05, Math.min(1.6, e + 0.02)), // info board centre
    cards: Math.max(0.85, Math.min(1.5, e - 0.18)), // answer cards centre
  };
}
