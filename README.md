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
tools/palm-field.js the island scatter + the per-LOD detail pools (inlined into index.html)
tools/inline-palm.js copies palm-tree.js and palm-field.js into index.html (the only writer)
tools/check-html.js parses every inline script in the single-file game
tools/bake_palm.js  optional: bakes palm_nanite.glb (~770k tris + PBR maps, needs `sharp`)
test/               integration tests, asset tests, and two headless render/profiling rigs
```

`public/palm-tree.js` and the copies inlined in `index.html` are kept identical by
`npm run inline-palm`; `npm run inline-palm:check` fails if they ever drift.

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
npm test              # protocol integration: two synthetic clients, full room/race/rematch flow
node test/mp-shot.js  # screenshot: a real browser racing a scripted rival (needs playwright)
```

The palm asset has its own rig, and none of it needs a server or a GPU:

```bash
npm run test:assets   # asset assertions + field assertions + inline-script parse + sync check
npm run test:palm     # 64 assertions: triangle budgets, NaN, zero-area triangles, wind hook
npm run test:shot     # renders the palm headlessly and writes test/shots/*.png (needs playwright)
npm run probe:scene   # lists every mesh the running game builds, with live instance counts
node test/perf-probe.js --shot before.png   # real draw calls and triangles per frame
```

`test/palm.test.js` loads the **same Three.js r128 the game ships** (it is extracted from
the UMD line inlined in `index.html`), so the asset is measured against the exact build it
runs on rather than a separately installed copy.

`test/mp-browser.test.js` is the full two-browser end-to-end race (needs `playwright`); it boots
two Chromium pages, drives the lobby, countdown, rival rendering, results and rematch, and fails
on any console error.

## Visual pass

Procedurally generated scene: **geometry** palms (see below) with per-vertex wind sway;
tri-planar-style terrain detail with slope/height splatting (sand, grass, jungle, basalt);
asphalt grain, wheel-path wear and dirt-track variation; car paint and tyre normal maps; dust,
spray and water plume particles; device-pixel-accurate HUD (needle cluster, slip meter, rotating
minimap).

The scene is generated locally from procedural geometry and textures rather than imported
production assets.

### Palms

The island's 3600 palms are one asset drawn at four detail levels, managed by
`tools/palm-field.js`:

| tier | where it is used | tris per palm | how many |
|---|---|---|---|
| hero | nearest palm, within 45 m | 156,688 | 1 |
| mid | next nearest, within 90 m | 45,632 | 5 |
| low | next nearest, within 260 m | 6,712 | 16 |
| ultra | the whole-island field | 80 | 3600 |

Detail palms are assigned by distance **rank**, not by radius band, because palms grow
12–20 m off the road and a band edge can fall in a gap. The field is written once and the
pools are rebuilt only after the car has moved 10 m. Each upgraded palm keeps its field twin
at the same spot scaled to 0.93, so the cheap copy hides inside the detail copy and an LOD
swap cannot open a gap.

Measured with `npm run probe:scene` and `node test/perf-probe.js` against the build this
replaces (the 3600-strong cylinder-and-quad version):

| | before | after |
|---|---|---|
| forward pass | 762,389 tris / 138 calls | 1,161,010 tris / 150 calls |
| shadow pass | 439,094 tris / 113 calls | 214,182 tris / 116 calls |
| island palm field | 381,600 tris | 288,000 tris |

Only the hero pool casts shadows: the sun's shadow camera covers ±60 m around the car, so the
mid pool (45 m+), the low pool and the field were paying for shadow work that could not be
seen. Switching to `LOW` quality thins the field and the pools together.

The palms are hard-surface geometry with vertex colours, not alpha-tested cards, so the
default depth material is already correct for the shadow pass and nothing needs
`customDepthMaterial`.
