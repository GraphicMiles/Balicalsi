# Island Rally

A stylized, tropical arcade racing game built with Three.js and a small Node/WebSocket server. The art direction is a warm, sunlit island circuit: cobbled village lanes, packed-sand straights, a glossy turquoise lagoon, palms, surf shacks, docks, trackside festival details, and original procedural buggy/pickup visuals.

The scene is generated locally in the browser—there are no external model, texture, or font downloads required. A capped/adaptive render scale helps the game stay responsive across desktop and mobile hardware.

## Run locally

```bash
npm ci
npm start
```

Then open `http://localhost:3000`.

## Race modes

- **Play Offline** — race against local islander bots.
- **Duo Sprint** — create a private room for two players.
- **Island Cup** — host a six-player room; share the room code and start when ready.

## Controls

| Action | Keyboard | Touch / mobile |
|---|---|---|
| Accelerate | `↑` / `W` | **GAS** |
| Brake / reverse | `↓` / `S` | **BRAKE** |
| Steer | `←` `→` / `A` `D` | Tap left/right half of screen, or enable tilt |
| Boost | `Space` / `Shift` | **BOOST** |
| Use item | `E` / `Enter` | **ITEM** |

Pick up glowing mystery crates for rockets, bombs, shields, nitro, warp jumps, and mines. Settings include steering sensitivity, throttle response, audio, tilt inversion, and camera shake.

## Visual pass

- Golden-hour sky, warm atmospheric haze, moving lagoon water, shoreline foam, and distant island silhouettes.
- Three distinct road treatments across the circuit: village cobbles, packed earth, and shaded asphalt, with clean edge lines and center dashes.
- Instanced palms, low-poly coastal rocks, pastel surf cottages, shop signs, beach huts, docks, surfboards, pennants, and start-line garlands.
- A checkered coastal grand-prix gate and readable animated mystery crates.
- Updated responsive lobby/HUD styling and an adaptive pixel-ratio cap for smoother rendering on mobile.

The game is an original browser-based arcade prototype; the scene uses procedural geometry and textures rather than imported AAA production assets.

## Deploy

The service serves `public/` and the WebSocket multiplayer endpoint from the same Node process. Set `PORT` in the hosting environment and run:

```bash
npm ci
npm start
```

The client selects `ws://` or `wss://` from the page protocol automatically. A `render.yaml` Blueprint is included for Render deployment.
