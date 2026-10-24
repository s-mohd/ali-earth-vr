# VR / Meta Quest 2 review: «مغامرة المستكشف علي» V1 vs V2

Reviewer focus: WebXR engineering, Quest 2 performance, VR UX and comfort for 8–9-year-old students.
Sources: `ref/v1_app.js` (beautified V1 app; three.js r186 internals use minified names) and `ref/v2.html` (V2 mini-engine plus app). All line numbers refer to those two files. Measurements come from both builds running in headless Chromium with a WebXR emulation of a Meta Quest 2.

---

## 0. TL;DR

| Area | V1 (three.js r186) | V2 (custom WebGL2 engine) | Verdict for new build |
|---|---|---|---|
| World scale in VR | About 2× life size. Ali is **2.49 m** tall and buttons are 2.4–4.9 m wide | Metric. Ali is **1.42 m** tall and buttons are 0.34–0.8 m | Take V2's scale: author in meters |
| Where the student stands | Reuses the desktop camera framing (`placeVR`, 9332). Station content is 10.7–18.6 m away, and **at the welcome gate the student is placed 2.8 m below sea level** | Fixed viewing pads with a lectern at 1.32 m, the board at 4.1–4.4 m and the diorama at 5.1 m | Take V2's pad idea, but move content closer (diorama 1.4–1.8 m) |
| Speech bubble in VR | **Broken.** Faces the wrong way, edge-on or culled from behind (measured facing dot −0.99 to 0.88) | Correct: world-locked, sits beside Ali | Yaw-only billboard computed from the real head pose |
| Draw calls per XR frame (both eyes) | 284–1118 (shadow pass included) | 766–800 (no frustum culling) | Budget ≤ 250 |
| Triangles per XR frame | 554k–830k | ~1.17–1.19 M (one merged 448k-triangle environment mesh drawn per eye) | Budget ≤ 300k |
| Shading | MeshStandard on about 470 meshes, PCF 2048 shadows, ACES tone mapping | One cheap toon/hemisphere ubershader, no shadows, but every textured mesh is blended | Lambert/Basic, no real-time shadows, opaque UI |
| Input | Ray + trigger. No snap turn, haptics or hand features | Ray + trigger + pinch, gaze-dwell fallback, 30° snap turn (cooldown bug) | Take V2's input and fix it; add haptics |
| HTML-only features lost in VR | Map, sound toggle, certificate, teacher view, toasts, listen-again button | Sound/voice toggles, help, toasts | Every in-session function must exist in 3D |
| Session lifecycle | No visibility, blur or recenter handling. Session can be left hanging on failure | Same gaps. Controller grip meshes leak after exit | Full lifecycle handler (§6.8) |
| Safety copy | VR info dialog: 10+ with parent account, 10–15 min, adult supervision (8463) | Teacher `<details>`: supervision, 10–15 min (103–107) | Both texts plus an in-VR break timer |

**Bottom line:** V2 is the better VR foundation: metric scale, VR-first pads, a lectern, pinch and gaze input, snap turn, and correct world-locked UI. V1 has the richer art and the more complete desktop experience, but its VR mode reuses desktop framing and fails in VR (giant scale, wrong spawn, broken bubble, far targets). Neither version fits Quest 2's frame budget. Draw calls and triangles have to drop by about 3–4×.

---

## 1. Method

1. **Static read** of the XR code paths:
   - V1: `pd` renderer (9–25), adaptive DPR `md` (27–50), interaction manager `tf` (1133–1290), XR manager `vf` (1834–1940), `travel`/`placeVR`/`onXRChange` (9251–9346, 9928–9937), loop (10312–10330).
   - V2: `Material` (270–284), `Renderer` (581–712), UIK (755–990), layout (1620–1760), navigation (1773–1850), WebXR (1985–2059), loop (2086–2117).
2. **Emulated Quest 2 runs.** Each build ran inside a real `immersive-vr` session using Meta's **IWER 2.4.0** (`metaQuest2` profile, 2 views, Touch controllers, `local-floor`). The headset sat at **1.2 m eye height** (grade-3 standing). For every place I recorded draw calls and triangles per XR frame, head pose, every hit-testable target (distance, elevation, angular size), every visible canvas text mesh (pixels per meter, texels per degree), and bubble and Ali orientation. Screenshots were taken through the emulated eyes.
   - Scripts: `tools/xr_probe_v1.mjs`, `xr_probe_v1b.mjs` (practice, quiz, results), `xr_probe_v2.mjs`, `*_stereo.mjs`, `xr_views_check.mjs`, `tri_breakdown.mjs`, `v1_station_dist.mjs`.
   - Raw data: `tools/xr_probe_*.json`, `tools/tri_breakdown.json`.
   - Screenshots: `shots/xr_v1*_*.png`, `shots/xr_v2*_*.png`.
   - IWER is installed separately at `scratchpad/xremu/node_modules/iwer` and can be reused for the new build's VR regression tests.
3. **Caveat.** SwiftShader cannot measure Quest GPU time. All performance statements are counts (draws, triangles, textures, programs, blended draws) compared against Quest 2 budgets. Real-device profiling on Quest 2 is still required, using OVR Metrics Tool and `chrome://inspect`.

Quest 2 reference facts used below:
- 1832×1920 LCD per eye, about 97°×93° FOV, so about 20 px/deg at the panel center.
- Default WebXR eye buffer at framebufferScale 1.0 is about 1440×1584, so plan for **about 16 px/deg effective**.
- 72 Hz default, which means a 13.9 ms frame.
- Adreno 650, 6 GB RAM.
- IPD lens positions are 58, 63 and 68 mm only.

---

## 2. Session setup

| | V1 | V2 |
|---|---|---|
| Request | `requestSession('immersive-vr', {optionalFeatures:['local-floor','bounded-floor']})` (1900–1902). No `hand-tracking`, no `layers` | `optionalFeatures:['local-floor','bounded-floor','hand-tracking']` (1994) |
| Reference space | `setReferenceSpaceType('local-floor')` then `setSession` (1903–1904). **r186 has no fallback**: `WebXRManager.js:526` simply awaits `requestReferenceSpace(referenceSpaceType)`. If that throws, V1's `catch` (1917–1918) shows a toast but **never ends the session**, so the student is stuck in a frozen immersive session | Tries `local-floor`, then falls back to `local` + 1.25 m rig height (1998, 1991). Good. A failure after `requestSession` still leaves the session open (no `session.end()`) |
| Layer | three r186 uses an XRProjectionLayer when available, otherwise XRWebGLLayer (`WebXRManager.js:439–518`). MSAA 4× comes from `antialias:true` (9–10; `WebXRManager.js:512`) | `XRWebGLLayer(..., {antialias:true, framebufferScaleFactor:1.0})` (1996). No layers API |
| Foveation | three default **1.0 (maximum)** (`WebXRManager.js:46–47`, applied at :523). Never changed. Maximum foveation visibly blurs peripheral text panels | Not set (browser default) |
| Framebuffer scale | three default 1.0 (`WebXRManager.js:42`). Fine | 1.0. Fine |
| depthNear/Far | Taken from the camera (`WebXRManager.js:740–760`): **0.1 / 1200** (10139). A ratio of 12,000 wastes depth precision; the far plane is 3× past the fog end (430, 3736) | 0.05 / 400 (1997). OK |
| Frame rate | Not set, so 72 Hz | Not set, so 72 Hz |
| Animation loop | `setAnimationLoop` (10312). Correct. Shaders precompiled with `compileAsync` (10304). Good | `session.requestAnimationFrame(loop)` (2090). Correct |
| Adaptive quality | `md` lowers DPR on desktop but **returns early while presenting** (35–36), so there is no dynamic quality in VR | None |
| `offerSession` / system Enter-VR pill | No | No |

---

## 3. Rendering cost on Quest 2 (measured)

### 3.1 Per-frame counts inside the emulated Quest 2 session (two views)

| Place | V1 draw calls | V1 triangles | V2 draw calls (2×) | V2 triangles (2×) |
|---|---|---|---|---|
| Welcome / hub | **1070–1118** | 817k–830k | 784 | 1.18 M |
| Station 1 (earthquake) | 416 | 578k | 800 | 1.19 M |
| Station 2 (volcano) | 284 | 554k | 800 | 1.19 M |
| Station 3 (weathering) | 286–303 | 570k | 800 | 1.19 M |
| Station 4 (erosion) | 292 | 617k | 800 | 1.19 M |
| Station 5 (human) | 489 | 614k | 800 | 1.19 M |
| Challenge gate / hall | 530–547 | 612k–627k | 766–784 | 1.17 M |
| Results | 434 | 605k | — | — |

The V1 numbers come from `renderer.info` and include the shadow pass. `xr_views_check.mjs` confirmed that `xr.getCamera().cameras.length === 2`, so these are stereo totals. The V2 numbers are `drawCalls()` × 2, because its `drawScene` runs once per view (2103–2108).

**What dominates the cost:**
- **V2:**
  - One merged environment mesh of **447,884 triangles** (`G.merge(items)` at 1131: 90 bushes × 3 `G.sphere(1,12,9)`, 70 trees and palms, hills, and so on).
  - `collect()` (661–669) has **no frustum culling**, so the whole island, including everything behind the student, is drawn twice per frame.
  - 14 clouds of about 3.4k triangles each.
  - Every textured material is forced to be transparent (`this.transparent = ... || !!o.map`, 275). That gives **48–56 blended draws per eye**, all canvas panels.
  - Back-face culling is disabled globally (679), and opaque objects are not sorted front to back.
  - The JavaScript loop allocates matrices per draw and per frame (`m4.create()` in 1991, 2027–2036, 2094, 2100–2105), which causes GC hitches on Quest.
  - Single program, about 12 uniform uploads per draw (692–711).
- **V1:**
  - A 168×168 terrain grid of **56k triangles**.
  - About 470 visible `MeshStandardMaterial` meshes (`Z()` cache, 2316–2327; buttons are also Standard, 2600–2660).
  - **391 shadow casters** with a 2048² PCF sun shadow updated every frame (3718–3735; `shadowMap.type = 1`, 17–18).
  - ACES tone mapping (`toneMapping = 4`, 15).
  - **31 shader programs**.
  - 20 InstancedMeshes, which is good.
  - The welcome view sees the whole island (>1000 draws).

### 3.2 Fragment and fill cost

- **V1:** PBR (Standard) plus shadow sampling, hemisphere and directional lights, fog and ACES on every pixel of 2×1440×1584 at 72 Hz. This is the single largest GPU risk. Canvas UI uses `Bf()` = transparent `MeshBasicMaterial` (2329–2331).
- **V2:** a cheap toon band plus hemisphere ubershader (545–575). Still `highp` for every fragment, with per-pixel rim and fog terms and uniform-driven branching. Affordable, but 50+ blended panels and no culling erase that advantage.

### 3.3 Textures

| | Canvas textures | Size if all uploaded (with mips) | Largest | GPU-resident at once |
|---|---|---|---|---|
| V1 | 55–56 | **≈ 94 MB** | 2200×670 (challenge hall), 1320×1000 boards | 22–39 (`renderer.info.memory.textures`) |
| V2 | 40–51 (includes 768×576 thumbnail render targets) | ≈ 20–30 MB | 1080×640 | all |

Both versions generate mipmaps and use anisotropy 4 (V1 `kf` 2038–2046, anisotropy `min(8, max)` at 10136; V2 `texUpload` 619–633). Both also re-upload a whole canvas whenever Ali speaks:
- V1 even allocates a **new canvas and CanvasTexture for every line** (2466–2470).
- V2 redraws the same canvas (1226–1238), but `texImage2D` plus `generateMipmap` still runs on the frame thread.
- Either way, each new line can cause a hitch.

---

## 4. Input

| | V1 | V2 |
|---|---|---|
| Rays | `getController(i)` + 1-px `Line` scaled to hit distance (else 8) (1881–1888, 1258). The ray uses `controller.matrixWorld` from the **previous** frame (1261–1265 runs before `render`) | 8 mm box ray, 3 m when nothing is hit (1987, 2028–2030). Opacity 0.4 → 0.9 on hover. Cursor sphere at hit point |
| Select | `select` → re-raycast → `activate` (1266–1273). The interaction lock during travel is good (9232–9236) | `selectstart` shows the press, `select` clicks `p.hit` (2002–2003). No lock during fades: cards and buttons stay clickable while faded |
| Grip / model | Grip cylinder in MeshStandard (1889–1894) | Rounded box in the grip space (2016). It is **not removed on session end** (`end` handler removes only `ray` and `cur`, 2000), so two boxes stay floating in the desktop view afterwards |
| Hands | Not requested. Current Quest Browser builds still expose hands as `tracked-pointer` sources, and pinch fires `select`, so pinch most likely works. There is no hand visual | Requested. Pinch works through the target ray. The hand shows as a floating rounded box. No joints, no poke |
| Hover feedback | Hover sound only (`onHover`, 2663) | Scale 1.07 + emissive (860–867) + hover tone (2034) |
| Haptics | **None** (no `hapticActuators` in either file) | **None** |
| Gaze-dwell | None | Only when there is no tracked-pointer source (2020). 1.6 s dwell, ring progress, 1.2 s cooldown (2041–2049) |
| Snap turn | **None**. The student can turn only physically. Placement does not account for head yaw, so content can end up behind a seated child | 30°, threshold 0.75, pivots around the head (2038, 2052–2059). **Bug:** `xr.turnCool -= dt` runs inside the per-controller loop, so with 2 controllers the cooldown is 0.225 s. There is no re-arm at center, so holding the stick spins the student about 133°/s in jumps |
| Hit-test range | Unlimited | Unlimited, and **targets from other places stay live**. At a station, the hub buttons (11–19 m away) and the hall's `qStart`/`qNext`/`bRetry`/`bReview` (16–27 m) were measured as visible and enabled, so they can be clicked by accident |

---

## 5. Locomotion, comfort, layout, legibility

### 5.1 Locomotion and comfort

- **Travel.**
  - V1 in VR fades in and out with a 0.4 m camera-attached sphere (1850–1862; 0.35 s each way, 1927–1934) and teleports the rig (9258–9263). It never flies the camera in VR. The desktop path-walk and `runPath` are skipped. Good.
  - V2 uses a full-screen fade quad at 3.2/s (≈ 0.31 s each way) (2068, 686–690).
  - Both fade to a **near-white** color (#dff3fb in V1; 0.98/0.95/0.92 in V2). A full-field bright flash on the Quest 2 LCD is unpleasant. Use a dark mid-tone.
- **Earthquake.** Both versions shake only the diorama, never the camera:
  - V1: per-object shakers, translation up to 0.09 units at about 6.5 Hz (5930–5949). Because the world is at 2× scale, that is effectively 9 cm in VR.
  - V2: content ±4.5 cm at about 4 Hz (1324–1328).
  - This is the right approach. However, V2's diorama spans about 60° of FOV at 5.1 m, and a large moving area increases vection. Neither version adds haptics, a pre-warning, or a reduced-motion option.
- **Horizon and ground** are stable in both. There is no head-locked UI in either.
- **Placement and recentering.**
  - V1 `placeAt` (1921–1926) ignores the head's x/z offset and yaw.
  - V2 `enter()` compensates the head's x/z offset (1788–1791) but not yaw. Its snap turn makes up for that.
  - Neither listens to the reference space `reset` event (the Oculus-button recenter).
- **V1 spawn bugs (measured):**
  - **Welcome:** the VR spot (target→camera lerp 0.72 at 9332–9336) is at radius 67.5 m, outside the shore radius of 59.4 m. The floor is set to `heightAt` = **−2.8 m**, so the student stands in the sea and looks up at the gate (`shots/xr_v1_welcome.png`).
  - **Floor offset:** `placeVR` checks `this.location`, which is still the **previous** place (`arrive()` updates it afterwards; 9334–9338, 9276). The +0.3 m floor lift is therefore applied when leaving the hall, not when entering it. Measured: student y = 0 in the hall (0.3 m below the hall floor) and y = 0.29 at results.

### 5.2 Scale, distances, angles (measured at 1.2 m eye height)

| Element | V1 in VR | V2 in VR | Target spec |
|---|---|---|---|
| Ali height | 2.49 m (giant) | 1.42 m | 1.30–1.35 m |
| Main interactive button | "شاهد" 4.4 m away (volcano: **10.4 m**). Buttons 0.63–0.95 m tall × 2.4–4.9 m wide, 5° below eye level | Lectern buttons 1.36–1.51 m away, 16–18° below eye level, 0.17–0.22 m tall | 0.9–1.1 m away, 20–30° below eye level |
| Station model / diorama | **10.7–18.6 m** from the head (beyond useful stereo depth) | 5.1 m (1642) | 1.4–1.8 m tabletop |
| Info board | 12.5–14.2 m, 6.6 × 3.9 m | 4.1–4.4 m, 11° above eye level | 1.6–2.0 m, about 5° below eye level |
| Practice answer cards | **13.1–13.7 m**, 3.3 m tall (laid out for the desktop "practice" camera, 9511) | 2.05 m (1858) | 1.4–1.6 m |
| Quiz answer cards | 9.8–10.8 m, 4.3–4.5 m tall. **They hide the question board from child eye height** (`shots/xr_v1_challenge_q1.png`) | 2.55–2.7 m, 1.12–1.22 m high (1906) | 1.4–1.6 m, 10° below eye level |
| Speech bubble | 5.3–10.9 m, 6 m wide. **Orientation broken** (see 5.4) | 3.2–3.5 m beside Ali (1222) | 2.0–2.5 m, yaw-billboard |

### 5.3 Text legibility (measured texel density versus about 16–20 px/deg)

- **V1:** buttons render at 20–47 texels per degree. Labels are huge (an 84 px font at 200 px/unit, about 4° in VR). The bubble font is 60 px at 190 px/unit (2392–2393), which is 1.7–3.4° when it faces the student. Size is not the problem; distance and orientation are.
- **V2:**
  - **Lectern button labels: only 8–9 texels/deg** (360 px/m at 1.36 m, 832), so the most-used buttons look blurry even though the glyphs are a large 3.7°. The lectern backing is 120 px/m (1693) at 2.9 texels/deg.
  - Hub button labels: 30 px at 360 px/m at 4.1 m, which is **1.16°**. Too small for 8-year-olds.
  - Station-board captions: 36–40 px at 440 px/m at 4.4 m, which is **1.06–1.18°**. Too small.
  - Fine: bubble 62 px at 560 px/m (≈1.9°), quiz question 66 px at 420 px/m at 3.2 m (≈2.8°), and quiz card labels at about 2.0° (18–24 texels/deg).
- **Font delivery:**
  - V1 embeds Cairo as base64 and awaits `document.fonts.load` (10091–10106). It wraps text with RLE/PDF bidi marks (2016–2018). Good for offline classrooms.
  - V2 loads "Baloo Bhaijaan 2" from **Google Fonts** (line 7). In an offline lab it falls back to whichever Arabic system font is present, and canvases drawn before the font arrives (2.5 s race, 2133) are not redrawn.

### 5.4 Speech bubble and Ali orientation bug (V1, confirmed)

`activeCamera` returns `renderer.xr.getCamera()` while presenting (9147–9151). In r186, that ArrayCamera has **no parent**, and its `position`/`quaternion` hold the **reference-space** head pose (`WebXRManager.js:1014–1015`). `getWorldPosition()` and `getWorldQuaternion()` call `updateWorldMatrix(true,false)`, which rebuilds `matrixWorld` from that local pose (`Object3D.js:1225–1249`), so **the player rig transform is lost**. Three things go wrong:

- `bubble.follow()` copies that quaternion (2497) and offsets toward that position. The measured bubble-normal·to-head values were −0.48, 0.33, 0.85, 0.88, 0.16, −0.55, −0.82 and −0.99. At negative values the single-sided bubble is **invisible**; elsewhere it is skewed (`shots/xr_v1_station_1.png`, `xr_v1s_station_2.png`).
- `faceTowards(activeCamera.getWorldPosition())` (10031–10037) makes Ali face the world origin. At the welcome gate he faces away from the student (dot −0.91).
- The sky dome follows the same wrong point (4024).

**Fix in the new build:** read the head from the *user* camera (the child of the rig, updated by `updateUserCamera`, `WebXRManager.js:809–823`), or from `renderer.xr.getCamera().matrixWorld` right after `xr.updateCamera`. Never call `getWorldPosition()` on the ArrayCamera.

---

## 6. Features unusable in VR (DOM overlays)

Any DOM is invisible inside `immersive-vr`.

- **V1:**
  - The whole HUD is hidden in VR (`hud.setHidden(true)`, 8202–8204, 9930): stepper, primary/next, replay, **map / station picker**, reset view, listen-again, **sound toggle**, help, teacher dashboard.
  - The results hall's 3D "download certificate" button opens an HTML modal (9758–9770 → `hud.openCertificate`, 8493). **Nothing appears in the headset.**
  - All toasts ("station complete", "locked") are invisible.
  - What still works in 3D: watch, replay, next, before/after, practice cards, challenge cards, results buttons, and the bubble speaker icon (2408–2415).
- **V2:**
  - `body.in-vr #hud` is hidden (64): VR, sound, voice and help toggles. Toasts are invisible.
  - The whole learning flow is 3D: hub board with station buttons, map button on the lectern, practice, quiz and results. This is much better.
  - Missing in VR: sound/voice toggles, replay narration, an exit/menu control, and the teacher info.

---

## 7. Session lifecycle

| Event | V1 | V2 | Needed |
|---|---|---|---|
| `end` | Resets the rig and restores the desktop view (1906–1912, 9935–9936) | Clears rays and cursors and restarts window rAF (2000). **Leaks grip meshes** | Restore desktop at the same place; dispose all XR-only objects |
| `XRSession.visibilitychange` (Oculus menu = `visible-blurred`, headset off = `hidden`) | Not handled. `setTimeout`-driven game timers (9490, pose timers) keep running and TTS keeps speaking | Not handled. Narration continues | Pause narration, timeline and timers; resume with a fade |
| `document.visibilitychange` / `blur` | Only clears keys (1004) | None | Same pause |
| Reference space `reset` (recenter) | None | None | Re-place the rig on the current pad |
| `inputsourceschange` | three handles it internally | `syncSources` (2008–2021). Good | Rebuild rays and hands; switch to gaze when none remain |
| Failure after `requestSession` | Session left open (1917) | Session left open (2005 path) | `session.end()` + message |
| Re-enter | HUD VR button → modal → enter | HUD VR button | One clear 3D or DOM button; state preserved |

---

## 8. Audio in VR

- Neither version uses spatial audio (no `PannerNode`/`PositionalAudio`).
- Narration depends entirely on `speechSynthesis` with an Arabic voice (V1 1736–1790; V2 970–990). Quest Browser often has **no Arabic voice**, so narration silently disappears and 8-year-olds must read everything. Recorded narration files are needed.
- **Earthquake rumble** is synthesized at 130 Hz lowpass + 48 Hz (V1 1494–1512) or 120 Hz lowpass (V2 961). That is at or below what Quest 2's strap speakers reproduce, so the earthquake is close to silent in the headset.
- Both unlock audio inside the Enter-VR click (V1 9924; V2 `Sfx.init` 2152). Good.

---

## 9. Safety and age

- **Meta's minimum age for Quest 2 is 10** (ages 10–12 need a parent-managed account). Grade-3 students are about 8–9, **below the manufacturer's minimum**, so classroom use is a deliberate school or parent decision that needs direct adult supervision.
- 8–9-year-olds have an IPD of about 50–55 mm, below Quest 2's smallest lens setting of 58 mm. That means more eye strain and blur, which is another reason for **≤ 10–15 min sessions**.
- V1's VR dialog states 10+ with a parent account, a clear space, adult supervision and 10–15 min (8463). V2's teacher panel says the same and adds "stop if dizzy, continue on screen" (103–107).
- Neither has an **in-headset timer or break reminder**, and neither has a reduced-motion mode.

---

## 10. Deployment failure modes

- WebXR needs a **secure context** (HTTPS or localhost). Opening `v1.html`/`v2.html` from `file://` on a Quest, or over `http://<lan-ip>`, gives no `navigator.xr`.
- **Iframes:** `immersive-vr` is blocked unless the iframe has `allow="xr-spatial-tracking"` (Permissions Policy). LMS and artifact embeds usually lack it, and `isSessionSupported` then returns false. Detect `window.top !== window` and offer an "Open in a new tab" link.
- **Offline labs:**
  - V2's Google Font fails.
  - `XRControllerModelFactory` fetches controller models from a CDN by default (`@webxr-input-profiles/assets`), so any controller models must be self-hosted or bundled.
- **Memory:** V1 is a 1.1 MB HTML file plus about 94 MB of canvases. That is fine on desktop and risky in a Quest browser tab alongside the WebXR swapchain.

---

## 11. VR-specific defect list

| # | Ver | Severity | Defect | Lines |
|---|---|---|---|---|
| 1 | V1 | Critical | Welcome VR spawn in the sea (floor −2.8 m) | 9332–9336, `heightAt` 3673 |
| 2 | V1 | Critical | Bubble orientation and position use the parentless ArrayCamera, so the bubble is invisible or skewed. Ali faces away. The sky is offset | 9147–9151, 2494–2508, 10031–10038, 4024 |
| 3 | V1 | High | World at about 2× scale in VR (Ali 2.49 m, 3–5 m buttons) | world builders, `ep` 2600+ |
| 4 | V1 | High | Station, practice and quiz content 10–18 m away (desktop framing reused) | 9332–9339, 9511 |
| 5 | V1 | High | Certificate, map and sound unreachable in VR (DOM only) | 8202, 9758, 9832 |
| 6 | V1 | Medium | +0.3 m hall-floor lift keyed on the previous location | 9334–9338 |
| 7 | V1 | Medium | `setSession` failure leaves the session open | 1897–1919 |
| 8 | V1 | Medium | Max foveation (three default), no dynamic quality in VR | `WebXRManager.js:47`, 35–36 |
| 9 | V2 | High | 448k-triangle merged environment, no culling, about 800 draws/frame | 1131, 661–669 |
| 10 | V2 | High | Snap-turn cooldown decremented per controller, no re-arm | 2038 |
| 11 | V2 | Medium | Targets in other places stay hit-testable at 11–27 m | 823–868, 2029 |
| 12 | V2 | Medium | Lectern labels at 8–9 texels/deg (blurry) | 832, 1693 |
| 13 | V2 | Medium | All textured materials blended (50+ per eye) | 275 |
| 14 | V2 | Low | Grip meshes leak after the session ends | 2000 |
| 15 | V2 | Low | Per-frame allocations (GC) | 1991, 2027–2036, 2094–2105 |
| 16 | Both | High | No haptics, no visibility/blur pause, no recenter handling, no in-VR break timer | — |
| 17 | Both | Medium | Near-white full-field fade | V1 1850–1856; V2 687 |
| 18 | Both | Medium | Rumble frequencies inaudible on the Quest speakers. TTS-only narration | V1 1494–1512; V2 961, 970 |

---

## 12. What to carry into the new build

**From V2 (the VR foundation):**
- Metric scale.
- One viewing **pad per place**, plus a hub with a station picker and a lectern control bar.
- World-locked bubble beside Ali.
- `local-floor` → `local` fallback with a child-height offset.
- Pinch through the target ray.
- Gaze-dwell fallback.
- Head-pivot snap turn.
- Thumbnails rendered from the real station models.
- First-answer-only quiz scoring.
- Right-to-left card order (أ on the right, 1906).

**From V1 (art and robustness):**
- three.js, with `setAnimationLoop`, `compileAsync` and a single shared material cache.
- Embedded Arabic font and bidi marks.
- Interaction lock during travel.
- The richer station animations and the bubble speaker (listen-again) button.
- InstancedMesh vegetation.
- Explicit age and supervision copy (8463).
- The certificate idea, shown **in-world** in VR.

---

## 13. Recommendations for the new build (three.js r186)

### 13.1 Renderer and session settings

```js
import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, stencil: false,
  powerPreference: 'high-performance' });            // antialias → 4× MSAA on the XR layer (WebXRManager.js:512)
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); // desktop/tablet only; ignored in XR
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;          // no ACES per-fragment cost; author colours in sRGB
renderer.shadowMap.enabled = false;                  // blob shadows + baked vertex AO instead
renderer.xr.enabled = true;
renderer.xr.setFramebufferScaleFactor(1.0);          // never >1 on Quest 2 (setter: WebXRManager.js:289)
renderer.xr.setFoveation(0.5);                       // start medium; dynamic 0.25–1.0 (WebXRManager.js:878)
const camera = new THREE.PerspectiveCamera(70, aspect, 0.05, 200); // near/far become depthNear/Far (WebXRManager.js:740–760)
scene.fog = new THREE.Fog(skyHorizon, 60, 180);      // hides the far plane
const sessionInit = { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'] };
```

- Pick the reference space **before** `setSession`, because r186 has no fallback (`WebXRManager.js:526`). Probe `session.requestReferenceSpace('local-floor')`. If that fails, call `renderer.xr.setReferenceSpaceType('local')` and set `rig.position.y = 1.15` (child default). If `setSession` throws, call `session.end()`.
- Call `session.updateTargetFrameRate?.(72)`. Keep 72 Hz: thermals, battery, and a 13.9 ms budget.
- Use `navigator.xr.offerSession` when present (VRButton does this, `VRButton.js:100–122`) so Quest Browser shows its own "Enter VR" pill. Otherwise use our big Arabic button.
- **Dynamic foveation:** average the frame delta over 1 s inside `setAnimationLoop`. If it is above 14.5 ms, raise foveation by 0.25 (up to 1.0). If it stays below 11 ms for 3 s, lower it by 0.25 (down to 0.25). Framebuffer scale cannot change during a session (`WebXRManager.js:291–297`).
- Pre-warm before entering VR and between places:
  - `renderer.compileAsync(scene, camera)`.
  - `renderer.initTexture(tex)` for the next place's canvases, done during the fade-hold.
- **Do not** switch to WebGPURenderer just to get multiview. In r186, multiview exists only in WebGPURenderer's WebGL backend (`renderers/common/XRManager.js:1253–1256`), and the WebGPU XR path disables it (:787–793). The classic WebGLRenderer renders each eye separately (`WebGLRenderer.js:1754–1774`). Budget for 2× instead.

### 13.2 Performance budget (Quest 2, 72 Hz, WebGLRenderer, no multiview)

| Metric | Budget (hard cap) | Target |
|---|---|---|
| Draw calls per frame (both eyes) | **≤ 250** (≤ 125 per eye) | ≈ 160 |
| Triangles per frame (both eyes) | **≤ 300k** (≤ 150k per eye after culling) | ≈ 200k |
| Whole scene triangles in memory | ≤ 400k | — |
| Terrain | ≤ 8k triangles (e.g. 64×64 grid + vertex colors) | — |
| Shader programs | ≤ 12 | ≈ 8 |
| Blended draws visible | ≤ 12 per eye | ≤ 6 |
| Real-time shadow maps | 0 (optional: one 1024² map, `autoUpdate=false`, ≤ 30 casters, refreshed only while a station animates) | 0 |
| Lights | 1 HemisphereLight + 1 DirectionalLight (no shadow) | — |
| GPU texture memory | ≤ 48 MB total | ≈ 30 MB |
| Live canvas textures | ≤ 16. Max side 2048 px; typical ≤ 1024 | — |
| Canvas re-uploads | ≤ 1 per frame, ≤ 1 MB per upload; heavy uploads only during fades | — |
| JavaScript per frame | ≤ 4 ms. Zero per-frame allocations | — |
| Particles | ≤ 2 systems, ≤ 400 points total | — |
| CPU→GPU per frame | No geometry re-uploads (V1 rewrites the flag every frame, 4025–4033) | — |

**How to hit the budget:**
- Render only the **current place** plus a ≤ 30k-triangle island backdrop. Set other stations to `visible=false` while in VR; they are behind fades anyway.
- Merge static props **per place**, not per island, so frustum culling still works.
- Use `InstancedMesh` for palms, rocks and bushes (≤ 6 instanced meshes).
- Use `frustumCulled` everywhere.
- Avoid huge ico/sphere bushes: ≤ 80 triangles each.

### 13.3 Materials

- World: `MeshLambertMaterial({ vertexColors: true })` with baked AO in vertex colors, `flatShading` where stylized. One material per palette, cached as V1 does in `Z()`.
- Sky, clouds, far hills: `MeshBasicMaterial` with vertex-color gradients (V2's sky approach, 1095–1099), `fog: false` on the sky.
- UI: `MeshBasicMaterial({ map, toneMapped: false, transparent: false })` on an **opaque** canvas.
  - Paint the panel color into the canvas.
  - Make rounded corners with geometry (`ShapeGeometry` of a rounded rect) or `alphaTest: 0.5`, not blending.
  - Use `transparent: true` only for the bubble tail, fades and particles.
- Character: Lambert. A rim term from a 6-line `onBeforeCompile` is optional.
- No MeshStandard or Physical, no transmission, no post-processing, no tone mapping.
- Blob shadow: one shared 128² radial texture on a 24-segment disc, `depthWrite: false`, ≤ 10 visible (V2's `blob()`, 1146–1150).

### 13.4 Text legibility rules (Quest 2)

- **Texel-density rule:** canvas resolution `ppm = ceil(1150 / d)` px per meter, where `d` is the nominal viewing distance in meters. That gives about 20 texels/deg, which matches the panel.
  - With that rule, **font px = 20 × angular em-height in degrees**.

| d (m) | ppm | Use |
|---|---|---|
| 1.0 | 1150 → use 1024 | Lectern buttons |
| 1.5 | 768 | Answer cards |
| 1.8 | 640 | Main info panel |
| 2.2 | 512 | Ali bubble |
| 3.0 | 384 | Title banners only |

| Text role | Min angular em-height | Font px (at the rule's ppm) | Notes |
|---|---|---|---|
| Body / question text | **1.5°** (never < 1.2°) | ≥ 30 px | ≤ 2 lines per question, ≤ 3 lines per bubble, about 22–26 Arabic characters per line |
| Button labels | **2.0°** | ≥ 40 px, weight 800 | Icon + 1–2 words |
| Headings / station names | **2.5–3°** | 50–60 px | — |
| Score / big numbers | **4°** | 80 px | — |

Further rules:
- Contrast ≥ 7:1 (dark ink on a cream panel). Panel luminance ≤ 90% (e.g. `#F6F0E6`) to limit LCD glare.
- Line height 1.35–1.45 for Arabic, so diacritics are not clipped.
- Keep V1's bidi marks (2016–2018). Shape text with the browser's canvas text, which uses HarfBuzz and handles Arabic joining. Do not use SDF text libraries unless Arabic shaping and harakat are verified on device.
- Embed a **subset woff2** of one Arabic font (Cairo or Baloo Bhaijaan 2, weights 600/800 only). `await document.fonts.load()` before drawing **any** canvas, and redraw all canvases on `document.fonts` `loadingdone`.
- Text faces the viewer within ±25° (yaw-billboard or pre-angled panels). No text more than 30° off the forward axis horizontally.

### 13.5 UI layout spec (relative to the measured eye height E)

- **Measuring E:** take the median head `y` over the first 1.5 s of the session and on every `reset`. Clamp to 0.9–1.8 m. With `local` fallback, E = 1.15 m.
- **Spawning:** on every arrival, spawn the rig so the student's *current* head (x, z, yaw) lands on the pad, facing the place's forward axis. Compensate head x/z (as V2 does at 1788) **and** yaw. This happens inside the fade.

| Element | Horizontal distance from head | Center height | Size / angle | Notes |
|---|---|---|---|---|
| Diorama (tabletop) | 1.4–1.8 m | Table top at E − 0.55 m (0.65 m for E = 1.2) | Diameter ≤ 1.6 m (≤ 50° FOV); action area ≤ 35° | Strong stereo depth; children can lean in. Floor ring marks the safe area |
| Main info panel | 1.8 m (1.5–2.2) | E − 0.10 m | ≤ 1.4 × 0.8 m (≤ 42° × 25°), tilted to face the eye | Directly ahead, above or behind the diorama |
| Answer cards (3) | 1.5 m, on an arc of radius 1.5 m | E − 0.25 m (≈ 10° below) | Each ≥ 0.40 × 0.46 m (≥ 15° wide); gaps ≥ 0.06 m; total span ≤ 55° | RTL order أ ب ج from right to left |
| Lectern / control bar | 1.0 m | E − 0.45 m (≈ 25° below), tilted 40° toward the eye | Buttons ≥ 0.26 × 0.12 m (≥ 7° tall), gaps ≥ 0.04 m, ≤ 5 buttons | Contains ⟵ previous, ▶ watch/replay, التالي, 🗺 map, ⚙ menu |
| Ali | 2.0–2.4 m, 25–35° to the **right** | Feet on the floor | 1.30–1.35 m tall | RTL: the eye goes from Ali to the content on the left |
| Ali bubble | 2.2 m (beside Ali's head) | E + 0.15 m | ≤ 1.0 × 0.45 m; yaw-only billboard from the **user camera** | Speaker icon = listen again |
| Progress / step chips | 1.8 m | E + 0.45 m | 1.8° text | Never head-locked |
| Toast / system message | 1.4 m, lazy-follow | E − 0.05 m | ≤ 0.8 × 0.25 m | Re-centers when > 25° off, 0.4 s ease. The only follow-type UI |
| In-VR menu (⚙) | 1.2 m | E − 0.20 m | 4 big buttons: sound, narration, recenter, finish session | Replaces the DOM HUD |

Further rules:
- Nothing interactive closer than 0.6 m or farther than **3.0 m**.
- Nothing essential more than 30° left or right of the place's forward axis.
- Nothing more than 20° above or 40° below eye level.
- All needed head turns stay within ±60° (seated-friendly).
- The certificate and results are an in-world easel at 1.8 m. "Download/print" is offered **after** exiting VR.

### 13.6 Input spec

- **Ray:**
  - Source: `targetRaySpace` via `renderer.xr.getController(i)`.
  - Visual: a 3 mm camera-facing quad strip, white→transparent gradient, length = min(hit, 1.2 m).
  - Cursor ring: 1.2 cm at 1 m, scaled ∝ distance (constant ≈ 0.7°), oriented to the hit normal.
  - Hit-test max distance **4 m**. Test only targets belonging to the current place (fixes V2 #11).
  - Raycast **after** updating the rig's world matrix (`rig.updateMatrixWorld(true)`) to avoid V1's one-frame lag.
- **Hover:**
  - Enters after 2 consecutive frames on the same target and exits after 3 frames off it, which prevents flicker.
  - Feedback: scale 1.06, emissive or outline highlight, and a tick at −30 dBFS.
  - **Haptic:** `gamepad.hapticActuators?.[0]?.pulse(0.15, 20)` once per hover-enter.
- **Select:**
  - `selectstart` shows the press (8 mm depress).
  - Commit on `select` only if the ray is still on the same target and the press lasted ≥ 60 ms.
  - Haptic `pulse(0.5, 40)` on commit; correct answer `pulse(0.7, 80)`; wrong answer two `pulse(0.3, 40)` pulses 120 ms apart.
  - Debounce 300 ms per target.
  - **Ignore all selects during fades and for 350 ms after fade-in.**
- **Squeeze:** optional alias for select (teacher setting, default on), because young children often press the grip.
- **Hands:**
  - Request `hand-tracking`.
  - Pinch arrives as `select` through the target ray. three also emits `pinchstart`/`pinchend` with hysteresis on hand spaces (`WebXRController.js:263–288`).
  - Visual: `XRHandModelFactory` 'spheres' (cheap) or a bundled low-poly hand. No CDN models.
  - Optional **poke** on lectern buttons when an index tip is within 0.25 m: press at 8 mm penetration, release at 4 mm.
- **Gaze-dwell fallback:**
  - Active only when no tracked-pointer source exists for 1.0 s.
  - Reticle at hit distance; dwell **1.2 s** with a progress ring.
  - Reset if the gaze leaves the target for > 150 ms. Cooldown 0.8 s.
  - Targets must be ≥ 3° tall.
- **Snap turn:**
  - Thumbstick X (`axes[2]`, or `axes[0]` when there are only 2 axes).
  - Fire at |x| ≥ 0.65; **re-arm only after |x| ≤ 0.25**.
  - Angle 30° (setting: 45°). Minimum interval 250 ms, tracked **per input source**.
  - Pivot around the head (V2 2052–2059). Optional 100 ms dim to 60% ("blink").
  - Disabled during fades.
- **Locomotion:** no smooth locomotion, no thumbstick-forward movement. Travel only through in-world buttons or pads with a fade.
- **Recenter:** `renderer.xr.getReferenceSpace().addEventListener('reset', replaceRigOnPad)`.

### 13.7 Comfort spec

- **Fades:**
  - Out 0.25 s (ease-in), **hold 0.10–0.20 s** (move the rig, swap visibility, upload textures), in 0.30 s (ease-out).
  - Color: dark navy `#14202E` at opacity 1. Not white.
  - Implement as a camera-attached inside-out sphere with `depthTest:false`, `renderOrder: 999` (V1 1850–1862).
- **Never** move, rotate or scale the rig while the scene is visible, except for snap turn.
- No camera shake, no FOV animation, no head-locked content except the lazy toast.
- Horizon, sky and the floor under the student are always static. Clouds move ≤ 0.5°/s.
- **Earthquake presentation:**
  - Ali pre-warns ("استعدّ! ستهتزّ الأرض قليلًا… ٣ ٢ ١").
  - Shake **only the tabletop diorama** (≤ 35° of FOV): translation ≤ 2 cm, tilt ≤ 1.5° per object, 3–5 Hz, ramp 0.4 s in and out, strong phase ≤ 3 s.
  - Simultaneous **controller rumble**: `pulse(0.4, 80)` every 120 ms during the strong phase.
  - Audio band 150–600 Hz rumble plus crack/crackle, which is audible on Quest speakers.
  - The panel, Ali and the student's floor never move.
  - **Reduced-motion** setting (teacher, default *off*): no shake; cracks spread, with arrows and haptics only.
- **Volcano:** no flashing above 3 Hz, no full-field bright glow, smoke kept ≥ 1.2 m from the eye, ≤ 300 particles.
- **Break reminder:**
  - At **10 min** a gentle in-world card: "وقت استراحة قصيرة؟" with continue/finish.
  - At **15 min** a strong prompt to remove the headset.
  - Session length is teacher-configurable (5–15 min).
- **Seated mode:** if E < 1.05 m, keep the layout relative to E (§13.5) and limit required head turns to ±45°.

### 13.8 Session lifecycle handling

```js
renderer.xr.addEventListener('sessionstart', () => {
  const s = renderer.xr.getSession();
  s.addEventListener('visibilitychange', () => setPaused(s.visibilityState !== 'visible')); // blurred → pause
  renderer.xr.getReferenceSpace().addEventListener('reset', replaceRigOnPad);
  measureEyeHeightThen(layoutCurrentPlace);            // 1.5 s median of head y
  hideDomHud(); placeRigOnPad(current, { compensateHeadYaw: true });
});
renderer.xr.addEventListener('sessionend', () => {     // restore desktop at the same place, keep state
  disposeXrOnlyObjects(); showDomHud(); setDesktopView(current);
});
document.addEventListener('visibilitychange', () => setPaused(document.hidden));
```

`setPaused(true)` must:
- stop narration (`audio.pause()` / `speechSynthesis.cancel()`);
- freeze the station timeline;
- stop loops (rumble, water);
- freeze the break timer;
- freeze **all gameplay timers**, which must be driven by the frame clock, not `setTimeout` (unlike V1's `practiceTimer`, 9490).

Resuming triggers a 0.3 s fade-in. Progress is saved on every step (localStorage with an in-memory fallback, as V1 does at 1300–1325). That way a sleeping headset or a re-entry resumes in place.

### 13.9 Audio

- Ship **pre-recorded Arabic narration** (one Opus/AAC file per line, about 60 lines, about 2–3 MB), with TTS as the fallback and text bubbles always shown.
- Spatialize Ali's voice with `PositionalAudio` at Ali's head: `refDistance` 1.5, rolloff 1, panning model `'HRTF'` for the voice only. SFX use `'equalpower'` or non-positional. ≤ 4 simultaneous panners.
- Duck SFX by −8 dB under narration. Master ≤ −6 dBFS.
- Keep important content in 150 Hz–4 kHz, which suits the Quest strap speakers. Pair low-end rumble with haptics.

### 13.10 Safety and teacher guidance (in the DOM start screen and the teacher page)

- "Meta sets **10+** for Quest 2 (10–12 with a parent-managed account). Grade-3 students are younger: use only with **school/parent consent and an adult beside the student**."
- "**≤ 10–15 minutes**, then a break. Sit on a stable non-swivel chair or stand inside a cleared stationary boundary."
- "Remove the headset immediately on dizziness, eye strain, headache or nausea, and continue in screen mode, which has identical content."
- "Children's eyes are closer together than the headset's smallest lens setting. Short sessions avoid eye strain."
- In VR: the break reminder (§13.7) and a big "finish" button in the ⚙ menu.

### 13.11 Deployment checklist

- Serve over **HTTPS**. Provide a QR code or short link for the Quest Browser.
- If embedded, the iframe needs `allow="xr-spatial-tracking; fullscreen; autoplay"`. Detect embedding and offer "open in new tab".
- Everything self-contained, with no runtime CDN: font, audio, three (pinned r186), controller and hand models.
- If WebXR is unsupported or blocked, keep the full desktop/tablet experience (both versions already do) and explain why.

### 13.12 VR regression tests (reuse this review's tooling)

Use IWER (`scratchpad/xremu/node_modules/iwer`, `new IWER.XRDevice(IWER.metaQuest2,{stereoEnabled:true})`, `installRuntime({forceInstall:true})`) in Playwright to assert for every place at E = 1.0, 1.2 and 1.6 m:

1. Draw calls ≤ 250 and triangles ≤ 300k from `renderer.info`. Both views are counted; the views check is in `tools/xr_views_check.mjs`.
2. Every active target sits 0.6–3.0 m from the head and between −40° and +20° elevation, with angular height ≥ 3°.
3. Every visible text mesh has ≥ 18 texels/deg at its distance, and its declared em-height meets §13.4.
4. The bubble normal dotted with the head direction is ≥ 0.9.
5. The rig floor equals the walkable surface height ± 2 cm.
6. No target outside the current place is hit-testable.

---

## Appendix A: raw measurements

- `tools/xr_probe_v1.json`, `tools/xr_probe_v1_stereo.json`: V1 per place (desktop and XR): `info`, `stats` (meshes, Standard/Basic counts, transparent, shadow casters, canvas textures and MB), `targets`, `text`, `bubble`, `ali`.
- `tools/xr_probe_v1b.json`: V1 practice (station 3), challenge question 1, results in XR.
- `tools/xr_probe_v2.json`, `tools/xr_probe_v2_stereo.json`: V2 per place, practice, quiz 1. (The first `goTo` was dropped while the start fade was busy, so the place labels are shifted by one. Use the `rig.pos` field to identify the place.)
- `tools/tri_breakdown.json`: triangle groups per subtree for both versions.
- Screenshots through the emulated eyes:
  - `shots/xr_v1_welcome.png` (spawn in the sea)
  - `shots/xr_v1_station_1.png` and `shots/xr_v1s_station_2.png` (skewed bubble)
  - `shots/xr_v1_challenge_q1.png` (cards hide the question)
  - `shots/xr_v2_1.png` (V2 lectern and pad)
  - `shots/xr_v2_quiz1.png` (V2 hall at child height)
