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
    Car.ts             # car entity: position, angle, render; Phase 2 adds physics
    Track.ts           # procedural Catmull-Rom track; samples[], bales[], queries
    Obstacle.ts        # dynamic obstacles: tires (Phase 4)
    Physics.ts         # collision, impulse response (Phase 4)
    ParticleSystem.ts  # dust, sparks, time trails (Phase 5)
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
`menu → race → crash → finish → highscores`
- Transitions via `setState(next: GameState)`
- Each state has dedicated `update*()` and `render*()` methods

### Input (InputHandler.ts)
- `isHeld(code)` — continuous
- `wasPressed(code)` / `wasReleased(code)` — single-frame edge detection
- `steerAxis` — returns −1 / 0 / +1 (A/Left = −1, D/Right = +1)
- `flush()` called at end of every frame

### Canvas Scaling
- Logical size always 1280×720
- CSS scales to fit viewport with `Math.min(scaleX, scaleY)`
- Resize listener on `window`

## Physics Rules (Phase 2 target)
- Gravity → forward (downward-Y) acceleration
- Steering: angular velocity, speed-dependent sensitivity
- Friction: road < grass/off-track
- Collision response: separate + impulse push toward center + 3s time penalty

## Pseudo-3D (Phase 5 target)
- Road as perspective trapezoids
- Object scale: `scale = 1 + (y / maxY) * factor`
- Horizon line with parallax

## Current Status
**Phase 4 complete** (Phase 2 physics deliberately deferred — car currently auto-follows centerline).

Running features:
- `npm run dev` → Vite dev server
- Menu → Race → Finish state machine
- Procedural track: Catmull-Rom, 15 segments, ~8400 world units (~30 s)
- ~30 obstacles on road (hay bales + tires), seeded placement
- Collision detection: circle-circle (CAR_RADIUS=18); border check via lateralOffset
- Crash response: bounce lateralOffset, 0.45 s freeze, red flash, "−3s" popup
- All 3D objects have soft blurred offset shadows; no outlines

Next: **Phase 2** — replace `Car.update()` with gravity + steering + friction. `lateralOffset` and `frozen` hooks are already in place.

## Visual Style
- **Aesthetic:** Minimalist, flat comic — hard outlines, no gradients
- **Shadows:** all cast shadows are soft/blurred offset shadows using Canvas shadow settings; keep them subtle and natural, not neon/glow effects
- **Font:** `"Open Sans", sans-serif` — loaded via Google Fonts
  - Weights used: 400 (body), 700 (labels), 800 (title)
- **Text color rule:** white (`#ffffff`) on dark backgrounds, black (`#111111`) on light
- **Palette (base):**
  - Page/canvas bg: `#f5f2eb` (warm off-white)
  - Grass: `#2fb51d` (saturated grass green)
  - Road: `#b0aead` (mid gray)
  - Road borders / outlines: `#111111`
  - Car body: `#e63030` (flat red)
  - Subtitle / muted text: `#555550`

## Constraints
- No external physics/game engines
- All visuals procedural/vector — no image assets
- Keep it small: target ≤1500 LOC
- Must run in browser with no backend
- Prefix unused params with `_` (strict TS)
