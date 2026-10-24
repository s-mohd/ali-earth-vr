# Art-direction review and brief: «مغامرة المستكشف علي في عالم الأرض المتغيّرة»

Reviewer role: art director, children's VR (Meta Quest 2 first, screen and tablet second).
Inputs: every `shots/v1_*.png`, `shots/v2_*.png`, `shots/ped_*`, `shots/xr_*` screenshot; `review/v1.md`, `review/v2.md`, `review/vr.md`, `review/pedagogy.md`; the code in `ref/v1_app.js` (V1) and `ref/v2.html` (V2).
New evidence made for this review:
- `tools/art_ali_close.mjs` renders Ali close up in both versions: `shots/v1_ali_full.png`, `v1_ali_close_front.png`, `v1_ali_close_34.png`, `v2_ali_full.png`, `v2_ali_close_front.png`, `v2_ali_close_34.png`.
- `tools/art_contrast.mjs` computes WCAG contrast for the old and proposed colours (results in §3.2).
- `tools/art_palette.mjs` renders the proposed palette as `shots/art_palette.png`.

Line numbers: `v1_app.js` for V1, `v2.html` for V2.

---

## 0. Verdict

1. **No version wins outright.**
   - V1 has the better *art*: a richer world, a lovable Ali, the clearest simulations, and a festive results scene.
   - V2 has the better *VR staging*: the diorama is in front of you, the lectern sits at waist height, and the boards are close. It is also more *culturally specific* (date palms, Gulf houses with barjeel) and has the friendlier typeface.
   - The new game should take V1's look and phenomena, V2's staging and local props, and render all of it with a Quest-cheap toon pipeline.
2. **Ali: keep V1's Ali, give him V2's explorer kit, and fix his size.**
   - V1's big-head Gulf boy (`Zp` 4389–4853) is far more appealing and expressive than V2's small-headed, dot-eyed boy (1159–1258); compare `shots/v1_ali_full.png` with `shots/v2_ali_full.png`.
   - He is 2.49 m tall in VR (×1.35 scale at 4622; `vr.md` §5.2). That must become 1.30–1.35 m.
   - His ghutra drapes are zero-thickness planes that read as cardboard in 3/4 view (`shots/v1_ali_close_34.png`).
3. **Colour has to mean something.**
   - Neither version uses colour to code meaning. V2 even gives the earthquake and the volcano the same coral frame (`frame: [COL.coral, COL.coral, …]`, 1644).
   - Proposal: one hue per station on a *sudden = hot, slow = cool, people = yellow* scale. The hue appears on every signpost, board, map pin, progress stamp and evidence marker, and never on quiz cards.
4. **Shading.** V1's PBR, ACES tone mapping and 2048² PCF shadows (lines 15–18, 3718–3722) look lovely but cost 3–5× the Quest budget. V2's banded toon shader (549–575) is cheap but lights in gamma space, which bleaches floors to flat white and turns lit UI grey. New: `MeshToonMaterial`/Lambert with vertex colours and baked AO, sRGB-correct, no tone mapping. Use blob shadows that actually sit *on* the surface.
5. **The phenomena must be visible at the end state.**
   - V1 shows them better: a wide crack with a light rim and a dropped slab, a lava shader with a pool, and a particle-carrying stream.
   - V2 hides its own evidence: 3 of 5 cracks, the "stays nearby" ring and all contact shadows are buried under the platform top (1316–1318, 1401–1402, 1263).
   - Lava on V2's pink cone has a luminance contrast of **1.03:1**.
   - The new brief gives each station a defined before, process and after, with evidence markers and contrast targets (§3.9).
6. **UI.** Keep V1's unlit canvas boards and cards (`Bf` 2329–2331) and its tactile 3D button (`ep` 2600–2765). Use V2's typeface (Baloo Bhaijaan 2, embedded) and V2's lectern placement.
   - White labels on pastel buttons fail contrast in both versions: V1 orange 1.84:1, V2 coral, teal and lavender 2.4–2.6:1. Use ink on bright faces, or white on deep faces, at 3.4:1 or better.
7. **Quiz pictures.**
   - Both versions reuse the station thumbnail, and the captions leak the answer: «طريق متشقق بسبب زلزال», V1 5131 and V2 1611.
   - Art rule: render the quiz pictures on a neutral *quiz stage*, with no station hue, no text signs and no Ali.
   - Show the after state for the A form, and a new transfer vignette for the B form (§3.10).
8. **Bahrain identity.**
   - V1's island in a turquoise sea is the right base for an island nation (sea shader `Np` 3491–3545). But it is filled with pines (3128, 5900, 6683), coconut palms (coconuts 3200–3205), a European gabled cottage (`um` 5686) and tall green mountains (3546–3569).
   - V2's date palms (1026–1074) and barjeel houses (1279–1294) are the right props, but they sit in a generic green garden with hills.
   - New: V1's island and sea, V2's palms and houses, plus sidr and ghaf trees, bougainvillea, a dune, a sabkha strip, a dhow, a fort silhouette, and a pearl-oyster reward.
9. **About 40 visual bugs are catalogued in §4.** The most visible:
   - V1: the bubble covers the phenomenon at stations 3, 4 and 5 and at the results; the certificate underline strikes through «الصغير»; the lava pokes through the cone; the quiz cards hide the question board in VR.
   - V2: grey quiz cards; buried cracks, ring, shadows and feet; the bubble paints over the nearer practice tag; boards are cut off at the screen edge.

---

## 1. What was looked at

All main screenshots exist for both versions; none are missing.

| Area | V1 shots | V2 shots |
|---|---|---|
| Start / hub | `v1_start`, `v1_hub`, `ped_v1_00_welcome`, `v1_map`, `v1_help` | `v2_start`, `v2_hub`, `v2_hub_down`, `v2_hub_ali_feet` |
| Stations | `v1_st1..5_before/after`, `v1_st2_mid`, `v1_st5_mid`, `v1_st5_toggle_before`, `ped_v1_s1..s5_*` | `v2_st1..5_before/mid/after`, `v2_st1_after_down`, `v2_st3_after_down`, `v2_st5_compare(_before)`, `ped_v2_s*` |
| Practice | `v1_practice`, `v1_practice_weathering`, `v1_practice_wrong` | `v2_practice`, `v2_practice_answered`, `v2_practice2` |
| Quiz | `v1_challenge_gate`, `v1_quiz`, `v1_quiz_q2`, `v1_quiz_wrong_reveal`, `v1_bug_stale_reveal` | `v2_hall_intro`, `v2_quiz`, `v2_quiz_answered`, `v2_quiz_q2` |
| Results | `v1_results`, `v1_certificate_modal`, `v1_vr_results` | `v2_results`, `v2_results_badge`, `v2_results_down` |
| VR viewpoints | `v1_vr_*`, `xr_v1_*`, `xr_v1s_*` | `xr_v2_*`, `xr_v2s_*` |
| Details | `v1_zoom_volcano`, `v1_zoom_erosion_board`, `v1_ali_*` (new) | `v2_tablet_*`, `v2_phone_st2`, `v2_ali_*` (new) |

---

## 2. Element-by-element comparison

### 2.0 Scorecard

| Element | V1 | V2 | Better | What the new version does |
|---|---|---|---|---|
| Overall style and palette | Warm, saturated "toy island": sky blue, turquoise sea, sand, mint, orange CTA, navy ink (`X` 1947–2005). Soft PBR look. | Pastel claymation: lavender roads, pink cone, lilac rocks, mint grass (`P` 1016–1021, `COL` 750–753). Coherent, but washed out with a lavender cast. | **V1** | V1's saturation and warmth with V2's flat toon simplicity. Fixed, meaningful station hues (§3.2). |
| Lighting and shading | Hemisphere `#d9efff`/`#d9c7a0` at 1.55 (3718), 2048² PCF sun shadow (3722), ACES (15). Soft and rich, but too expensive. | One banded diffuse plus rim plus hemisphere uber-shader in gamma space (549–575). No shadows; blob shadows are buried. | **V1 look, V2 cost** | Toon or Lambert, vertex colours with baked AO, sRGB, no tone mapping, a sun that turns with each place, blob shadows (§3.3). |
| Environment richness | Island, sea with foam rings, sand bands, vegetation instancing, gate, gazebo, flags, flowers (`v1_hub.png`). Generic tropical: pines, coconut palms, green mountains. | Garden, date palms, round trees, hills ring, clouds (1092–1142). Generic green, sea hidden; one 448k-triangle merged mesh (1131). | **V1 richer, V2 more local** | V1 island + V2 date palms and Gulf houses + Bahraini landmarks. Per-place budget. |
| Ali | Chibi head (about 1/3 of height), layered eyes with two highlights, brows, blush, 3 mouths, navy outline, thobe, ghutra, agal, sandals, 8 poses (4648–4765). Appealing (`v1_ali_full.png`). Giant in VR, paper-thin ghutra drapes. | Natural proportions (head about 1/6, 1160), dot eyes, fixed torus smile (1203), bush hat, vest, flag on the back (never seen, 1184), cylinder arms; cheer reads as a T-pose (`v2_st1_after.png`). | **V1** | V1 head and face rig + V2 explorer kit (vest, backpack, flag patch on the front) at 1.32 m (§3.7). |
| Earthquake | Wide zig-zag crack with light rim, revealed from the road outward (5841–5848, 5963–5965), dropped slab (5950–5952), shake marks. One European cottage, no damage after. | Three Gulf houses with barjeel, lavender road; 2 of 5 cracks visible (1316–1318 buried); nothing changed after. | **V1 phenomenon, V2 props** | V1 crack tech on V2 houses, plus visible lasting change: slab step, tilted lamp, cracked wall, fallen pot. |
| Volcano | Lathe cone, lava shader (`xm` 5998–6035) with front and hot bands, crater pool, base pool. Ribbon pokes through the cone (`v1_zoom_volcano.png`); smoke invisible on pale sky. | Pink cone, orange tube "ropes" (1350–1353), grey puffs. Lava/cone luminance contrast 1.03:1. | **V1** | Dark basalt top so lava pops (4.1:1), V1 shader with `polygonOffset`, visible violet-grey ash, ejected glowing rocks, steam where lava meets the sea. |
| Weathering | Sand-coloured noise rock with embedded chunks; TubeGeometry cracks grow; chunks pop off and land beside it (6236–6478). Reads as rock. Sudden; no cause; the bubble covers it. | Lilac ico boulder swapped for 9 chunks that bounce out (1374–1421); invisible ring (1401–1402). Reads like plastic gems. | **V1 (slightly)** | Time-lapse sun and moon, rain, root and heat agents; pieces split and *slump in place*; fresh-scar colour; a dashed footprint ring raised above the ground. |
| Erosion | Best scene: carved hillside, stream shader (`Pm` 6498–6535), 68 particles along a curve, deposit fan, arrows (6536–6750). Bubble covers the stream. | Scrolling stream, 30 bits, source pile shrinks and deposit grows, «من هنا / إلى هنا» signs (1470–1476); one sign hidden behind the board. | **V1 visuals, V2 signage** | Merge them. Start from the weathering rubble (story bridge) and add a 3-second wind and dune beat. |
| Human changes | Articulated excavator digs, swings and dumps; ground smooths; road paves through a reveal shader; قبل/بعد tag and toggle (6762–7111). | Excavator drives through, mounds flatten, road scales in; قبل/بعد easel (1700–1705). | **V1 + V2 easel** | V1 choreography, plus workers (people are the agent), a building frame, and V2's before/after easel. |
| Boards, cards, buttons | Unlit canvas (`Bf` 2329–2331); board layout with kicker, title, orange underline and body (`Bp` 4052–4189); candy 3D button with darker base (`ep` 2600–2765). Far away in VR (12–14 m); duplicated by an HTML bar. | Panels and buttons *lit* by the world (800, 830, 878), so grey in the hall; lectern at waist (1688, 1691–1697); station board cut off at the screen edge. | **V1 rendering, V2 placement** | Unlit opaque canvas faces, V1 anatomy, V2 placement, distances from `vr.md` §13.5. |
| Arabic typography | Cairo, embedded, with font wait (10091–10102). Clean and slightly corporate; bidi marks (2016–2018). | Baloo Bhaijaan 2, rounded and friendly, but fetched from Google Fonts (line 7). Partial tashkeel renders well. | **V2 face, V1 delivery** | Baloo Bhaijaan 2, embedded subset woff2, 600/800 weights, Cairo fallback (§3.5). |
| Speech bubble | Big (up to 6.2 units, 2420), moved 0.6 m toward the camera (2494–2505); covers the phenomenon; broken in VR (`vr.md` §5.4). | Crisp 1.38×0.58 m, teal stroke (1222–1238); stays beside Ali; sorting bug over the practice tag. | **V2** | V2 look, anchored on Ali's outer side, never over content, with a replay-voice icon. |
| Quiz cards | Image, caption, letter badge; clear states (`$p` 4855–4862), ✓/✗ badges (5001–5003), reveal pulse (5051), unlit. | Same anatomy, but the lit body is grey (886 `bg:null`); the badge covers the letter disc (890, 899–901). | **V1** | V1 card with neutral pictures and captions, a raised badge slot, and a wrong-state outline only (§3.6). |
| Results / celebration | Round stage, extruded stars, balloons, 160 confetti, certificate easel (7391–7683). Grey stage, muddy PBR stars, the bubble covers the board. | Bright toon stars, "المستكشف الصغير" medallion with ribbons, 90 confetti (1740–1752). White floor glare; medal behind a pillar. | **V1 scene, V2 materials** | A pearl-oyster medal, an explorer passport with 5 station stamps, toon gold stars, a certificate easel, confetti in the station hues. |
| Hub | Island gate with title board, Ali, HTML welcome card (`v1_hub.png`). A good establishing shot. | Hub board with 6 buttons and a lectern "ابدأ الرحلة" (1674–1689). Functional, plain. | **V1 mood, V2 function** | An explorer camp whose centrepiece is a 3D island-map table with 5 hue-coded pins. This also works as the in-VR map. |
| Start screen (HTML) | Loading card with globe and progress (style.css `.loading-card`). | Clean card with chips, SVG Ali face and per-device how-to (74–113). | **V2** | V2 card layout + V1 loader + the new Ali portrait. |

### 2.1 Overall art style and palette

- **V1** reads as a polished mobile-game "toy island" (`v1_hub.png`, `v1_st2_before.png`).
  - The `X` token set (1947–2005) is well chosen: sky `#62b6e6`/`#9fd6f2`, water `#7ccbe4`, sand `#efd7a6`, mint `#8fd9b6`, orange `#ffad5c`, navy `#1f3b63`.
  - ACES plus a cream horizon fog (`Fn(X.horizon,120,430)`, 3736) gives a soft, warm haze.
  - Weakness: the HTML HUD (stepper, chips, bottom bar) is a second visual system laid over the 3D world. Duplicate buttons in two styles («شاهد الزلزال» appears twice in `v1_st1_before.png`) make the screen noisy.
- **V2** is one consistent pastel claymation (`v2_hub.png`, `v2_st1_before.png`).
  - The `P` palette (1016–1021) is low-saturation and lavender-biased: road `#b8b3cb`, rocks `#c3b8cc`, crack `#5e5172`, volcano `#d5ae9e`.
  - With gamma-space lighting (FS 549–575), large flat areas wash out. The hall floor `#efe7fb` (1720) renders as a featureless white disc (`v2_quiz.png`, `v2_results.png`).
  - Everything is pleasant, but nothing stands out, so the phenomena do not pop either.
- **New:** V1's warmth and saturation for the world, a clean V2-style toon read, and a strict meaning per hue (§3.2).

### 2.2 Lighting and shading

- **V1** uses MeshStandard on everything through the `Z()` cache (2315–2325, roughness 0.85), hemisphere 1.55 (3718), a 2048² PCF sun shadow following focus (3722, `setShadowFocus` 3738–3742), ACES at exposure 1.05 (15–16), and an always-present PointLight in the volcano (6167–6169).
  - Gorgeous soft contact shadows under Ali and the props (`v1_st1_after.png`).
  - But gold reads olive and muddy: stars `X.gold` at metalness 0.2 with emissive `#b37a00` (7464–7469) in `v1_results.png`.
  - The cost is far over budget (`v1.md` §5).
- **V2** uses one shader: a banded diffuse `smoothstep(-0.3,0.35)*0.7 + smoothstep(0.35,0.8)*0.3`, hemisphere, rim 0.10 and fog (562–566).
  - It is cheap and gives a nice claymation feel on characters and props (`v2_st3_before.png`).
  - Problems: there is no colour management, so whites clip and pastel tints shift to lavender; UI meshes are lit, so they change with station yaw (B9 in `v2.md`); and blob shadows sit 8–10 mm under the platform top, so objects float.
- **New:** §3.3.

### 2.3 Environment

- **V1** has the strongest sense of *place*. A round island in a shaded sea with two animated foam rings (`Np` 3491–3545), sand and wet-sand bands, flowers, grass tufts, an island gate (`Up` 4217–4321) and a gazebo with a flag.
  - Wrong for Bahrain: pines (3128; placed at 5900 and 6683), coconut palms with coconuts (3200–3205), round European trees, a gabled cottage (5686–5716) and tall green mountains (3546–3569). Bahrain is flat, sandy and date-palm country.
- **V2** has the right *objects*: date palms with dates and dry fronds (1026–1074) and Gulf houses with parapets and barjeel wind towers (1279–1294).
  - But they stand in an inland green park with a ring of low-poly hills, and the sea is never seen from a station.
- **New:** V1's island and sea concept as the base, populated with V2's local props plus Bahraini landmarks (§3.8). The horizon stays low: sea, distant flat islands and a dhow, not mountains.

### 2.4 Ali (8–9-year-old Bahraini audience)

| Aspect | V1 (`shots/v1_ali_full.png`, `v1_ali_close_34.png`) | V2 (`shots/v2_ali_full.png`, `v2_ali_close_front.png`) |
|---|---|---|
| Proportions | Chibi: head about 1/3 of height. Big readable face from 5 m and more. ×1.35 scale (4622) makes him 2.49 m in VR (`vr.md` §5.2). | Natural 1.32 m, head about 1/6 (1160). Face is tiny at 3 m; looks lanky. |
| Face | Layered eyes (white, iris, pupil, 2 highlights), capsule brows, blush, nose button, 3 mouths (smile, open, O; 4760–4762), blink. Very expressive. | Dot eyes (0.0145 radius, 1193–1201), thin brows, one fixed torus smile (1203). Cannot look worried or excited. |
| Outfit | White thobe with placket and buttons, white ghutra (lathe crown plus drape, 4576–4597), black double agal (4595–4597), sandals. Instantly "Gulf boy". | White thobe, khaki explorer vest, bush hat with teal band (1204–1206), coral backpack with an accurate Bahrain flag (1153–1158, 1184) that faces away from the viewer. "Explorer", less local. |
| Construction | 64 meshes and 20.4k triangles, inverted-hull navy outline on 12 parts (`qp` 4338–4349). Ghutra drapes are zero-thickness `side:2` planes (4356); in 3/4 view the face looks like a flat disc between two cards (`v1_ali_close_34.png`). | Simple primitives; arms are cylinders; mitten hands; feet buried in the hub and hall (1783). |
| Animation | 8 poses with slerp blending (4648–4838), point-at-target (4770–4775), think, celebrate. | Wave, point, cheer and talk blends (1239–1258). Cheer passes through a T-pose (`v2_st1_after.png`, `v2_st2_after.png`). |
| Child appeal | **High.** Cute, warm and confident. | **Medium-low.** Reads as a mannequin from the pad. |

Verdict: **V1's Ali is the base.** From V2, take the explorer story props, but put the flag patch where children can see it (§3.7).

### 2.5 Stations: can a child see what happened?

| Station | V1 end frame | V2 end frame |
|---|---|---|
| 1 Earthquake | Yes. A dark crack with a light rim crosses the road and grass, with branches (`v1_st1_after.png`). The slab drop is barely visible, and the house is unchanged. | Barely. Two thin black zig-zags on a lavender road (`v2_st1_after.png`); the other three are buried (`v2_st1_after_down.png`). The crack `#5e5172` on road `#b8b3cb` is 3.57:1, and the lines are only a few pixels wide. |
| 2 Volcano | Yes. An orange ribbon from the crater down to a base pool (`v1_st2_after.png`), but it is patchy where the cone noise pokes through (`v1_zoom_volcano.png`). No smoke or ash is visible. | Partly. Three orange tubes on a pink cone: same luminance (1.03:1), so they read as "ropes". Grey smoke puffs are visible (`v2_st2_after.png`). |
| 3 Weathering | Yes, but the bubble covers the rock (`v1_st3_after.png`). In mid-play (`ped_v1_s3_b_mid.png`) the crack network on the rock is excellent. | Yes, a heap of lilac polyhedra beside the spot (`v2_st3_after.png`). They read as gems or plastic rather than rock; the ring is invisible (`v2_st3_after_down.png`). |
| 4 Erosion | Yes. Stream, particles, arrows, deposit fan at the pond (`ped_v1_s4_b_mid.png`). In the after frame the bubble covers the middle (`v1_st4_after.png`). | Yes. Bits in the stream, deposit pile, «إلى هنا» sign (`v2_st4_after.png`). «من هنا» is hidden behind the board (1476 vs 1645). |
| 5 Human | Yes. Flattened plot, paved road, excavator parked (`v1_st5_after.png`, but the bubble covers the road); قبل/بعد toggle (`v1_st5_toggle_before.png`). | Yes. Road plus excavator; before thumbnail on an easel (`v2_st5_after.png`); "قارِن:" half hidden by the pole. |

### 2.6 Boards, cards, buttons, typography

- **V1 boards** (`Bp` 4052–4189):
  - Best layout: small mint kicker «المحطة ١ من ٥», a big navy title with an orange underline, body text and a footnote.
  - The erosion compare board with two pictures (5434–5490, `v1_zoom_erosion_board.png`) is excellent, but its left label is clipped (5475–5480).
  - Unlit canvas means colours stay true everywhere.
  - In VR the boards are 12–14 m away (`vr.md` §5.2), so on-screen size is fine but stereo depth is lost.
- **V1 3D buttons** (`ep` 2600–2765): tactile rounded keys with a darker base, icon and label. They read well as "pressable".
  - White text on `#ffad5c` orange is 1.84:1 (`v1_st1_before.png`).
  - Placement is off: off-screen at the volcano (`buttons:[-5.4,1.1,5.6]`, 5240; `v1_st2_after.png`), and behind Ali at station 1 (`v1_st1_after.png`).
- **V2 panels and buttons** (794–928):
  - Crisp text at 400–560 px/m, and Baloo Bhaijaan 2 is lovely for children.
  - The lectern (1688, tilt −0.85) is the best ergonomic choice in either version (`v2_hub_down.png`, `xr_v2s_3.png`).
  - Problems: lit materials (800, 830, 878) give grey cards in the hall (`v2_quiz.png`); label auto-shrink makes «أعِد المشاهدة» smaller than its neighbours (`v2_st1_after.png`); white on coral, teal and lavender is 2.4–2.6:1.
- **Typography.** Both shape Arabic correctly through canvas RTL.
  - Cairo (V1) is geometric and a little square and formal.
  - Baloo Bhaijaan 2 (V2) has rounder counters and generous x-height, and is visibly friendlier and more legible for early readers (`v2_st1_before.png` against `v1_st1_before.png`).
  - V2 mixes numeral systems: Arabic-Indic «١ الزلزال» in hub labels (1682) and Western «5 من 5» on results.

### 2.7 Quiz cards and pictures

- Both versions use same-scene thumbnails (V1 `nh` 7734–7809; V2 1755–1771). The pictures are consistent with what was watched, but they test recognition only (`pedagogy.md` §6.1).
- **Captions leak answers**: «طريق متشقق بسبب **زلزال**» for «أي صورة تُظهر **زلزالًا**؟» (V1 5131; V2 1611).
- The V1 card is cleaner: cream face, image well, letter badge top-right, caption below, unlit (`v1_quiz.png`).
- The V2 card is larger and closer, but grey, and its badge collides with the letter disc (`v2_practice_answered.png`).
- V2 thumbnails have no MSAA (render targets 635–647), so they are aliased (`v2_quiz.png`).

### 2.8 Results and celebration

- **V1** (`v1_results.png`) is the most celebratory scene: stage, five pop-in stars, balloons, confetti, a gold-framed certificate easel and Ali cheering.
  - The stage is a big grey disc; the stars look muddy; the bubble sits on top of both boards.
  - In VR the retry button covers the download button (`v1_vr_results.png`).
- **V2** (`v2_results.png`, `v2_results_badge.png`) has bright toon gold stars and a charming medallion with ribbons («المستكشف الصغير», 1743–1748).
  - The medal is placed off to the left and overlaps a pillar; the white floor glares; nothing is taken away.

---

## 3. Art direction for the new game

### 3.1 Pillars

1. **"Bahrain in miniature": living tabletop dioramas on a sunny island.**
   - Each phenomenon happens on a round tabletop diorama 1.4–1.8 m from the child, with the table top at eye height minus 0.55 m (`vr.md` §13.5).
   - The real island stays around you as a calm backdrop.
   - The table edge is a **cut-away of the ground** (soil and rock strata bands), so "the Earth's crust" is literally on show. The earthquake crack runs down this edge.
2. **Every colour has a job.** The hues are:
   - World colours: sky, sea, sand, palm.
   - One station hue per concept: sudden = hot, slow = cool, people = yellow.
   - UI roles: ink, paper, act, next, back.
   - Feedback colours: correct, wrong.

   No hue is decoration only, and no surface is grey-minimal.
3. **The end state tells the story.** The final frame of every station must show the change *without* animation or text: a big crack, cooled lava and ash, a split rock in place, an empty top and a full bottom, a road where mounds were. That frame is also the quiz picture (A form).
4. **Soft toy materials, crisp UI.**
   - World: chunky toon-shaded shapes, vertex-colour gradients, rounded silhouettes.
   - UI: flat, unlit, high-contrast, big rounded Arabic type.
5. **Quest-cheap by construction.** One or two shader programs for the world, no real-time shadows, and only the current place rendered (`vr.md` §13.2).

### 3.2 Palette (hex tokens)

Swatch sheet: `shots/art_palette.png`.

**World**

| Token | Hex | Use |
|---|---|---|
| skyTop / skyMid / haze | `#4FB0E8` / `#A9DDF6` / `#FFE8CC` | Sky dome gradient (V1 `Mp` shader 3455–3490); warm haze at the horizon and in the fog |
| seaDeep / seaShallow / foam | `#1A8FBF` / `#47CFD6` / `#F2FFFE` | V1 sea shader (`Np` 3491–3545) recoloured to Gulf turquoise |
| sand / sandShade / wetSand | `#F3D9A4` / `#D9B27A` / `#C9A77E` | Ground, beach bands |
| grass / grassShade | `#8FCF6A` / `#68B05A` | Irrigated garden patches only, never the whole island |
| palmFrond / palmTrunk / dates | `#5DAA4E` / `#A3714A` / `#D9822B` | Date palms |
| limestone / rockShade | `#E6CFAB` / `#B98E62` | Desert rock (Jebel Dukhan type) |
| soil / soilDark | `#A9703F` / `#7A4E2D` | Erosion and human stations; table strata |

**Built environment and phenomena**

| Token | Hex | Use |
|---|---|---|
| wall / parapet / doorTeal / woodTrim | `#F4E3C6` / `#E5CBA0` / `#2E8C8C` / `#8A5A3B` | Gulf houses (V2 `house()` 1279–1294 recoloured) |
| asphalt / roadLine / roadYellow | `#8E98A6` / `#FFFFFF` / `#FFD34D` | Roads |
| crack / crackRim | `#2A1E1A` / `#F2D3A4` | Earthquake crack: 5.5:1 against asphalt, plus a light rim |
| basalt / basaltTop | `#4A3B3B` / `#6E5853` | Upper volcano cone (lower skirt grades to sand and green) |
| lava / lavaCore | `#FF7A2E` / `#FFD25A` | Lava 4.1:1 and core 7.4:1 against basalt (V2 was 1.03:1) |
| ash | `#8C8399` | Ash and smoke, darker than the sky so it shows (V1's pale smoke vanished) |
| water / waterHi | `#3FB6E3` / `#C2F0FF` | Streams, pond, rain |
| freshScar | `#F4E2C6` | Freshly exposed rock faces in weathering (2.3:1 against rockShade, plus a shading break) |
| excavator | `#FFC22E` | Machines; also the human-station hue |

**UI**

| Token | Hex | Role |
|---|---|---|
| ink / inkSoft | `#1F2F57` / `#4A5A80` | All text: 12.2:1 and 6.4:1 on paper |
| paper / card | `#FFF6E6` / `#FFFFFF` | Board faces / answer cards and bubble |
| frame | `#2B4A7A` | Neutral frames (quiz cards, question board) |
| ctaSun (+ base `#D97A00`) | `#FF9F1C` | The one "do this now" action. **Ink label** (6.4:1). White on it is only 2.05:1. |
| teal2 | `#128C8A` | التالي / continue, with white label (4.1:1) |
| backLav | `#7A6CC9` | السابق / back and secondary, with white label (4.4:1) |
| correct | `#1C9A57` | Correct fill, with ✓ and white label (3.6:1) |
| wrong | `#E0464B` | Wrong: outline and ✗ badge only, never a full fill (4.1:1) |
| gold / pearl | `#FFC93C` / `#F7F3EE` | Stars, medal, the reward pearl |

**Station hues (the meaning system)**

| Station | Hue | Meaning chip on the board | White-label contrast |
|---|---|---|---|
| ١ الزلزال | `#D6457A` hot rose | «يحدثُ فجأةً» with a lightning icon | 4.2:1 |
| ٢ البركان | `#F05A28` lava orange | «يحدثُ فجأةً» | 3.4:1 |
| ٣ التجوية | `#7B5FD6` cool violet | «يحدثُ ببطء» with a snail or clock icon | 4.7:1 |
| ٤ التعرية | `#1C84DB` cool water blue | «يحدثُ ببطء» | 3.9:1 |
| ٥ تغييرات الإنسان | `#FFC22E` construction yellow (ink label) | «من صُنعِ الإنسان» with a hard-hat icon | 8.1:1 (ink) |

Rules:
- A station hue appears on its signpost, board frame and underline, tabletop rim ring, evidence markers (rings, arrows, «من هنا / إلى هنا» signs), map pin, progress stamp and confetti.
- A station hue **never** appears on quiz cards, quiz pictures or answer feedback, so colour cannot give away an answer.
- Feedback uses green fill + ✓ for correct, and a red outline + ✗ + shake for wrong. Shape and icon carry the meaning, which keeps it safe for colour-blind children.

### 3.3 Materials and shading (Quest 2)

- **Renderer.** `THREE.ColorManagement.enabled = true`, `outputColorSpace = SRGBColorSpace`, `toneMapping = NoToneMapping`, no shadow map (`vr.md` §13.2–13.3). Author all hex values in sRGB.
- **World material.** One shared `MeshToonMaterial({ vertexColors: true, gradientMap: 3-step })`, where the gradient is a 3×1 `DataTexture` (values 0.62, 0.84, 1.0, NearestFilter). It gives V2's soft banded look at Lambert cost. If the toon bands alias on Quest, fall back to `MeshLambertMaterial({ vertexColors: true })`.
  - **Bake AO and a vertical gradient into vertex colours** when geometry is generated: darken 15–25% toward the ground contact and at concave joints; lighten tops by 6%. Do this per prop before merging.
  - Merge static props per place (`mergeGeometries` is already bundled in V1 at 2785).
- **Lights.** One `HemisphereLight(sky #CFEFFF, ground #E9C9A0, 1.0)` and one warm `DirectionalLight(#FFF0D8, 1.4)` without shadows.
  - **Turn the sun with the current place**: key from 35° left of the viewer's shoulder and 50° up. Every diorama is then lit the same way from the pad, which removes V2's orientation-dependent darkness (B9).
- **Characters.** Same toon material plus a cheap rim via `onBeforeCompile` (rim 0.12, warm white), and the navy inverted-hull outline (V1 `Gp/qp` 4325–4349) on **Ali only**, merged to 1–2 draws.
- **Unlit things.** Sky, clouds, far islands, UI, bubble, lava, water highlights, glow cards: `MeshBasicMaterial` (V1 `Bf` pattern 2329–2331) with `toneMapped:false`, opaque and painted panel colour (no blending).
- **Contact shadows.** One shared 128² radial blob texture (V2 `blob()` 1146–1150).
  - Each blob is placed **on top of** the surface it shadows (+3 mm, `polygonOffset(-1,-1)`), `depthWrite:false`, opacity 0.22–0.3.
  - At most 10 visible per place. Ali's blob scales with his bounce.
  - Unit-test that every blob's y is at least the surface y (V2's B2 bug).
- **Outlines on props.** None in the environment. Interactive props (the excavator, the "press me" rock in hands-on moments) get a pulsing station-hue rim when hovered.
- **Fog.** Linear, haze colour `#FFE8CC`, start 35 m, end 160 m; the sky has `fog:false`.
- **Anti-aliasing hygiene.**
  - Nothing thinner than 3 cm at the diorama: crack ribbons 4–8 cm wide, road dashes 5 cm.
  - MSAA 4× on the XR layer.
  - Thumbnails are rendered to a `WebGLRenderTarget` with `samples:4` (V2 had none).

### 3.4 Sky, sea, particles

- **Sky.** V1 `Mp` gradient-and-sun-glow shader (3455–3490) with the new tokens. Clouds are V2-style merged puffs, unlit with a vertex gradient (`#FFFFFF` top, `#E6EEF8` belly), at most 80 triangles each and at most 8 visible.
- **Sea.** V1 `Np` (3491–3545) unchanged in technique, recoloured. Add one dhow silhouette that drifts slowly (≤ 400 triangles).
- **Particles.** At most two systems per place, at most 400 points (`vr.md` §13.2):
  - dust: sand colour, additive off;
  - ash and smoke: `#8C8399` to `#BDB6C6`;
  - rain: `waterHi` streaks;
  - confetti: in the station hues.

### 3.5 Typography

- **Face.** **Baloo Bhaijaan 2** (OFL licence), 600 and 800, as an embedded subset woff2. Fall back to Cairo (V1's embedded set), then system Arabic.
  - Wait for `document.fonts.load()` before drawing any canvas, and redraw on `loadingdone` (V1 10091–10102; avoids V2's B19).
  - Keep V1's RLE/PDF bidi wrapping (2016–2018) and measure-then-size layout (2420–2430).
- **Sizes.** Follow `vr.md` §13.4: body 1.5° (never below 1.2°), buttons 2°, headings 2.5–3°, score 4°. Canvas resolution `ppm = ceil(1150/d)`. Line height 1.4. Leave room for tashkeel above and below.
- **Weights.** Titles and buttons 800; body 600. **No text below 600 in VR.**
- **Numerals.** Pick **one** system and use it everywhere, including «السؤال ٢ من ٥», «٤ من ٥» and the certificate. Default to Arabic-Indic digits (٠–٩) to match the hub labels children saw in V2 (1682). Confirm against the grade-3 textbook. V2's mix is a bug.
- **Underlines and accents.** Draw them from the measured bounding box of each wrapped line, never at a fixed y (V1's certificate bug, 8839–8847).
- **Text never sits on a 3D-lit surface.** Every text face is an unlit opaque canvas.

### 3.6 UI kit style

- **Board (info panel).** V1 `Bp` layout (4052–4189) on V2-style placement (1.8 m, eye height minus 0.10 m):
  - a paper face `#FFF6E6`;
  - a 4 cm rounded frame in the **station hue**;
  - kicker «المحطة ٣ من ٥» in inkSoft;
  - the title in ink at 800 with a 6 px underline in the station hue;
  - body text;
  - the concept chip from V2 («التجوية = تفتُّت», 1592–1595) in a hue-tinted pill;
  - the speed chip («يحدث ببطء»);
  - after watching, a **before → after strip** of two mini thumbnails joined by an arrow. This is V2's easel idea (1700–1705) made standard for all five stations.

  Before watching, the board shows V2's «ما اسم هذا المظهر؟ شاهِد لتعرف» (1655–1656) together with V1's «ماذا سيحدث؟» (5069).
- **Lectern (control bar).** V2 geometry and placement (1688, 1691–1697), tuned to `vr.md` §13.5: 1.0 m away, about 25° below eye level, tilted 40°.
  - It carries ≤ 5 V1-style candy keys (`ep` 2600–2765) of at least 0.26 × 0.12 m, with the icon on the right (RTL leading side) and 1–2 words.
  - Colour roles are fixed: ▶ شاهِد / أعِد = ctaSun with ink label; التالي = teal2; السابق = backLav; 🗺 الخريطة and ⚙ = white with ink.
  - Disabled keys are desaturated to 45% and show a small lock icon, so state is never shown by grey alone.
  - Hover: lift 2 cm, white rim glow, haptic tick. Press: 85% squash.
- **Answer card.** V1 anatomy (`em` 4863–5055):
  - white card, `frame #2B4A7A`, picture well 4:3, caption below (ink 600), letter badge أ/ب/ج top-right in a navy disc;
  - the result badge (✓/✗) goes in its **own slot** at top-left, so it never covers the letter (V2 B12);
  - states: hover lifts 3 cm; correct is a green fill with ✓, a sparkle, then the others dim; wrong is a red outline with ✗ and a shake, after which the correct card glows and the child must select it (`pedagogy.md` §6.3).
- **Bubble.** V2 look (1222–1238): white, 6 px `teal2` stroke, soft drop shadow, tail toward Ali's mouth.
  - At most 1.0 × 0.45 m and 3 lines, anchored at Ali's head on his **outer side** (away from the diorama).
  - It billboards on yaw only, reading the pose from the user camera (`vr.md` §5.4).
  - A speaker icon replays the voice-over.
  - It never overlaps the diorama's action cone or the board. Unit-test it with projected bounding boxes.
- **Progress.** An "explorer passport" strip at 1.8 m, eye height plus 0.45 m: five circular stamps in the station hues, filled when a station is done and shown as a dotted outline when open. This replaces V1's HTML stepper (8246–8316) inside VR.
- **Island map table** (hub, and reachable from 🗺): a 1.2 m round tabletop model of the island (low-poly copy of the backdrop) with five pins in the station hues plus the hall pin. Lock, open and done states use shape as well as colour (padlock, ring, ✓). This replaces V1's HTML map (`openMap` 9832–9881).

### 3.7 Character brief: Ali «علي»

- **Who.** A 9-year-old Bahraini boy, a curious young field explorer, and the child's guide and friend. Tone: warm, brave, a little goofy, never mocking.
- **Size in the world.** **1.32 m tall** (feet on the surface, always). He stands 2.0–2.4 m from the child, 25–35° to the right (RTL reading flow from Ali to the content on the left; `vr.md` §13.5).
- **Proportions.** "Junior cartoon", between V1 and V2:
  - head height 0.30 m (about 1/4.4 of body height), head width 0.29 m;
  - torso and thobe a slightly tapered cone, short arms (wrist at mid-thigh), small mitten hands with a thumb (V1);
  - silhouette is readable at 3 m: white ghutra triangle, black agal ring, khaki vest block, coral straps.
- **Face** (V1 rig, 4389–4853, kept):
  - big eyes 0.055 m tall with brown iris `#4A2E1F` and two highlights;
  - thick animated brows `#2A211E`, button nose, blush `#F2A08C` at 35%;
  - skin `#D9A273`, shade `#BF8559`;
  - mouth set: smile, talk-open, "O", **worried/encouraging** (new; for «لا بأس»), big grin (new; for celebrate);
  - blink every 2.5–5 s.
- **Outfit.**
  - **Thobe**: warm white `#FAF7F0` (never pure `#FFFFFF`, which glares on Quest LCD), shade `#E6E1D6`. V1 collar placket with three buttons and cuffs.
  - **Ghutra**: white `#FFFFFF` with a soft shade `#ECEFF3`, **modelled with 2–3 cm thickness** (closed shell, not planes), worn with the side flaps folded back over the shoulders. The face profile stays clear and the 3/4 view no longer looks like cardboard (fixes `v1_ali_close_34.png`).
  - **Agal**: black `#18181C` double cord (V1 tori 4595–4597) plus two short tassels at the back.
  - **Explorer kit** (from V2 1178–1186):
    - khaki vest `#CDB183` with teal `#128C8A` piping and two chest pockets;
    - a magnifying glass clipped to the right pocket (used in the "inspect" pose);
    - coral backpack `#D9826E` whose straps show from the front;
    - **Bahrain flag patch on the left chest of the vest**, 5 × 3 cm, accurate 5-point serration (V2 `flagTexture` 1153–1158). On V2 it was on the back and never seen.
  - **Sandals**: brown `#8B5A3C`.
- **Outline.** Navy `#1F2F57`, 0.9 cm inverted hull, on the merged body, head and ghutra (V1 `Gp` 4325–4337).
- **Poses** (V1 library 4648–4765, plus additions):
  - idle breathe, wave, point-at-target (aims at the station's evidence marker), think, thumbs-up, encourage, celebrate, walk;
  - **new**: "inspect" (leans in with the magnifier), "brace" (knees bend while the earthquake shakes), "shield eyes" (looking at the volcano);
  - celebrate must go arms-up through a crouch-and-jump and never pass a T-pose (V2 bug).
- **Lip-sync.** V1 timer flaps (4760–4762), driven by the duration of the recorded voice-over clip.
- **Budget.** At most 6k triangles and at most 8 draws including the outline: merge per bone group (V1 is 64 meshes; `v1.md` §2).
- **Optional (decision for the product owner):** girls' schools are half the audience (`pedagogy.md` §0.9). A companion **نورة** built on the same kit (long dress, shayla/hijab, the same vest and passport) can be selected by the teacher, and the lines use gender-aware forms. Art-wise this is cheap because she shares the rig, palette and poses.

### 3.8 Environment brief

- **Layout.** A round island in a turquoise sea (V1 concept). Stations sit on a ring path; only the current place plus a backdrop of at most 30k triangles is rendered.
  - Each place is a **wooden deck pad** (teal ring, as in V2 1638) facing its diorama table, the board and Ali, with the island and sea behind.
- **Ground.** Sand dominant. Irrigated green patches only around houses and palms. A pale sabkha strip near the shore, a low dune on the far side, and limestone outcrops.
  - Terrain at most 8k triangles with vertex colours (`vr.md` §13.2).
- **Vegetation.** Instanced per sector so frustum culling works; no pines, no coconuts, no 16×12-sphere canopies.
  - **Date palm** (V2 `palmItems` 1026–1074 simplified): 10 fronds as curved strips with leaflet notches in geometry and 1–2 date clusters. LOD0 ≤ 900 triangles, LOD1 cross-card ≤ 150.
  - **Sidr / ghaf tree**: low flat-topped ico canopy, flat shaded, ≤ 250 triangles.
  - **Bougainvillea bush** (magenta `#D6457A` flowers on green, at house walls): ≤ 120 triangles. This is the earthquake hue, used on purpose at station 1.
  - **Desert grass tufts**: ≤ 20 triangles.
  - **Mangrove clumps** at one shore (Tubli Bay nod).
- **Landmarks** (backdrop, one merged mesh each, ≤ 3k triangles):
  - a sand-coloured fort silhouette with round towers, inspired by Qal'at al-Bahrain;
  - a dhow on the sea;
  - a lone desert tree on a dune (Tree-of-Life nod), placed in the background of the weathering station;
  - two or three barjeel houses near the earthquake station.
- **Hub: "explorer camp".** A shaded canvas awning (teal and white stripes), a crate stack, a flag pole with the island pennant, the island-map table, and Ali at the table.
  - The V1 gate (`Up` 4217–4321) can be reused as the camp entrance with the title board «مغامرة المستكشف علي».

### 3.9 Station-by-station visual brief

Every station shares these rules:
- The table top is 1.6 m in diameter at eye height minus 0.55 m. A **rim ring in the station hue** shows the station number in the hub. The **table edge is a strata cut-away**: topsoil `#A9703F`, sand `#F3D9A4`, limestone `#E6CFAB`, deep rock `#B98E62`.
- The action area is at most 35° of view; nothing important is behind Ali or the board.
- Simulations keep V1's deterministic contract `{duration, cues, applyAt(t), update}` (`cm` 5266–5646), so before (t = 0), after (t = 1), scrubbing and thumbnails are free.
- Before watching, the board shows «ماذا سيحدث؟ / ما اسم هذا المظهر؟». After watching it shows the name, chip and before → after strip.
- Evidence markers (station hue) appear only after the change is done, and Ali points at them.
- **Thumbnail A** is rendered from the `pictureView` at the listed t, with Ali, UI, signs and evidence markers hidden, on the neutral quiz stage (§3.10).

#### ١ الزلزال (hue `#D6457A`)

- **Must SEE:** the ground shook suddenly and now has a crack and a step.
- **Before (t = 0):**
  - a little Gulf street: two or three barjeel houses (V2 `house()` 1279–1294) in `wall`/`parapet` tones with teal doors;
  - an asphalt road with white and yellow dashes, a pavement kerb, a street lamp, a garden wall with bougainvillea, one date palm, two flower pots.
- **Process (≈ 5 s):**
  - shake envelope `sin(πt)^0.8` (V1 5927–5949) applied to the **diorama content, never the camera** (V2 1324–1328);
  - hot-rose shake rings pulse around the houses (V1 shake marks 5953–5962);
  - a rumble cue, then the crack reveals outward from the road centre (V1 `lm` and `aReveal` 5841–5848, 5963–5965), runs across the road and the garden wall, and **continues down the table's strata edge**;
  - dust puffs in sand colour.
- **After (t = 1):**
  - a crack 6–8 cm wide in `#2A1E1A` with a `#F2D3A4` rim (5.5:1 against asphalt);
  - one road slab dropped 6 cm with a visible step face (V1 5950–5952, made larger);
  - the street lamp tilted 12°, a zig-zag hairline on one house wall, one fallen flower pot, settling dust;
  - **no collapse and no people hurt**.
- **Markers:** a hot-rose dashed outline around the crack; the board chip «يحدثُ فجأةً».
- **Thumbnail A (after, t = 1):** high 3/4 view (elevation 40°), crack diagonal through the frame centre, step face and tilted lamp visible, houses at the top edge.
- **Transfer vignette B:** a cracked desert car park or schoolyard with a tilted road sign and a split kerb. Different scene, same evidence.
- **Don't:** use a European gabled cottage (V1 5686–5716) or a lavender road (V2 1017).

#### ٢ البركان (hue `#F05A28`)

- **Must SEE:** materials come *out* of the volcano: lava, ash, rocks.
- **Before:**
  - an island-volcano diorama: the table is sea `seaShallow`, with a cone of basalt `#4A3B3B` at the top grading to `#6E5853`, then sand and a green skirt at the base;
  - a closed crater with one thin steam wisp; two palms on the beach.
- **Process (≈ 9 s):**
  - the crater glows (unlit emissive disc; no PointLight, unlike V1 6167);
  - the lava pool rises (V1 `xm` radial mode 6201–6205);
  - 2–3 lava ribbons advance with V1's wobbly front and hot bands (5998–6035), offset 3 cm **plus `polygonOffset(-2,-2)`** so the cone never pokes through (V1 bug 6121–6157);
  - an ash column of violet-grey puffs `#8C8399` that darken the sky locally;
  - 4–6 glowing rocks arc out and land on the slope (cool from `lavaCore` to `basalt`);
  - where lava meets the sea, white steam puffs.
- **After:**
  - lava rivers to the shore, with edges cooled to dark crust;
  - an ash plume drifting;
  - scattered rocks on the slope;
  - a small new black-lava delta in the sea (the land changed).
- **Markers:** a lava-orange arrow «تخرج من الفوهة» pointing out of the crater; the chip «يحدثُ فجأةً».
- **Thumbnail A** (t ≈ 0.75, lava mid-slope and ash rising): front 3/4 view, cone fills 70% of the frame height, ash reaching the top edge.
- **Transfer vignette B:** a different-shaped volcano (a broad shield with a side vent) erupting ash at dusk-orange light.
- **Don't:** use a pink cone (V2 1340 `#d5ae9e`; 1.03:1 with lava) or pale smoke on a pale sky (V1 6216–6232).

#### ٣ التجوية (hue `#7B5FD6`)

- **Must SEE:** a rock *slowly* breaks into pieces that **stay in the same place**, because of water, heat and roots.
- **Before:**
  - a big limestone boulder `#E6CFAB`/`#B98E62` on a desert patch, one hairline crack, a small sidr seedling at its base;
  - the lone-tree-on-a-dune landmark behind.
- **Process (≈ 8 s; a time-lapse that is visibly time-lapse):**
  - a small sun and moon orbit over the table (day and night cycle 4×) with a clock icon and the chip «نُسرِّعُ الزمن: سنواتٌ كثيرة» (`pedagogy.md` §2.3);
  - beat 1: rain drops fall into the crack;
  - beat 2: heat shimmer by day, a blue tint by night;
  - beat 3: the seedling's root (a growing tube) wedges the crack;
  - cracks darken and widen (V1 `setDrawRange` crack tubes 6332–6351);
  - pieces **split along the cracks and slump or slide down** at most 25 cm; no flying and no bounce (V2 1410–1414 bounce removed).
- **After:**
  - the same rock is now 3–4 big blocks plus rubble and grains, all inside its original footprint;
  - the split faces show `freshScar` `#F4E2C6`;
  - a violet dashed **footprint ring** at surface + 1 cm, 3 cm wide (fixes V2 1401–1402).
- **Markers:** the ring plus a violet pin «بقيت في مكانها»; the chip «يحدثُ ببطء».
- **Thumbnail A** (after): 3/4 view at 45°, the split blocks centred, rubble at the base, no ring (the ring is an evidence marker and is hidden in thumbnails).
- **Before/after strip:** whole boulder → split boulder.
- **Transfer vignette B:** an old fort wall with crumbling bricks and sand at its foot; or a rock split by a palm root.
- **Don't:** use lilac gem-like rocks (V2 `P.rock` 1018), a sudden explosion, or hide the rock behind the bubble (V1 `v1_st3_after.png`).

#### ٤ التعرية (hue `#1C84DB`)

- **Must SEE:** bits are **carried from here to there**.
- **Before:**
  - a slope (wadi) with a dry channel;
  - **at the top, the same rubble produced in station 3** (story bridge: «الفتات من المحطة السابقة»);
  - an empty pond basin at the bottom;
  - grass tufts on the banks.
- **Process (≈ 9 s):**
  - a rain cloud;
  - water reveals down the channel (V1 `Pm` stream shader 6498–6535) with white edge foam;
  - particles, half soil `#A9703F` and half stone `#B98E62` (V1 68-instance system 6634–6658 and 6710–6733), travel along the curve and fan out at the pond;
  - blue flow arrows pulse (V1 6736–6748);
  - the source pile shrinks and the deposit grows (V2 1495–1496).
- **Wind beat (3 s):** a dune at the side table edge; wind streaks; sand grains hop across a path. Ali: «والرياحُ أيضًا تنقلُ الرمال».
- **After:**
  - top: bare scoured rock;
  - bottom: a fan-shaped deposit `#8A5A35` on sand (4.3:1) at the pond's edge;
  - the channel visibly deeper (darker vertex band);
  - a sand drift over the path.
- **Markers:** «من هنا» (blue sign at the source) and «إلى هنا» (blue sign at the deposit), both **in front of** the diorama, not behind the board (fixes V2 1476 vs 1645); the chip «يحدثُ ببطء».
- **Thumbnail A** (t ≈ 0.55, mid-transport, V2's trick): the channel diagonal from top-right to bottom-left with particles mid-stream and the deposit starting, no signs.
- **Before/after strip:** full top and empty pond → empty top and full pond.
- **Transfer vignette B:** wind blowing sand from a dune across a road (a Bahraini everyday sight); or a beach after waves.
- **Don't:** let the bubble or Ali stand over the stream (V1 `v1_st4_after.png`), or place signs behind the board.

#### ٥ تغييرات الإنسان لسطح الأرض (hue `#FFC22E`)

- **Must SEE:** **people** changed the land: dig, move, flatten, build, pave.
- **Before:**
  - rough land with three sandy mounds, rocks and one palm;
  - a strip of shoreline at one edge (reclamation option «الدِّفان»).
- **Process (≈ 13 s):**
  - two small workers (hi-vis yellow vests, white hard hats; ≤ 400 triangles each) walk in;
  - V1's articulated excavator (`Um` 6762–6843) digs, swings and dumps into a yellow dump truck;
  - the ground flattens (precomputed keyframes, not V1's CPU rebuild 6991–7010);
  - the road paves left to right (V1 reveal 6896–6906 and 7100–7107);
  - a small house frame rises on the flattened plot;
  - the truck tips sand at the shoreline, so the land grows into the sea.
- **After:**
  - flat plot, paved road with kerbs and dashes, a house frame, a lamp post, a newly planted palm, a new strip of land at the sea edge;
  - the excavator is parked, the workers wave.
- **Markers:** V1's قبل/بعد tag (5383–5395) restyled as a yellow sign; a قبل/بعد toggle on the lectern; V2's easel (1700–1705) kept, showing the before thumbnail; the chip «من صُنعِ الإنسان».
- **Thumbnail A** (after, with the excavator and a worker still in frame, so the human agent is visible): 3/4 view, road across the lower third, house frame top-left.
- **Transfer vignette B:** land reclamation: dump trucks filling the sea edge beside new buildings; or a building site with a crane.
- **Don't:** show the machine as the agent alone (`pedagogy.md` §2.5), or let the bubble cover the road (V1 `v1_st5_after.png`).

### 3.10 Quiz picture rules (the "quiz stage")

- **Renderer.** Render on the main renderer into a `WebGLRenderTarget` with `samples:4` at 640 × 480 (4:3). Do not create the extra WebGL contexts V1 uses (7739, 7781, 7813).
- **Stage.**
  - A neutral cream backdrop gradient `#FFF6E6` to `#F3E6CF` behind the diorama, with no island backdrop, so the phenomenon is the only subject.
  - Camera FOV 32°, elevation 35–45°.
  - Key light fixed (same as §3.3).
  - Soft vignette 8%.
- **Hidden in every quiz picture:** Ali, UI, text signs, evidence markers, the station-hue rim (use the plain strata edge) and anything with a station hue. A coloured rim would let a child match the answer by colour.
- **A form** = the station's after or mid frame listed in §3.9. **B form** = a transfer vignette built from the same kit (≤ 8k triangles each, built only when the challenge loads, then disposed).
- **Captions name objects, never processes.** «صخرةٌ كبيرة»، «طريقٌ في الحيّ»، «تلٌّ وماء», not «صخرة تتفتت». See `pedagogy.md` §6.3.
- **Card picture well.** Rounded 4:3 with a 2 px inner keyline `#E5D8C2`. The picture fills at least 62% of the card face.

### 3.11 Challenge hall and results

- **Hall.** An open-air courtyard inspired by Bahraini fort architecture:
  - sand-coloured crenellated walls, three pointed arches behind the question board;
  - bunting in the **five station hues**, the one place where all concepts meet, so all hues appear together and none stands out;
  - a floor of warm sand `#F3D9A4` with a teal `#128C8A` eight-point-star inlay at mid luminance (no white glare; fixes V2 1720).
  - The question board sits at 1.8 m with a neutral navy frame; three answer cards on a 1.5 m arc at about 10° below eye level (`vr.md` §13.5). Ali is to the right.
- **Results.**
  - An oyster shell opens to reveal a **pearl medal «لؤلؤة المستكشف»**: a pearl `#F7F3EE` with a soft sheen (rim term), a gold `#FFC93C` bezel, and ribbons in teal and yellow.
  - Five toon-gold stars pop in (V1 timing 7628–7639, V2 toon look).
  - The **explorer passport** opens beside it with five hue stamps.
  - Confetti in the station hues (V1 instanced, ≤ 160).
  - Ali celebrates with no T-pose.
  - V1's certificate appears on an easel at 1.8 m (7493–7504), with the title underline drawn per measured line.
  - Download and print are offered after leaving VR (`vr.md` §13.5).
  - The bubble sits on Ali's outer side and never over the score board.
- **Below the pass mark:** the same scene without the pearl. Ali uses the encourage pose, and the stars that are earned light up (no grey "failed" stars). Stars not yet earned show as a dotted outline.

### 3.12 Art budgets per place (Quest 2)

Combined with `vr.md` §13.2.

| Item | Triangles | Draws |
|---|---|---|
| Diorama (static merged + animated parts) | ≤ 25k | ≤ 20 |
| Ali (+ outline) | ≤ 6k | ≤ 8 |
| Backdrop: terrain, vegetation sector instances, landmarks, sea, sky | ≤ 40k | ≤ 14 |
| UI: board, lectern, passport, bubble | ≤ 2k | ≤ 16 |
| Particles | ≤ 400 points | ≤ 2 |
| **Total per eye** | **≤ 75k** | **≤ 60** |

Canvas textures stay at or below 16 live at once and at or below 1024 px on a side, except the board (`ppm` rule).

---

## 4. Visual bugs found

Evidence is a screenshot under `shots/`. "Seen" means confirmed in this review's viewing; other rows cite the reviewer's probe.

### V1

| # | Bug | Code | Evidence |
|---|---|---|---|
| A1 | Certificate title wraps to two lines while the orange underline is drawn at a fixed y = 262, striking through «الصغير» (also on the 3D easel copy). | 8839–8847 | `v1_certificate_modal.png` (seen) |
| A2 | Erosion compare board: the left label is clipped, «التعرية = انتقال الفتا…». | 5475–5480 | `v1_zoom_erosion_board.png` (seen) |
| A3 | Lava ribbon: the cone noise pokes through, giving a patchy, broken lava stream. | 6121–6157 vs `Sm` 6036–6040 | `v1_zoom_volcano.png` (seen) |
| A4 | A palm frond pierces the volcano board (green sliver inside «ماذا سيحدث؟»). | placement 5240 area | `v1_st2_before.png`, `v1_st2_mid.png` (seen) |
| A5 | The speech bubble covers the phenomenon: the weathering rock, the erosion stream, the human road and the results boards. | `Yf.follow` 2494–2505, width 2420 | `v1_st3_after.png`, `v1_st4_after.png`, `v1_st5_after.png`, `v1_results.png` (seen) |
| A6 | Ali stands in front of the 3D buttons («أعد المشاهدة» behind his body). | `om/sm` 5215–5265 | `v1_st1_after.png` (seen) |
| A7 | Duplicate primary actions in two visual styles (3D sign button and HTML pill with the same label). | 2600–2765 vs `gh` 7961–8554 | `v1_st1_before.png` (seen) |
| A8 | 3D station buttons are off-screen at the volcano. | `buttons:[-5.4,1.1,5.6]` 5240 | `v1_st2_after.png` (seen) |
| A9 | Smoke is invisible against the pale sky, so "مواد بركانية" shows as lava only. | 6216–6232 | `v1_st2_after.png` (seen) |
| A10 | Results stars render muddy olive-gold under PBR and ACES. | 7464–7469, 15 | `v1_results.png` (seen) |
| A11 | Results stage is a large flat grey disc that dominates the lower half. | `Ym` 7391–7683 | `v1_results.png`, `v1_vr_results.png` (seen) |
| A12 | VR results: the retry button occludes the download button. | 7506–7515 | `v1_vr_results.png` (seen) |
| A13 | VR quiz: the answer cards cover the lower half of the question board and sit 10 m away. | `Km` 7285–7345 | `v1_vr_challenge.png` (seen), `xr_v1_challenge_q1.png` |
| A14 | Ali is 2.49 m tall in VR (giant). | scale 1.35 at 4622 | `vr.md` §5.2 |
| A15 | Ghutra drapes are zero-thickness double-sided planes; in 3/4 view they read as flat cards; no outline on the drape edges. | 4356, 4589 | `v1_ali_close_34.png` (seen, new) |
| A16 | In VR the bubble is skewed or invisible (wrong camera pose), and Ali faces away at the gate. | 2496–2497, 10031–10037 | `xr_v1_station_1.png`, `vr.md` §5.4 |
| A17 | In VR the welcome spawn is under the sea (renders sea-floor and sky only). | `placeVR` 9332–9339 | `v1_vr_welcome.png`, `v1.md` §4a |
| A18 | Stale reveal: the wrong card shows ✓ "correct" on the next question. | 7355 | `v1_bug_stale_reveal.png` |
| A19 | Wrong-answer line «الإجابة الصحيحة باللون الأخضر» depends on colour. | 5090–5094 | `v1_quiz_wrong_reveal.png` (seen) |
| A20 | The 3D «السؤال التالي» button is tiny and far below the cards (about 1° on desktop). | 9675–9685 | `v1_quiz_wrong_reveal.png` (seen) |
| A21 | White labels on the orange 3D buttons are 1.84:1. | `ep` 2633 on `X.orange` | `v1_st1_before.png` (seen) |
| A22 | Off-theme props: pines, coconut palms, a gabled cottage, tall green mountains. | 3128, 3200–3205, 5686–5716, 3546–3569 | `v1_hub.png`, `v1_st1_after.png` (seen) |

### V2

| # | Bug | Code | Evidence |
|---|---|---|---|
| B1 | 3 of 5 earthquake cracks are buried (y 0.008 < platform top 0.02). | 1316–1318 vs 1263 | `v2_st1_after_down.png` (seen) |
| B2 | Every station's blob shadow is buried, so objects float. | 1148, 1164, 1292, 1298, 1380, 1397, 1527 | all station shots |
| B3 | Ali's feet are buried 7 cm in the hub and 12 cm in the hall; the hall viewer pad is buried. | 1783 vs 1130, 1720 | `v2_hub_ali_feet.png`, `v2_quiz.png` (seen) |
| B4 | The weathering "stays nearby" ring is invisible (1 mm above the surface). | 1401–1402 | `v2_st3_after_down.png` |
| B5 | The «من هنا» sign hides behind the station board. | 1476 vs 1645 | `v2_st4_after.png` (seen) |
| B6 | The bubble (renderOrder 3) paints over the nearer «سؤال تدريبي» tag, which reads «ؤال تدريبي». | 685, 1222 | `v2_practice.png` (seen) |
| B7 | Quiz and practice cards are grey and muddy because the UI is lit by the world sun. | 800, 830, 878, 886 | `v2_quiz.png`, `v2_practice.png` (seen) |
| B8 | The ✓/✗ badge covers the letter disc on text cards. | 890, 899–901 | `v2_practice_answered.png` (seen) |
| B9 | The station board is cut off by the left screen edge at 16:10 on every station. | 1645 | `v2_st1_before.png` … `v2_st5_before.png` (seen) |
| B10 | The hall banner «قاعة التحدّي» is cut off at the top of the screen. | 1724 | `v2_hall_intro.png`, `v2_quiz.png` (seen) |
| B11 | The Q2 picture frame is half off-screen at the left. | 1732 | `v2_quiz_q2.png` |
| B12 | The results medallion overlaps a pillar. | 1743 | `v2_results_badge.png` (seen) |
| B13 | The hall floor renders as blown-out flat white (gamma lighting on `#efe7fb`). | 1720, 562–566 | `v2_quiz.png`, `v2_results.png` (seen) |
| B14 | The cheer pose passes through a T-pose. | 1239–1258 | `v2_st1_after.png`, `v2_st2_after.png` (seen) |
| B15 | Ali's bubble overlaps the right quiz card's ✗ badge. | 1222 | `v2_quiz_answered.png` (seen) |
| B16 | «قارِن:» is half hidden by the board pole; the قبل/بعد buttons float in mid-air. | 1700–1705 | `v2_st5_after.png` (seen) |
| B17 | The practice question panel overlaps the station board text. | 1856–1869 | `v2_practice.png` (seen) |
| B18 | Lectern label auto-shrink: «أعِد المشاهدة» is smaller than the other labels. | 850 | `v2_st1_after.png` (seen) |
| B19 | Lava on the pink cone is 1.03:1 in luminance, so it reads as orange rope. | 1340–1341, 1350–1353, P.volcano/P.lava 1019 | `v2_st2_after.png` (seen) |
| B20 | The lavender road `#b8b3cb` does not read as asphalt; crack contrast is 3.57:1. | 1017 | `v2_st1_after.png` (seen) |
| B21 | Lilac rocks `#c3b8cc` read as gems or plastic. | 1018 | `v2_st3_after.png` (seen) |
| B22 | White labels on coral, teal and lavender buttons are 2.4–2.6:1. | 750–753, 826–860 | lectern shots (seen) |
| B23 | Mixed numerals (Arabic-Indic in the hub, Western elsewhere). | 1682 vs 1901, 1933, 1942 | `v2_hub.png`, `v2_results.png` (seen) |
| B24 | The Bahrain-flag patch faces away from the viewer (on the back of the backpack). | 1184 | `v2_ali_close_34.png` (seen) |
| B25 | Thumbnails have no MSAA, so edges are aliased. | 635–647 | `v2_quiz.png` (seen) |
| B26 | Earthquake and volcano share the same coral board frame, so the colours carry no meaning. | 1644 | `v2_st1_before.png`, `v2_st2_before.png` (seen) |

### Both

- Quiz captions leak the answer: V1 5131 and 5200; V2 1611–1615.
- Quiz pictures are identical to the station scenes, so they test recognition only: V1 `nh` 7734–7809; V2 1755–1771.
- No black textures were seen in any capture.
- No z-fighting was seen on the boards in V1. V2's 3 mm canvas offset over the frame (809) holds up in all shots.

### "Never again" checks for the new build

These are cheap automated tests that reuse the review tooling:
1. Every blob, crack, ring and marker has `y ≥ supportingSurfaceY + 0.002`. Ali's feet are at the surface ±1 cm.
2. Project the bounding boxes of the bubble, board, lectern, cards and diorama action cone at each place, and assert no overlap from the pad camera, both desktop 16:10 and VR 90°.
3. Every text face is a `MeshBasicMaterial` with `toneMapped:false`. Assert no `Lambert`, `Toon` or `Standard` material carries a canvas map.
4. Contrast check on every label colour pair: ≥ 4.5:1 for body text, ≥ 3:1 for bold text of 2° or more.
5. Underline and accent y positions come from the measured line boxes.
6. Quiz pictures contain no pixels within ΔE < 10 of any station hue.
7. Ali's world height is 1.30–1.35 m in every place.
