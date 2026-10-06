# Kauaʻi Drive

A stylized open-world island driving game (Three.js), served with a small Node/WebSocket server.

The client is a **single self-contained file** (`public/index.html`) with the renderer inlined: no CDN,
no model/texture downloads, no network calls at runtime. The Node server hosts it and keeps the
WebSocket relay/lobby in place for the multiplayer work that is being folded in next.

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
public/index.html   the game (self-contained: Three.js r128 inlined)
server.js           static host for public/ + WebSocket relay/lobby (multiplayer)
render.yaml         Render Blueprint (single Node service, HTTP + WebSocket)
```

## Multiplayer

Wired to the Node/WebSocket relay in `server.js` — no extra services, no build step.

- **Duo Sprint** (2 players) and **Island Cup** (6 players) rooms, created from the menu.
- **Join by room code**; the lobby shows every player with host/you markers.
- The server owns the **start time** (a ~3.8 s countdown, latency-corrected on each client),
  the **grid slots**, the **finish order** and **DNF ranking**.
- The host starts the race and can **start a rematch** from the results screen.
- Each client broadcasts a compact state packet ~12×/s (position, heading, velocity, lean, gear,
  lap progress, finish time). Remote cars are drawn ~130 ms in the past and interpolated
  (position lerp + shortest-arc heading lerp), so they stay smooth at any connection quality.
- Live **standings strip** (position, name, lap or finish time) and **rival dots on the minimap**.

Room codes are 4 characters and generated per room. A client that stops answering the server
heartbeat is dropped after ~30 s; the race continues without it and its slot simply disappears.

## Visual pass

Procedurally generated scene: textured, wind-swayed palms with alpha-tested frond shadows;
tri-planar-style terrain detail with slope/height splatting (sand, grass, jungle, basalt);
asphalt grain, wheel-path wear and dirt-track variation; car paint and tyre normal maps; dust,
spray and water plume particles; device-pixel-accurate HUD (needle cluster, slip meter, rotating
minimap).

The scene is generated locally from procedural geometry and textures rather than imported
production assets.
