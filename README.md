# Kauaʻi Drive

A stylized open-world island driving game (Three.js), served with a small Node/WebSocket server.

The client is a **single self-contained file** (`public/index.html`) with the renderer inlined: no CDN,
no model/texture downloads. The Node server hosts it and runs the WebSocket relay/lobby for
online racing.

## Run locally

```bash
npm ci
npm start
```

Then open `http://localhost:3000`.

## Deploy

The same Node process serves `public/` and the WebSocket endpoint; set `PORT` in the hosting
environment. A Render Blueprint (`render.yaml`) is included — the free plan spins down after
~15 min of inactivity and wakes on the next request.

## The game

A volcanic island with a **closed coast road** (no dead ends), a switchback mountain road, dirt
tracks into the jungle, an ancient heiau, and a steel arch bridge over a gorge. You can stay on
asphalt or leave it anywhere: sand, dunes, jungle, lava rock, or the sea.

- **Free drive** anywhere on the island, or run the **3-lap race** through the orange beacons.
- **Procedural coconut palms** (`public/palm-tree.js`): a leaning S-curve trunk with
  crescent leaf scars and vertical cracks, a flared root mass, 27 fronds of 105 leaflets
  each on golden-angle phyllotaxis with the distal twist, and hanging coconut clusters.
  Every palm on the island uses it at one of four detail levels.
- 4 spring-damper wheels on the real terrain height field, bicycle tyre model with a friction
  circle, weight transfer (roll/dive), drift and handbrake, per-surface grip (asphalt, grass, dirt
  track, jungle, loose rock, water).
- Dynamic time of day, weather (rain, wet-road grip, rooster-tail spray), a live ocean with
  shore foam, and a reflection probe for the car paint.

### Controls

| Action | Keyboard | Touch |
|---|---|---|
| Accelerate | `W` / `↑` | **GAS** |
| Brake / reverse | `S` / `↓` | **BRAKE** |
| Steer | `A` `D` / `←` `→` | steering pad (or the D/R buttons for direction) |
| Handbrake / drift | `Space` | **HB** |
| Camera | `C` | ☰ → Chase/Cockpit |
| Recover to nearest road | `X` or `Home` | ☰ → Reset |
| Quality mode (AUTO / HIGH / MED / LOW) | `End` | ☰ → Quality |

### Performance

An adaptive resolution scaler trims pixels before it drops frames, and a quality mode cycle
(`AUTO` → `HIGH · FIXED` → `MED · FIXED` → `LOW · FIXED`) lets you lock render scale if you would
rather trade smoothness for a fixed picture. The live state is shown under the minimap.

The quality tier also scales the vegetation: `MED` thins the palm field to 85% and `LOW` to 50%,
and the detail pools shrink with it (measured in-game: `LOW` draws ~872k triangles a frame
against ~1,161k on `HIGH`). Note that the adaptive scaler only changes resolution, which does not
reduce vertex load — on a weak device, cycle to `LOW`.

## Repository layout

```
public/index.html   the game (self-contained: Three.js r128 inlined) + multiplayer client
public/palm-tree.js the coconut palm asset - standalone createPalm(THREE, opts), no environment
server.js           static host for public/ + WebSocket relay/lobby (multiplayer)
render.yaml         Render Blueprint (single Node service, HTTP + WebSocket)
tools/check-html.js parses every inline script in the single-file game
tools/bake_palm.js  optional: bakes palm_nanite.glb (~770k tris + PBR maps, needs `sharp`)
test/               integration tests, asset tests, and two headless render/profiling rigs
```

The in-game palm field is written directly in `public/index.html` (the per-cell instanced
block); `public/palm-tree.js` is the standalone hero-density asset used by the baking and
screenshot tooling — see `test/palm.test.js` and `test/palm-shot.js`.

## Multiplayer

The client is wired to the server's WebSocket relay. From the start screen, **Race online**:

1. Pick a name and a paint colour, choose **Duo Sprint** (2 drivers) or **Island Cup** (6 drivers),
   and **Create room** — you get a 4-letter code (or type a friend's code and **Join**).
2. The host starts the race. Everyone is placed on a two-wide grid behind the coast-road start
   line and held on a server-synced 3-2-1-GO countdown.
3. Rival cars are rendered from each driver's 15 Hz state stream, interpolated 120 ms in the past
   with short extrapolation, with spinning wheels and floating name tags; they also show up on
   the minimap and in the live `P2/4` position readout.
4. The server is authoritative for the lobby, countdown and finish order. When the race ends
   (everyone finishes, or 45 s after the first finisher), both clients get the ranked results —
   the host can offer a rematch, which returns everyone to the lobby. Disconnects drop the
   driver from the grid; the host role migrates automatically.

Empty slots stay open (no bots): share the room code to fill them.

## Testing

With the server running (`npm start` in another terminal):

```bash
npm test                      # protocol integration: two synthetic clients, full room/race/rematch flow
npm run test:palm             # standalone palm module (public/palm-tree.js): tri counts, NaN, determinism per LOD tier
npm run test:palm-field       # in-game palm field: culling, quality tiers, wind, pixel check (needs playwright)
node test/mp-shot.js  # screenshot: a real browser racing a scripted rival (needs playwright)
```

The palm asset has its own rig, and none of it needs a server or a GPU:

```bash
npm run test:palm     # 64 assertions: triangle budgets, NaN, zero-area triangles, wind hook
npm run test:shot     # renders the palm headlessly and writes test/shots/*.png (needs playwright)
npm run probe:scene   # lists every mesh the running game builds, with live instance counts
npm run test:html     # parses every inline script in the single-file game
node test/perf-probe.js --shot before.png   # real draw calls and triangles per frame
```

`test/palm.test.js` loads the **same Three.js r128 the game ships** (it is extracted from
the UMD line inlined in `index.html`), so the asset is measured against the exact build it
runs on rather than a separately installed copy.

`test/mp-browser.test.js` is the full two-browser end-to-end race (needs `playwright`); it boots
two Chromium pages, drives the lobby, countdown, rival rendering, results and rematch, and fails
on any console error.

## Visual pass

Procedurally generated scene: ~3,600 wind-swayed coconut palms built as live vertex-coloured
geometry (two seeded variants, ~4.3–4.9k triangles each, instanced per 600 m cell so whole cells
frustum- and shadow-cull together); tri-planar-style terrain detail with slope/height splatting
(sand, grass, jungle, basalt); asphalt grain, wheel-path wear and dirt-track variation; car paint
and tyre normal maps; dust, spray and water plume particles; device-pixel-accurate HUD (needle
cluster, slip meter, rotating minimap).

The scene is generated locally from procedural geometry and textures rather than imported
production assets.

### Palms

The island's ~3600 palms are live procedural geometry (no textures): a leaning S-curved
trunk with ring scars and a root flare, a golden-angle crown of pinnate fronds whose
leaflets V-fold, droop and twist distally, dry-frond tinting, and nut clusters under the
crown. Two seeded variants (~4.3k / ~4.9k triangles) are cell-alternated so neighbouring
palms never look cloned, and every vertex carries a wind weight and phase driving a sway
shader that is also patched into the shadow depth pass.

The field is instanced per 600 m cell — one wood mesh and one leaf mesh per cell — with a
world-space bounding sphere per cell. That matters because three.js r128 disables frustum
culling on `InstancedMesh` by default (the base geometry's sphere cannot bound instance
transforms); the cells opt back in, so whole cells drop out of the main pass *and* the
sun's ±60 m shadow frustum together:

| view | palm draws | palm tris |
|---|---|---|
| looking at open sea | 0 | 0 |
| inland panorama | ~56 | 16.5 M |
| shadow pass (car anywhere) | 1–2 cells | ~9k |

Quality tiers scale each cell's instance count (`veg`) and toggle palm shadows; `LOW`
halves the field and drops shadows. The palms are also hidden from the 6-face environment
probe so the periodic capture never re-renders the field. `test/palm-field.test.js`
verifies all of this headlessly, including framebuffer pixel classes of a rendered palm.

The palms are hard-surface geometry with vertex colours, not alpha-tested cards, so the
default depth material is already correct for the shadow pass and nothing needs
`customDepthMaterial`.
