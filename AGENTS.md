# AGENTS.md — Seifenkisten Rennen

## Project
2D top-down racing game (HTML5 + TypeScript). Player steers a soapbox car downhill, avoids obstacles, aims for lowest time. Single race ~30s. Time travel theme.

## Tech Stack
- **Language:** TypeScript (strict, `noUnusedLocals`, `noImplicitReturns`)
- **Rendering:** HTML5 Canvas 2D — no external game engine
- **Physics:** Custom (no libraries)
- **Build:** Vite 8
- **Storage:** per-course LootLocker high scores when configured; LocalStorage fallback/cache otherwise
- **Target:** 720px logical height, adaptive width, 60 FPS, small dependency footprint

## File Structure
```
index.html
src/
  main.ts              # entry — mounts Game on #game-canvas
  game/
    AudioSystem.ts     # small Web Audio sound effects
    BirdSystem.ts      # procedural ambient birds
    Game.ts            # game loop, state machine, camera, render dispatch
    Car.ts             # car entity: custom gravity/steering/friction physics + render
    CarConfig.ts       # menu-configurable car setup values
    CourseConfig.ts    # data-driven course list and track tuning
    FlowerSystem.ts    # procedural ambient flowers
    Track.ts           # procedural Catmull-Rom track; samples[], bales[], queries
    Obstacle.ts        # road obstacles: hay bales + tires
    ParticleSystem.ts  # subtle dust trail behind car
  services/
    LootLockerHighScores.ts # optional remote leaderboard integration
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
- Call order per frame: fixed updates flush input edges inside the accumulator loop, then render

### State Machine
`menu → countdown → race → finish`
- Transitions via `setState(next: GameState)`
- Each state has dedicated `update*()` and `render*()` methods
- Crash feedback is handled inside `race` via car freeze, shake, ripple, and penalty state.
- Highscores are rendered in `menu` and `finish`; there is no separate highscore state.

### Input (InputHandler.ts)
- `isHeld(code)` — continuous
- `wasPressed(code)` / `wasReleased(code)` — single-frame edge detection
- `steerAxis` — returns −1 / 0 / +1 (A/Left = −1, D/Right = +1)
- `brakeAxis` — returns 1 while Down/S is held, otherwise 0
- `flush()` called at end of every frame
- In the menu, Left/Right or Q/E switches course.

### Canvas Scaling
- Logical height is always 720
- Logical width adapts to viewport aspect ratio
- CSS fills the viewport
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
Playable core is complete.

Running features:
- `npm run dev` → Vite dev server
- Menu → Countdown → Race → Finish → Highscores state machine
- Three course configs: Time Drift, Serpentinen, Sprintstrecke
- Procedural track: Catmull-Rom, course-specific segment count/width/curvature
- Course-specific road obstacles (hay bales + tires), seeded placement
- Collision detection: circle-circle (CAR_RADIUS=18); border check via lateralOffset
- Crash response: bounce lateralOffset, 0.45 s freeze, red flash, "+3s" popup and time penalty
- All cast shadows are dark, soft blurred offset shapes using `ctx.filter = blur(...)`; no outlines
- Sparse dust trail behind the car and speed lines at high velocity
- Start countdown, race timer, bottom progress bar, finish time panel, per-course top-5 highscores via LootLocker or LocalStorage fallback, and 3-letter name entry for places 1–5
- Menu course selector, car setup sliders for weight, steering, aero, plus color selection
- Web Audio effects for start/countdown/crash/finish/save, crash ripple, canvas touch controls, mobile name input, particle cap, deterministic speed lines
- Ambient flowers and birds

Next: tuning, deployment polish, ghost replay, or highscore management.

## Visual Style
- **Aesthetic:** Minimalist, flat comic — hard outlines, no gradients
- **Shadows:** all cast shadows are soft blurred offset shapes using `ctx.filter = blur(...)`; keep them natural, not neon/glow effects
- **Font:** `"Open Sans", sans-serif` — loaded via Google Fonts
  - Weights used: 400 (body), 700 (labels), 800 (title)
- **Text color rule:** white (`#ffffff`) on dark backgrounds, black (`#111111`) on light
- **Palette (base):**
  - Page bg: `#3a6e37`
  - Grass: `#427b3f` / `#386e35`
  - Road: `#b0aead` (mid gray)
  - Road: no border/edge lines
  - Car body: `#e63030` (flat red)
  - Subtitle / muted text: `#555550`

## Constraints
- No external physics/game engines
- All visuals procedural/vector — no image assets
- Keep dependencies minimal; avoid new runtime packages unless clearly justified
- Must run in browser with no backend; LootLocker is optional
- Prefix unused params with `_` (strict TS)
- Before handing off code changes, run `npm run build` when feasible
