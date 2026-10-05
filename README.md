# Beach Buggy Online — 200% Upgrade

A ground-up upgrade of the original *Beach Buggy Run*: PBR graphics, a helmeted
humanoid driver, exhaust gas, dust, skid marks, boost flames, a real-time
**online multiplayer** server with **Dual (2P)** and **Championship (6P)** modes,
power-ups, projectiles, and a full touch/tilt/tap control scheme.

## Run it
```bash
cd beach-buggy-game
npm install          # installs ws (already done)
npm start            # serves http + websocket on :3000
```
Open `http://localhost:3000` in a browser. For multiplayer, open the URL in
**two or more tabs / devices** and either *Create Room* or *Join* with the code.

To play instantly without a network, click **Play Offline (vs bots)**.

## Lobby
- Pick a name, a color, and a mode (Dual · 2P or Championship · 6P).
- Create a room → share the 4-letter code, or Join with a code.
- The host presses **Start Race**. Empty seats are filled by local AI bots.
- Server relays every human car + hits; bots are simulated locally.

## Controls
| Action | Keyboard | Touch / Mobile |
|---|---|---|
| Gas | `↑` / `W` | GAS button (analog ramp) |
| Brake / reverse | `↓` / `S` | BRAKE button |
| Steer | `←` `→` / `A` `D` | Tap **left/right half** of screen, or **Tilt** (gyro) |
| Boost (200 km/h) | `Space` / `Shift` | BOOST button (drains gauge, recharges) |
| Use item | `E` / `Enter` | ITEM button |

Settings (⚙): steering sensitivity, throttle response, invert tilt, audio, camera shake.

## Power-ups (grab glowing crates on the track)
- 🚀 **Rocket** — homing missile
- 💣 **Bomb** — thrown explosive
- 🛡 **Shield** — protective dome (blocks one hit)
- ⚡ **Nitro** — instant speed burst
- 🌀 **Warp** — teleport forward ~150 m
- 💥 **Mine** — drop a trap behind you

## What got upgraded to "200%"
- **Visuals:** PBR `MeshPhysicalMaterial` paint with clearcoat, PMREM environment
  reflections, ACES tone mapping, 2048 soft shadows, gradient sky + sun glow,
  drifting clouds, animated sea, detailed asphalt/kerbs/start line.
- **Car:** extruded body, roll cage, headlights + beams, taillights, exhaust pipe,
  alloy wheels with tread, steering wheel, **helmeted humanoid driver** (arms to
  wheel, legs, boots) that leans into corners.
- **Atmosphere/FX:** continuous **exhaust gas**, tire dust off-road, white drift
  smoke, persistent **skid marks**, boost flames, explosion bursts, camera shake,
  speed-line vignette at high speed.
- **Driving:** speed-sensitive steering, gentle **auto-align** to the track,
  analog throttle, top speed ~**200 km/h**, rubber-banding AI.
- **Audio:** synthesized engine note (pitch tracks speed), boost whoosh, pickup,
  explosion and hit SFX.
- **HUD:** live position, lap, clock, speed, boost gauge, held item, standings
  list and a real-time minimap.

## Deploy for real online play
The server is plain Node (`server.js`) + static files in `public/`. Host it
anywhere (e.g. a VM, Railway, Render, Fly) and point players at the public URL.
The client auto-detects `ws://` or `wss://` from `location.host`.

## Deploy to Render
This repo includes a `render.yaml` Blueprint, so Render provisions the whole
stack from the repo:

1. Push to GitHub (already done).
2. In the Render dashboard choose **New → Blueprint** and connect
   `GraphicMiles/Balicalsi`, or run `render blueprint launch` with the
   [Render CLI](https://render.com/docs/cli).
3. Render runs `npm install`, then `node server.js` on the port it injects via
   `PORT`. The app's WebSocket server (lobby + matches) is served over
   `wss://` automatically — no extra config needed.

Free-plan note: the service sleeps after ~15 min idle and wakes on the next
request (first load takes a few seconds).
