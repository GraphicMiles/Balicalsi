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

## Repository layout

```
public/index.html   the game (self-contained: Three.js r128 inlined) + multiplayer client
server.js           static host for public/ + WebSocket relay/lobby (multiplayer)
render.yaml         Render Blueprint (single Node service, HTTP + WebSocket)
test/               integration tests + a multiplayer screenshot rig
```

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
