# مغامرة المستكشف علي في عالم الأرض المتغيّرة

Arabic science game for Grade 3 (Kingdom of Bahrain), lesson «الأرضُ تتغيّر»: earthquake, volcano, weathering, erosion and
human changes. Plays in a Meta Quest 2 headset (WebXR) and on computers and tablets. The whole game is one offline HTML
file: `dist/index.html` (three.js, fonts and sounds inside, nothing loaded from the internet).

## Play it

- **Computer or tablet:** open `dist/index.html` in a browser.
- **Quest 2, by USB (no hosting needed):**
  1. Turn on developer mode for the headset (Meta Horizon app → Devices → Developer mode), plug it into this PC and
     allow USB debugging inside the headset.
  2. `npm run quest` — serves the game and runs `adb reverse`, so the headset can reach it.
  3. In the Quest Browser open `http://localhost:8080` and press «ادخل بالنظارة». (`localhost` counts as a secure
     origin, so VR works without HTTPS.)
- **Quest 2, over Wi-Fi:** the Quest Browser only allows VR from `https://`. Put `dist/index.html` on any HTTPS host
  (GitHub Pages, Netlify, the school website) and open that link in the headset.

Teacher dashboard, certificate download and printing are on the start screen («لوحة المعلّم»). Progress and results are
saved in the browser of the device that plays.

## Develop

```bash
npm install
npm run build:dev      # dist/index.html, readable code
npm run build          # minified release
npm test               # full playthrough on screen (hub → 5 stations → challenge twice → teacher dashboard)
npm run test:xr        # the same inside an emulated Meta Quest 2 (IWER)
node tools/look.mjs dist/index.html shots/look --places quake,hub --after [--xr]   # screenshots from the child's pad
node tools/snap.mjs station quake                                                  # one diorama in the sandbox
```

`?test&speed=8` in the URL exposes `window.__ali` (state and actions) and speeds up the game clock.

## Where things are

- `src/game/content.js` — every word the child hears or reads (lesson script, quiz bank with A and B forms).
- `src/game/` — game flow: hub, stations, challenge hall, widgets, quiz pictures.
- `src/stations/` — the five dioramas; `src/world/` — island, Ali, quiz vignettes.
- `src/core/` — engine (renderer, WebXR), input (controllers, hands, gaze), 3D UI kit, audio, speech, storage.
- `src/shell/` and `src/index.html`, `src/styles.css` — start screen, settings, help, teacher dashboard, certificate.
- `ARCHITECTURE.md` — module contracts, coordinates, Quest 2 performance budget.
- `review/` — reviews of the two earlier versions (code, VR, pedagogy, art); `ref/` — those earlier versions.
- `tools/` — build helpers, sandbox, playthrough tests, `review_probe/` regression probes;
  `tools/legacy-review/` — scripts used to review the earlier versions (paths inside may need adjusting).
