# مغامرة المستكشف علي — Earth Changes VR (rebuild)

An Arabic (RTL) science game for Grade 3 (Bahrain, lesson «الأرض تتغيّر»), built to run at a steady 72 fps in the
**Meta Quest 2 browser** (WebXR immersive-vr) and also on desktop/tablet screens. The output is ONE self-contained HTML
file (`dist/index.html`, built by `node build.mjs`) with Three.js r186, CSS, fonts and all code inline: no network at runtime.

Workspace root (W): this folder. Node 22, `three@0.186.1`, `esbuild`, `playwright` are installed in `node_modules`.
Reference material: `ref/v1_app.js` (beautified V1 code), `ref/v2_full.html` (V2), screenshots in `shots/v1_*.png`,
`shots/v2_*.png`, `shots/xr_*.png` (inside an emulated Quest 2), and reviews in `review/*.md` (when present).

## The game in one paragraph
The child arrives in a **hub** on a small Bahraini island (sea, date palms, Bahraini houses). Ali, a young Bahraini explorer,
welcomes them, teaches pointing with a 3-star tutorial, and shows a **map table** and an **explorer passport** with 5 empty
stamps. Each of 5 **stations** (الزلزال، البركان، التجوية، التعرية، تغييرات الإنسان) is a living **diorama** on a round
plinth in front of the child. Flow per station: Ali's intro → **Watch** (the simulation plays 8–14 s with captions; replay;
before/after scrub) → **Find the evidence** (2 glowing hotspots on the diorama; the child points at each, a label pops up and Ali
explains) → definition card + **stamp** in the passport (+ a practice question at التجوية and التعرية, and a weathering vs
erosion comparison at التعرية) → next station. After 5 stamps the **challenge hall** opens: 5 picture questions (pictures are
live renders of the dioramas), instant feedback, pass mark 4/5, results with stars, and a certificate (shown on an easel in VR
and downloadable on screen). A teacher dashboard (screen only) lists attempts with CSV export.

## Coordinate conventions (all modules)
- Meters. +Y up. Three.js right-handed. The viewer always faces **-Z** of the current zone frame. +X is the viewer's right.
- Zones (see `src/core/layout.js`): `hub` at the origin; `quake, volcano, weather, erosion, human, hall` on a ring of
  radius 17 m, each frame rotated so its -Z points outward (toward the sea).
- In a station zone the viewer stands on the frame origin. The station diorama group is placed at frame-local
  `(0, 0.15, -3.6)` (a raised plinth; the game adds a stone rim ring of radius ~2.85 m, top at y≈0.17).
  So **inside a station module the viewer's eyes are at about (0, 1.05..1.15, +3.6) station-local** (child eye height
  1.2–1.3 m above the floor, minus the 0.15 plinth), looking toward -Z. The diorama must read well from there.
- Ali stands ON the plinth's front-right corner at station-local `(1.65, ground, 1.5)` facing the viewer; the info board stands
  on the front-left corner at station-local `(-1.7, ground, 1.45)`. The control console floats at waist height ~0.75 m in front
  of the viewer. Keep the diorama's important action inside x ∈ [-2.2, 2.2], keep those two front corners (x > 1.3 & z > 0.9,
  and x < -1.3 & z > 0.9) nearly flat and free of objects taller than ~0.1 m.

## Shared kit (use it; do not re-invent)
`src/core/kit.js` exports: `THREE`, `PAL` (palette — use it so everything matches), `rng(seed)`, `clamp`, `lerp`, `seg(t,a,b)`,
`smooth(a,b,t)`, `ease.{linear,inOut,out,in,outBack,outElastic}`, `noise2`, `fbm`, `mat(color, opts)` (cached Lambert; pass
`unique:true` if you animate it), `vcMat()` (vertex-color Lambert), `basic(color, opts)` (unlit), `paint`, `gradient`, `place`,
`mergeParts([{geo,color,pos,rot,scale}])` / `mergedMesh(parts)` (many coloured parts → ONE draw call), `roundedBox(w,h,d,r)`,
`blobGeo(radius,{detail,jitter,seed,squash,flat})`, `canvas`, `canvasTexture`, `blobShadow(rx,rz,opacity,parent,pos)`,
`puffTexture()` (soft sprite), `stageGround({radius,rings,segments,depth,heightFn,colorFn,skirtColor})` (displaced round
ground with a skirt — every station must use it or an equivalent for its ground).
`src/core/tween.js`: `tween(dur, fn, easing)`, `wait(s)`, `onFrame(fn)`. `src/core/ui.js`: `labelMesh(text, opts)`, `drawText`,
`setFont`, `FONT`, `Panel`, `Button`, `Card`, `Bubble`, `drawIcon`. `src/core/lighting.js`: one hemisphere + one directional
light (no shadow maps). `src/core/layout.js`: zones and the numbers above.

## Performance budget (Quest 2, 72 fps, both eyes) — hard rules
- Whole frame: ≤ 120 draw calls and ≤ 180k triangles. Shares: environment ≤ 40 calls / 70k tris visible from any zone;
  one station ≤ 40 calls / 40k tris at any t; Ali ≤ 8 calls / 8k tris; UI the rest.
- Materials: `MeshLambertMaterial` / `MeshBasicMaterial` (kit `mat`, `vcMat`, `basic`) or a small custom `ShaderMaterial`
  only when it clearly pays off. **No** MeshStandard/Physical, **no** shadow maps (use `blobShadow`), no post-processing,
  no `scene.environment`, no transmission/refraction, no real-time reflections.
- Merge static parts with `mergeParts` (vertex colours). Use `InstancedMesh` for many repeats (rocks, pebbles, particles).
- Transparent objects: few and small (overdraw is the Quest's enemy). Particles: ≤ 300 instances per system, ≤ 2 systems.
- Textures: canvas textures only, ≤ 1024² each, ≤ 2 per module. No image files, no network.
- Per frame: no allocations in `update`/`setProgress` (reuse `Vector3`s/arrays), no geometry rebuilds; attribute updates
  only on small buffers (< 5k vertices) and only when a value changed. `setProgress` ≤ 1 ms, `update` ≤ 0.5 ms on desktop.
- Determinism: `setProgress(t)` must be a pure function of t (use `rng(seed)` built once at construction, never `Math.random()`
  inside `setProgress`). The game scrubs back and forth (before/after), renders thumbnails at a fixed t, and replays.

## Comfort rules (VR)
- The viewer is never moved by a module. No camera shake. The earthquake shakes the **diorama**, never the player.
- No bright full-screen flashes; no fast oscillation of large areas (> 3 Hz) — the quake shake is fine at diorama scale with
  small amplitude (≤ 4 cm) and short bursts.
- Text in the world: minimum 0.06 m letter height at 1.5 m. Labels face the viewer (yaw only).

## Art direction (best of V1 + V2)
Warm, soft, toy-like but believable; a "living museum diorama". Rounded shapes, vertex-coloured gradients, gentle ambient
life (water shimmer, smoke drift, swaying palms, birds). Bahraini touches: flat-roofed houses with crenellated parapets and a
wind-tower (barjeel), date palms with dates, arish fences, sand + grass, turquoise sea, a dhow on the sea. Colours from
`PAL`; the key science element in each station must be the highest-contrast thing in view (the crack, the lava, the pieces,
the moving soil, the new road). Child-safe: no scary destruction, no people hurt, nothing on fire except lava.

## Module contracts

### Station — `src/stations/<key>.js`, keys: quake, volcano, weather, erosion, human
```js
import { THREE, PAL, ... } from '../core/kit.js';
export default function buildStation(ctx) {   // ctx = { sfx, quality: 'high' | 'low' }
  return {
    key: 'quake',
    group,             // THREE.Group: origin = centre of the diorama ground (y = 0 is the ground surface); viewer at (0,~1.1,+3.6)
    duration: 12,      // seconds for t 0→1 at normal speed (8–14 s)
    setProgress(t) {}, // REQUIRED: full visual state at t ∈ [0,1]; t = 0 "before", t = 1 "after" (final state stays readable)
    update(dt, time) {}, // ambient life only (never the story state); also called while idle
    play() {}, stop() {}, // playback start/end: start/stop looping sounds; one-shots fire in setProgress only while playing,
                          // when t crosses a threshold upward (track the previous t)
    evidence: { <id>: { pos: THREE.Vector3 /* group-local, at t = 1 */, radius: 0.25..0.5 } }, // ids from src/game/content.js
    thumb: { cam: [x, y, z], target: [x, y, z], t: 1 },  // group-local camera for a 4:3 quiz picture that reads instantly
    dispose() {},
  };
}
```
- The ground: a round area of radius 2.72 built with `stageGround` (skirt down to y = -1). Height must be ≈ 0 for r > 2.55
  so it meets the rim. Anything dug below y = 0 must be closed by your own geometry (walls/floor).
- The game hides the whole group when the child is elsewhere, so do not rely on being visible all the time.
- Evidence: the game draws glowing rings + hit spheres at your `evidence[id].pos` after the simulation; positions must sit on
  the visible feature at t = 1 and be ≥ 0.6 m apart.
- `ctx.sfx` API (implemented in `src/core/audio.js`, stubbed in the sandbox): `sfx.play(name, {gain, rate, pan})` and
  `const h = sfx.loop(name, {gain, rate}); h.set({gain, rate}); h.stop()`.
  One-shot names: `click hover correct wrong stamp whoosh pop sparkle fanfare unlock found crack thud boom rockBreak splash drip
  beep chime`. Loop names: `rumble lava water rain wind engine ambience music`. Use only these names.
- Check your work: `node tools/snap.mjs station <key>` → screenshots + `sheet.png` + stats JSON in `shots/sb/<key>/`.
  Look at the sheet (Read the PNG) and iterate until it is beautiful, clear and within budget.

### Ali — `src/world/ali.js`
```js
export function buildAli() → {
  group,               // feet at origin, faces +Z, height ≈ 1.2 m (a Bahraini boy of ~9)
  head,                // Object3D (the game reads its world position)
  bubbleAnchor,        // Object3D ~0.3 m above the head top (speech bubble tail tip)
  setPose(name),       // 'idle' | 'wave' | 'point' | 'present' | 'cheer' | 'think' | 'clap' — smooth blend (~0.3 s)
  pointAt(worldVec3 | null), // with 'point': right arm aims at that world position
  lookAt(worldVec3 | null),  // head/eyes turn toward it (clamped to natural limits); null = look at the viewer (camera)
  setTalking(bool),    // mouth animation while talking
  jump(),              // small happy hop (used on stamps / correct answers)
  update(dt, time),    // idle breathing, blinking, pose blending
}
```
Use `buildAli({ getViewer: () => Vector3 })` if you need the viewer position for the default look target (optional argument).
Check: `node tools/snap.mjs ali`.

### Environment — `src/world/world.js`
```js
export function buildWorld({ scene, frames, quality }) → {
  update(dt, time),    // water, clouds, birds, palms sway
  setZone(key),        // show near props of that zone only (perf); far scenery always visible
  hallAnchors: { stage: Object3D, easel: Object3D, podium: Object3D }, // optional props in the hall frame
}
```
Builds: sky dome (gradient, sun), clouds, sea (cheap animated), the island terrain (one merged mesh, vertex colours) with
beach and paths from the hub to each zone, date palms, bushes, rocks, flowers, distant islands, a dhow, birds, the hub plaza
(paved circle ≈ 3 m radius, decorative), the challenge hall surroundings (arches, bunting, seats), and a landmark per zone
(coloured flag/totem with the station's colour) visible from the hub. Terrain must be flat (y = 0) within 7.5 m of every
zone origin, and have a pit (y ≤ -0.9) under every station plinth: a disc of radius (STAGE.radius + 0.2)·STAGE.scale + 0.05 centred at zone-local (0, STAGE.z) — read both from src/core/layout.js.
Nothing tall within 4.5 m of a zone origin except behind the diorama (z < -6.5 zone-local) or far to the sides
(|x| > 3.5): the child must see the diorama, Ali (right) and the board (left) unobstructed.
Check: `node tools/snap.mjs world`.

### Audio — `src/core/audio.js`
```js
export function createAudio() → { unlock(), setEnabled(bool), setMusic(bool), duck(bool), ambience(zoneKey),
  play(name, {gain, rate, pan}), loop(name, {gain, rate}) → { set({gain, rate}), stop() },
  click(), hover(), correct(), wrong(), stamp(), whoosh(), pop(), sparkle(), fanfare(), unlock(), found() }
```
Procedural WebAudio only (no files). All names listed in the station contract must exist. `unlock()` only resumes the audio context
(the jingle is `play('unlock')`); also `stopLoops()`, `dispose()`, `loopHandle.stop(fadeSeconds)`. `setEnabled(false)` mutes everything
including music; `setMusic()` controls the music only.

### Shell (HTML overlay) — `src/index.html`, `src/styles.css`, `src/shell/*.js`
Start screen, settings, VR entry/safety, teacher dashboard, certificate download. See the shell agent brief.

## Testing hooks
`?test` exposes `window.__ali` (state + actions) and `?speed=N` speeds up the game clock. The IWER emulator
(`../xremu/node_modules/iwer/build/iwer.min.js`) emulates a Quest 2 in Playwright (`tools/xr_probe_v1.mjs` shows how).
