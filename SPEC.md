# Seifenkisten Rennen - Game Specification

## 1. Project Overview

**Game Title:** Seifenkisten Rennen: Time Drift  
**Genre:** 2D Top-Down Racing  
**Theme:** Time Travel Soapbox Derby  
**Platform:** Web (HTML5 + TypeScript)  
**Duration:** Single race ~25-35 seconds  
**Core Loop:** Steer your soapbox car down a procedurally generated downhill track, avoid obstacles, reach the finish line as fast as possible. Collisions cost time.

**Visual Style:** Minimalist flat comic/vector graphics with saturated grass, fixed-width road, soft blurred shadows, sparse dust, and no neon glow effects in gameplay.

## 2. Technical Stack

- **Languages:** HTML5, TypeScript
- **Rendering:** HTML5 Canvas (2D top-down context)
- **Physics:** Custom simple rigid body physics (no external engine)
- **Dependencies:** Minimal - only `vite` for build/dev if desired (optional). Pure vanilla TS otherwise.
- **Architecture:** 
  - Entity-Component-System inspired (optional simple classes)
  - Game loop with requestAnimationFrame
  - State machine (Menu, Countdown, Race, Crash, Finish, Highscores)

## 3. Game Mechanics

### Player Vehicle
- **Soapbox Car** (Seifenkiste): Simple rectangular body with wheels, minimalist design.
- **Controls:**
  - Left/Right Arrow or A/D: Steer (angular velocity)
  - Down Arrow or S: Brake
  - Touch: left/right bottom zones steer, center bottom zone brakes
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
  - Length: Designed for ~28-35 seconds optimal run.
  - Width: Fixed in world units.
  - Curvature: Smooth bezier or spline-based path with noise.
  - Background: Simple grass + road texture (procedural stripes).
  - Sides: Dense hay bales as barriers.
- **Rendering:** Top-down:
  - No road-width perspective scaling.
  - No object scaling by Y/depth.
  - Alternating road segments and dashed center line.
  - Speed lines at high velocity.

### Obstacles
- **Hay Bales (Strohballen)**: Square with slightly rounded corners, hay-colored fill, short lighter straw strokes, lighter binding lines, and soft blurred shadows. Side bales sit close to the road edge, follow the road angle with ±5° jitter, and use irregular spacing. Road bales are randomly rotated.
- **Tires (Autoreifen)**: Circular, some static, maybe slow rolling ones.
- **Other:** Occasional rocks or time-rift visual markers.
- Collision with any obstacle:
  - Car is pushed back toward track center.
  - 3 second time penalty (visual timer freeze + screen flash).
  - Minor velocity loss.

### Progression & Goals
- **Start Line:** Clear starting position with countdown.
- **Finish Line:** Banner + confetti/time travel particles.
- **Time Attack:** Primary goal is lowest total time.
- **High Scores:** LocalStorage-based leaderboard (top 5).
  - Shows: Time, Date, Name (prompt for initials on new high score).

### Time Travel Theme
- Visuals: Subtle dust trail behind car.
- On collision: Brief "time ripple" effect + screen desaturation.
- Background music: Retro synth with ticking clock elements (or placeholder).
- Finish: "Temporal checkpoint reached" message.

## 4. Game States

1. **Main Menu**
   - Title with retro font
   - "Start Race"
   - "High Scores"
   - "Controls"

2. **Race**
   - Active gameplay
   - Timer (large, top-left)
   - Progress bar (bottom)
   - Current speed indicator

3. **Crash State** (short)
   - Freeze + push animation
   - Time penalty display

4. **Finish**
   - Final time
   - New high score prompt if applicable
   - "Race Again"

5. **High Scores Screen**
   - LocalStorage-backed top 5 list
   - 3-letter initials entry on new high score

## 5. Graphics & Assets

**All assets procedural/vector where possible:**

- **Car:** Slim red rounded soapbox body, red axles, black tires, rear circular highlight.
- **Road:** Catmull-Rom path with fixed width, alternating grey segments, dashed center line, no edge lines.
- **Hay Bale:** Square hay-colored bales with short lighter straw strokes.
- **Tire:** Black circle with inner details.
- **Particles:** Sparse dust dots behind the car.
- **UI:** Clean sans-serif with flat, high-contrast accents.

**Visual Rules:**
- Top-down fixed-scale rendering; do not scale road width or objects by Y/depth.
- Soft blurred offset shadows for all cast shadows, implemented by blurring the shadow shape itself.
- No neon/glow effects for shadows or particles.

## 6. Physics Implementation

- World coordinates: Y increases downhill.
- Gravity constant applied to forward velocity.
- Angular velocity for steering.
- Velocity vector + position.
- Simple circle/rectangle collision detection.
- Response: Separate + impulse.

## 7. Features List (MVP)

**Must Have:**
- Procedural track generation
- Car physics (momentum, steering, gravity)
- Collision with obstacles & borders
- Time penalty on crash
- Timer
- Start/Finish
- High score list
- Responsive canvas (720p or 1280x720 target)

**Nice to Have:**
- Sound effects (Web Audio API)
- Multiple track seeds / difficulty
- Ghost replay of best run
- Mobile touch controls
- Crash ripple effect
- Particle cap and deterministic speed-line generation for performance
- Particle polish

## 8. File Structure (Suggested)

```
seifenkisten-rennen/
├── index.html
├── src/
│   ├── main.ts
│   ├── game/
│   │   ├── Game.ts
│   │   ├── Track.ts
│   │   ├── Car.ts
│   │   ├── Obstacle.ts
│   │   └── ParticleSystem.ts
│   ├── utils/
│   ├── ui/
│   └── assets/ (if any)
├── tsconfig.json
└── vite.config.ts (optional)
```

## 9. Development Roadmap

1. Canvas setup + game loop
2. Basic car movement + gravity
3. Procedural track rendering
4. Collision detection + response
5. Obstacles + time penalty
6. Timer + finish condition
7. High scores + menu
8. Polish: particles, pseudo-3D, UI

## 10. Success Criteria

- Fun, responsive controls with good "weight"
- Track feels fair but challenging
- Consistent 60 FPS
- Addictive "one more run" factor
- Complete within ~800-1500 LOC (small project)

---

**Next Steps:**  
Implement core physics and track generation first. Let me know if you want code skeletons for specific classes!
