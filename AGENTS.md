# AGENTS.md — Seifenkisten Rennen: Time Drift

## Project
2D top-down racing game (HTML5 + TypeScript). Player steers a soapbox car downhill, avoids obstacles, aims for lowest time. Single race ~30s. Time travel theme.

## Tech Stack
- **Language:** TypeScript (strict, `noUnusedLocals`, `noImplicitReturns`)
- **Rendering:** HTML5 Canvas 2D — no external game engine
- **Physics:** Custom (no libraries)
- **Build:** Vite 5
- **Storage:** LocalStorage for high scores
- **Target:** 1280×720 letterboxed, 60 FPS, ≤1500 LOC

## File Structure
```
index.html
src/
  main.ts              # entry — mounts Game on #game-canvas
  game/
    Game.ts            # game loop, state machine, camera, render dispatch
    Car.ts             # car entity: custom gravity/steering/friction physics + render
    Track.ts           # procedural Catmull-Rom track; samples[], bales[], queries
    Obstacle.ts        # dynamic obstacles: tires (Phase 4)
    ParticleSystem.ts  # subtle dust trail behind car
  ui/                  # menu, HUD, highscores (Phase 6–7)
  utils/
    InputHandler.ts    # keyboard state (held / wasPressed / steerAxis)
    math.ts            # Vec2, catmullRom(), Rng (seeded PRNG)
tsconfig.json
vite.config.ts
```

## Architecture

### Game Loop (Game.ts)
- `requestAnimationFrame` driver
- Fixed timestep: `FIXED_DT = 1/60`; accumulator pattern
- Raw dt capped at 100ms to avoid spiral of death
- Call order per frame: `update(FIXED_DT)* → render() → input.flush()`

### State Machine
`menu → countdown → race → crash → finish → highscores`
- Transitions via `setState(next: GameState)`
- Each state has dedicated `update*()` and `render*()` methods

### Input (InputHandler.ts)
- `isHeld(code)` — continuous
- `wasPressed(code)` / `wasReleased(code)` — single-frame edge detection
- `steerAxis` — returns −1 / 0 / +1 (A/Left = −1, D/Right = +1)
- `brakeAxis` — returns 1 while Down/S is held, otherwise 0
- `flush()` called at end of every frame

### Canvas Scaling
- Logical size always 1280×720
- CSS scales to fit viewport with `Math.min(scaleX, scaleY)`
- Resize listener on `window`

## Physics Rules
- Gravity → forward (downward-Y) acceleration
- Steering: direct angular response with speed-dependent sensitivity
- Friction/grip: enough lateral slip for visible drifting in curves; grass has much lower grip
- Brake: Down/S reduces forward speed without cancelling sideways drift
- Collision response: separate + impulse push toward center + 3s time penalty

## Rendering Rules
- Top-down rendering only; no pseudo-3D road-width scaling and no object scaling by screen/world Y.
- Road is a fixed-width Catmull-Rom ribbon with alternating flat grey segments and dashed center line.
- No road-edge stripe/outline lines.
- Hay bales are square with slightly rounded corners, hay-colored fill, short lighter straw strokes, lighter binding lines, and soft blurred offset shadows.
- Side hay bales sit close to the road edge, have irregular spacing, rotate parallel to the road edge, and receive ±5° per-bale jitter.
- Road hay bales are randomly rotated.
- Car is slim red soapbox shape with rounded front/back, red axles, black tires, and rear circular highlight.
- Dust particles are sparse, brown/tan, non-glowing.

## Current Status
**Phase 2–6 complete.** Phase 7 polish remains.

Running features:
- `npm run dev` → Vite dev server
- Menu → Countdown → Race → Finish → Highscores state machine
- Procedural track: Catmull-Rom, 15 segments, ~8400 world units (~30 s)
- ~30 obstacles on road (hay bales + tires), seeded placement
- Collision detection: circle-circle (CAR_RADIUS=18); border check via lateralOffset
- Crash response: bounce lateralOffset, 0.45 s freeze, red flash, "+3s" popup and time penalty
- All cast shadows are dark, soft blurred offset shapes using `ctx.filter = blur(...)`; no outlines
- Sparse dust trail behind the car and speed lines at high velocity
- Start countdown, race timer, bottom progress bar, finish time panel, LocalStorage top-10 highscores, and 3-letter name entry

Next: **Phase 7** — polish sound, optional mobile controls, and remaining effects.

## Visual Style
- **Aesthetic:** Minimalist, flat comic — hard outlines, no gradients
- **Shadows:** all cast shadows are soft blurred offset shapes using `ctx.filter = blur(...)`; keep them natural, not neon/glow effects
- **Font:** `"Open Sans", sans-serif` — loaded via Google Fonts
  - Weights used: 400 (body), 700 (labels), 800 (title)
- **Text color rule:** white (`#ffffff`) on dark backgrounds, black (`#111111`) on light
- **Palette (base):**
  - Page/canvas bg: `#f5f2eb` (warm off-white)
  - Grass: `#2fb51d` (saturated grass green)
  - Road: `#b0aead` (mid gray)
  - Road: no border/edge lines
  - Car body: `#e63030` (flat red)
  - Subtitle / muted text: `#555550`

## Constraints
- No external physics/game engines
- All visuals procedural/vector — no image assets
- Keep it small: target ≤1500 LOC
- Must run in browser with no backend
- Prefix unused params with `_` (strict TS)
