import { Rng } from '../utils/math';
import type { Track } from './Track';

// ─── Constants ────────────────────────────────────────────────────────────────

const TRIGGER_DIST  = 160;  // world units – car distance that triggers flight
const GROUP_SPACING = 3000; // min arc-length between groups (→ 2–3 per course)
const FLAP_SPEED    = 14;   // rad/s (≈ 2.2 flaps/s)

// Drop-shadow parameters (match the rest of the game)
const SHADOW_DX   = 4;
const SHADOW_DY_0 = 6;     // sitting shadow offset
const SHADOW_BLUR_0 = 6;   // sitting blur

// Bird geometry in local coords — front points toward −Y (screen up)
const BODY_FRONT = -7;   // front tip
const BODY_REAR  =  5;   // rear / wing attachment Y
const BODY_HW    =  2.5; // body half-width
const WING_X     = 12;   // wing-tip half-span at rest
const WING_Y_0   =  1;   // wing-tip Y at rest
const FLAP_AMP   =  3.5; // wing-tip Y excursion (front/back sweep)
const TAIL_HW    =  4;   // tail half-width at base
const TAIL_REAR  =  9;   // tail tip Y

// ─── Types ────────────────────────────────────────────────────────────────────

interface BirdOffset {
  dx: number; dy: number;
  angle: number;            // random resting orientation
  phase: number;            // animation phase offset [0, 1)
  idleType: 'peck' | 'look'; // which idle behaviour
}

interface BirdGroup {
  wx: number; wy: number;
  offsets: BirdOffset[];
  triggered: boolean;
}

interface FlyingBird {
  x: number; y: number;    // screen position
  vx: number; vy: number;  // screen velocity (px/s)
  scale: number;
  shadowDist: number;      // shadow Y offset below bird (grows as bird "rises")
  shadowAlpha: number;     // fades to 0
  shadowBlur: number;      // grows as bird rises
  flapPhase: number;       // wing animation phase
}

// ─── BirdSystem ───────────────────────────────────────────────────────────────

export class BirdSystem {
  private groups: BirdGroup[] = [];
  private flying: FlyingBird[] = [];

  // ── Placement ──────────────────────────────────────────────────────────────

  place(track: Track, seed: number): void {
    this.groups = [];
    this.flying = [];
    const rng    = new Rng(seed);
    const startAt = 600;
    const endAt   = track.finishDist - 300;
    let nextAt    = startAt;

    for (const s of track.samples) {
      if (s.dist < nextAt || s.dist > endAt) continue;
      nextAt = s.dist + GROUP_SPACING + rng.range(-400, 400);

      const count = rng.next() < 0.45 ? 1 : rng.next() < 0.55 ? 2 : 3;
      const side  = rng.next() > 0.5 ? 1 : -1;
      const lat   = rng.range(12, 58) * side;

      const offsets: BirdOffset[] = [];
      for (let i = 0; i < count; i++) {
        offsets.push({
          dx:       rng.range(-80, 80),
          dy:       rng.range(-55, 55),
          angle:    rng.range(0, Math.PI * 2),
          phase:    rng.next(),
          idleType: rng.next() < 0.55 ? 'peck' : 'look',
        });
      }

      this.groups.push({
        wx: s.x + s.nx * lat,
        wy: s.y + s.ny * lat,
        offsets,
        triggered: false,
      });
    }
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  update(
    dt: number,
    carWX: number, carWY: number,
    camX: number, camY: number,
    W: number, H: number,
  ): void {
    // Trigger groups in range
    for (const g of this.groups) {
      if (g.triggered) continue;
      const dx = carWX - g.wx;
      const dy = carWY - g.wy;
      if (dx * dx + dy * dy > TRIGGER_DIST * TRIGGER_DIST) continue;

      g.triggered = true;
      for (const off of g.offsets) {
        const sx = (g.wx + off.dx) - camX + W * 0.5;
        const sy = camY - (g.wy + off.dy) + H * 0.5;
        // Scatter in a wide fan, biased upward on screen (away from car)
        const angle = -Math.PI * 0.5 + (Math.random() - 0.5) * Math.PI * 1.5;
        const speed = 210 + Math.random() * 170;
        this.flying.push({
          x: sx, y: sy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          scale:       1,
          shadowDist:  SHADOW_DY_0,
          shadowAlpha: 0.42,
          shadowBlur:  SHADOW_BLUR_0,
          flapPhase:   Math.random() * Math.PI * 2,
        });
      }
    }

    // Animate flying birds
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const b = this.flying[i];
      b.x          += b.vx * dt;
      b.y          += b.vy * dt;
      b.scale       = Math.min(2.0, b.scale + dt * 1.3);
      b.shadowDist += dt * 68;
      b.shadowAlpha = Math.max(0, b.shadowAlpha - dt * 0.34);
      b.shadowBlur  = Math.min(20, b.shadowBlur  + dt * 14);
      b.flapPhase  += dt * FLAP_SPEED;
      if (b.x < -120 || b.x > W + 120 || b.y < -120 || b.y > H + 120) {
        this.flying.splice(i, 1);
      }
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  /** Sitting birds — call before obstacles/car (on the road surface). */
  renderSitting(
    ctx: CanvasRenderingContext2D,
    camX: number, camY: number,
    W: number, H: number,
  ): void {
    const t = performance.now() / 1000;
    ctx.save();
    for (const g of this.groups) {
      if (g.triggered) continue;
      for (const off of g.offsets) {
        const sx = (g.wx + off.dx) - camX + W * 0.5;
        const sy = camY - (g.wy + off.dy) + H * 0.5;
        if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) continue;

        // ── Idle animation ────────────────────────────────────────────────────
        let animAngle = 0;
        if (off.idleType === 'peck') {
          // Brief tilt forward every ~2-3 s
          const PECK_PERIOD = 2.2 + off.phase * 1.2;
          const PECK_WINDOW = 0.32;
          const tc = (t * (0.9 + off.phase * 0.2) + off.phase * PECK_PERIOD) % PECK_PERIOD;
          const peckT = tc < PECK_WINDOW ? Math.sin((tc / PECK_WINDOW) * Math.PI) : 0;
          animAngle = peckT * 0.30;
        } else {
          // Slow look-around: sinusoidal rotation ±~20°
          const speed = 0.45 + off.phase * 0.35;
          animAngle = Math.sin(t * speed + off.phase * Math.PI * 2) * 0.36;
        }

        this.drawBird(ctx, sx, sy, off.angle + animAngle, 1, 0,
          SHADOW_DY_0, 0.32, SHADOW_BLUR_0);
      }
    }
    ctx.restore();
  }

  /** Flying birds — call after car (airborne, frontmost layer). */
  renderFlying(ctx: CanvasRenderingContext2D): void {
    if (this.flying.length === 0) return;
    ctx.save();
    for (const b of this.flying) {
      // Angle: velocity direction, adjusted so bird nose points forward
      const angle = Math.atan2(b.vy, b.vx) + Math.PI * 0.5;
      this.drawBird(ctx, b.x, b.y, angle, b.scale, b.flapPhase,
        b.shadowDist, b.shadowAlpha, b.shadowBlur);
    }
    ctx.restore();
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  private drawBird(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    angle: number,
    scale: number,
    flapPhase: number,
    shadowDist: number,
    shadowAlpha: number,
    shadowBlur: number,
  ): void {
    // Wing tip positions driven by flap phase
    const flapT = Math.sin(flapPhase);
    const tipY  = WING_Y_0 + flapT * FLAP_AMP;   // sweeps fore/aft
    const span  = WING_X * (1 + flapT * 0.08);   // span varies ±8%

    // ── Shadow ──────────────────────────────────────────────────────────────
    if (shadowAlpha > 0.01) {
      ctx.save();
      ctx.translate(x + SHADOW_DX, y + shadowDist);
      ctx.rotate(angle);
      ctx.scale(scale, scale);
      ctx.fillStyle = `rgba(0,0,0,${shadowAlpha.toFixed(2)})`;
      ctx.filter    = `blur(${shadowBlur.toFixed(0)}px)`;
      BirdSystem.drawBirdPath(ctx, span, tipY);
      ctx.restore();
    }

    // ── Bird (white) ────────────────────────────────────────────────────────
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    BirdSystem.drawBirdPath(ctx, span, tipY);
    ctx.restore();
  }

  /**
   * Draw the bird outline at the local origin (no translate/rotate applied here).
   * Front points toward −Y.  Called for both the bird and its shadow.
   */
  private static drawBirdPath(
    ctx: CanvasRenderingContext2D,
    span: number,
    tipY: number,
  ): void {
    // Body — narrow elongated triangle, tip forward
    ctx.beginPath();
    ctx.moveTo(0, BODY_FRONT);
    ctx.lineTo(-BODY_HW, BODY_REAR);
    ctx.lineTo(BODY_HW, BODY_REAR);
    ctx.closePath();
    ctx.fill();

    // Tail — wider triangle fanning out behind the body
    ctx.beginPath();
    ctx.moveTo(-TAIL_HW, BODY_REAR);
    ctx.lineTo(TAIL_HW,  BODY_REAR);
    ctx.lineTo(0,        TAIL_REAR);
    ctx.closePath();
    ctx.fill();

    // Left wing
    ctx.beginPath();
    ctx.moveTo(-BODY_HW, BODY_FRONT + 2);  // inner front attachment
    ctx.lineTo(-BODY_HW, BODY_REAR   - 2); // inner rear attachment
    ctx.lineTo(-span,    tipY);             // wing tip
    ctx.closePath();
    ctx.fill();

    // Right wing (mirror)
    ctx.beginPath();
    ctx.moveTo(BODY_HW, BODY_FRONT + 2);
    ctx.lineTo(BODY_HW, BODY_REAR   - 2);
    ctx.lineTo(span,    tipY);
    ctx.closePath();
    ctx.fill();
  }

  clear(): void {
    this.groups = [];
    this.flying = [];
  }
}
