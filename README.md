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

## Multiplayer status

`server.js` still implements the room/lobby/countdown/finish-order protocol and relays car state
between clients. The game client currently ships as a single-player build; wiring it to that
relay is the next step.

## Visual pass

Procedurally generated scene: textured, wind-swayed palms with alpha-tested frond shadows;
tri-planar-style terrain detail with slope/height splatting (sand, grass, jungle, basalt);
asphalt grain, wheel-path wear and dirt-track variation; car paint and tyre normal maps; dust,
spray and water plume particles; device-pixel-accurate HUD (needle cluster, slip meter, rotating
minimap).

The scene is generated locally from procedural geometry and textures rather than imported
production assets.
