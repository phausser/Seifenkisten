# Seifenkisten Rennen - Specification

## 1. Project Overview

**Game Title:** Seifenkisten Rennen
**Genre:** 2D Top-Down Racing
**Theme:** Time Travel Soapbox Derby
**Platform:** Web (HTML5 + TypeScript)
**Duration:** Single race ~25-35 seconds
**Core Loop:** Steer your soapbox car down a procedurally generated downhill track, avoid obstacles, reach the finish line as fast as possible. Collisions cost time.

**Visual Style:** Minimalist flat comic/vector graphics with saturated grass, fixed-width road, soft blurred shadows, sparse dust, and no neon glow effects in gameplay.

**Current Status:** Playable vertical slice is complete. The current work surface is feature tuning, content polish, deployment, and optional online leaderboard operations.

## 2. Technical Stack

- **Languages:** HTML5, TypeScript
- **Rendering:** HTML5 Canvas (2D top-down context)
- **Physics:** Custom simple rigid body physics (no external engine)
- **Build:** Vite 8
- **Dependencies:** Runtime is vanilla browser APIs; dev dependencies are Vite and TypeScript.
- **Architecture:**
  - Small class-based subsystems
  - Game loop with requestAnimationFrame
  - State machine (`menu`, `countdown`, `race`, `finish`)
  - Data-driven course configuration
  - Per-course LocalStorage high scores with optional LootLocker sync

## 3. Runtime & Build

- `npm run dev`: Vite dev server on port 5173.
- `npm run build`: `tsc && vite build`.
- `npm run preview`: serve the production build locally.
- Node.js 20.19+ is required by Vite 8.
- TypeScript uses `strict`, `noUnusedLocals`, `noUnusedParameters`, and `noImplicitReturns`.
- The production `base` path is relative by default and is adjusted in CI for GitHub Pages via `GITHUB_REPOSITORY`.

Optional LootLocker environment variables:

```
VITE_LOOTLOCKER_API_KEY
VITE_LOOTLOCKER_LEADERBOARD_KEY
VITE_LOOTLOCKER_API_BASE        # optional, defaults to https://api.lootlocker.io/game
VITE_LOOTLOCKER_GAME_VERSION    # optional, defaults to 0.1.0
```

## 4. Game Mechanics

### Player Vehicle
- **Soapbox Car** (Seifenkiste): Slim red soapbox body with wheels, axles, and rear highlight.
- **Controls:**
  - Left/Right Arrow or A/D: Steer (angular velocity)
  - Down Arrow or S: Brake
  - Space/Enter: Start/confirm
  - Escape: Return to menu from countdown/race
  - Touch: bottom-left/bottom-right zones steer, bottom-center zone brakes
- **Menu Setup:**
  - Course selection
  - Weight
  - Steering
  - Aerodynamics
  - Body color
- **Physics:**
  - Downhill gravity acceleration
  - Realistic momentum and inertia
  - Velocity-dependent turning radius (harder to turn at high speed)
  - Friction and lateral grip tuned for visible drifting in curves
  - Brake reduces forward speed while preserving sideways drift
  - Rotation damping
  - Collision response: bouncy but forgiving

### Track
- **Generation:** Procedurally generated curvy path, always downhill.
  - Course configs define seed, length, width, curve strength, colors, and placement seeds.
  - Curvature: Smooth Catmull-Rom spline.
  - Background: Grass stripes, flowers, birds, and road.
  - Sides: Dense hay bales as barriers.
- **Rendering:** Top-down:
  - No road-width perspective scaling.
  - No object scaling by Y/depth.
  - Alternating road segments and dashed center line.
  - Speed lines at high velocity.

### Obstacles
- **Hay Bales (Strohballen)**: Square with slightly rounded corners, hay-colored fill, short lighter straw strokes, lighter binding lines, and soft blurred shadows. Side bales sit close to the road edge, follow the road angle with ±5° jitter, and use irregular spacing. Road bales are randomly rotated.
- **Tires (Autoreifen)**: Circular road obstacles with inner detail.
- Collision with any obstacle:
  - Car is pushed back toward track center.
  - 3 second time penalty (visual timer freeze + screen flash).
  - Minor velocity loss.

### Progression & Goals
- **Start Line:** Clear starting position with countdown.
- **Finish Line:** Banner + confetti/time travel particles.
- **Time Attack:** Primary goal is lowest total time.
- **High Scores:** Top 5 list.
  - LocalStorage is always used as a per-course cache/fallback.
  - LootLocker can load and submit scores when configured; course id is stored in metadata.
  - Shows time, date, and 3-letter name.

### Courses

- **Time Drift:** balanced default course.
- **Serpentinen:** narrower, more technical, stronger curves.
- **Sprintstrecke:** wider, faster, less technical.

### Time Travel Theme
- Visuals: Subtle dust trail behind car.
- On collision: Brief time-ripple effect, shake, flash, and `+3s` popup.
- Audio: Web Audio effects for start, countdown, driving, crash, finish, and save.

## 5. Game States

1. **Main Menu**
   - Title
   - Start button
   - Highscores
   - Course selector
   - Car setup sliders and color swatches

2. **Countdown**
   - 3 second countdown
   - Audio beeps
   - Escape returns to menu

3. **Race**
   - Active gameplay
   - Timer (large, top-left)
   - Progress bar (bottom)
   - Current speed indicator
   - Crash feedback happens inside this state while the car is briefly frozen

4. **Finish**
   - Final time
   - New high score prompt if applicable
   - Highscore list
   - Race again / return to menu

## 6. Graphics & Assets

**All assets are procedural/vector:**

- **Car:** Slim red rounded soapbox body, red axles, black tires, rear circular highlight.
- **Road:** Catmull-Rom path with fixed width, alternating grey segments, dashed center line, no edge lines.
- **Hay Bale:** Square hay-colored bales with short lighter straw strokes.
- **Tire:** Black circle with inner details.
- **Particles:** Sparse dust dots behind the car.
- **Environment:** Grass stripes, flowers, and birds.
- **UI:** Clean sans-serif with flat, high-contrast accents.

**Visual Rules:**
- Top-down fixed-scale rendering; do not scale road width or objects by Y/depth.
- Soft blurred offset shadows for all cast shadows, implemented by blurring the shadow shape itself.
- No neon/glow effects for shadows or particles.
- No road-edge stripe/outline lines.

## 7. Physics Implementation

- World coordinates: Y increases downhill.
- Gravity constant applied to forward velocity.
- Angular velocity for steering.
- Velocity vector + position.
- Circle-based obstacle collision using `CAR_RADIUS`.
- Road border check via lateral offset.
- Response: separate, impulse/push toward center, temporary freeze, time penalty.

## 8. File Structure

```text
index.html
src/
  main.ts
  game/
    AudioSystem.ts
    BirdSystem.ts
    Car.ts
    CarConfig.ts
    CourseConfig.ts
    FlowerSystem.ts
    Game.ts
    Obstacle.ts
    ParticleSystem.ts
    Track.ts
  services/
    LootLockerHighScores.ts
  utils/
    InputHandler.ts
    math.ts
  vite-env.d.ts
package.json
tsconfig.json
vite.config.ts
```

## 9. Current Feature Status

Complete:
- Canvas setup, scaling, fixed timestep loop
- Car physics and menu-configurable car setup
- Three data-driven courses with procedural track and obstacle placement
- Collision response and time penalty
- Timer, progress bar, countdown, finish flow
- Per-course local high scores and optional LootLocker sync
- Touch controls and mobile name input
- Web Audio effects, dust, speed lines, ripple, flowers, birds

Possible next work:
- Ghost replay of the best run
- More track themes while preserving top-down rules
- Highscore reset/export controls
- Automated smoke test for menu, race start, and finish/highscore flow

## 10. Success Criteria

- Fun, responsive controls with good "weight"
- Track feels fair but challenging
- Consistent 60 FPS
- Addictive "one more run" factor
- Small, dependency-light browser game with no backend requirement
- Strict TypeScript build passes
