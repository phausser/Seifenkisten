import type { Track } from './Track';

// ─── Geometry constants (world units, local origin) ───────────────────────────

const BODY_W  = 28;
const BODY_H  = 68;
const AXLE_W  = 52;
const AXLE_H  = 7;
const TIRE_W  = 13;
const TIRE_H  = 22;
const TIRE_R  = 3;

const REAR_Y  =  BODY_H / 2 - 14;
const FRONT_Y = -BODY_H / 2 + 14;

/** Bounding circle radius used for collision detection. */
export const CAR_RADIUS = 18;

/**
 * The player's soapbox car.
 *
 * Phase 3 placeholder: follows track centerline at constant speed.
 * Phase 2 will replace `update()` with real physics (gravity, steering, friction).
 *
 * `lateralOffset` — deviation from centerline in world units along the track normal.
 * Set by collision response; Phase 2 will drive it via steering input.
 */
export class Car {
  worldX = 0;
  worldY = 0;
  angle  = 0;   // canvas rotation (0 = front pointing toward screen-top)
  dist   = 0;   // arc-length traveled along track

  lateralOffset = 0;  // world units from centerline; + = left, − = right
  frozen        = 0;  // seconds remaining in post-crash freeze

  readonly speed = 280; // placeholder — Phase 2 replaces with dynamic velocity

  constructor(track: Track) {
    const s = track.getSampleAtDist(0);
    this.worldX = s.x;
    this.worldY = s.y;
  }

  /**
   * Advance car along the track.
   * Phase 2: replace body with full physics; keep lateralOffset + frozen logic.
   */
  update(dt: number, track: Track): void {
    if (this.frozen > 0) {
      this.frozen -= dt;
      return;
    }

    this.dist += this.speed * dt;
    const s = track.getSampleAtDist(this.dist);

    // Decay lateral offset toward center (placeholder spring — Phase 2 replaces)
    this.lateralOffset *= Math.pow(0.80, dt * 60);

    this.worldX = s.x + s.nx * this.lateralOffset;
    this.worldY = s.y + s.ny * this.lateralOffset;
    this.angle  = Math.atan2(s.ty, s.tx) + Math.PI * 0.5;
  }

  /**
   * Called by Game on collision (obstacle or border).
   * Bounces car back toward centerline; Game applies the time penalty.
   */
  onCollision(track: Track): void {
    const s = track.getSampleAtDist(this.dist);
    // Reflect lateral offset back toward center with damping
    this.lateralOffset = -this.lateralOffset * 0.4;
    // Clamp inside road so car stays visible
    const maxLateral = s.halfWidth - CAR_RADIUS - 4;
    this.lateralOffset = Math.max(-maxLateral, Math.min(maxLateral, this.lateralOffset));
    this.frozen = 0.45;
  }

  render(
    ctx: CanvasRenderingContext2D,
    camX: number, camY: number,
    W: number, H: number,
  ): void {
    const sx = this.worldX - camX + W * 0.5;
    const sy = this.worldY - camY + H * 0.5;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.angle);
    Car.drawShape(ctx);
    ctx.restore();
  }

  /**
   * Draw the soapbox car at local origin, front pointing in −Y direction.
   * Static so a ghost car can reuse the same shape.
   */
  static drawShape(ctx: CanvasRenderingContext2D): void {
    const tireOffX = AXLE_W / 2 - TIRE_W / 2;

    // Shadow under body
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.fillRect(-BODY_W / 2 + 5, -BODY_H / 2 + 6, BODY_W, BODY_H);

    // Body — no outline
    ctx.fillStyle = '#e63030';
    ctx.fillRect(-BODY_W / 2, -BODY_H / 2, BODY_W, BODY_H);

    // Axles
    ctx.fillStyle = '#111111';
    ctx.fillRect(-AXLE_W / 2, REAR_Y  - AXLE_H / 2, AXLE_W, AXLE_H);
    ctx.fillRect(-AXLE_W / 2, FRONT_Y - AXLE_H / 2, AXLE_W, AXLE_H);

    // Tires
    for (const ay of [REAR_Y, FRONT_Y]) {
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.roundRect(side * tireOffX - TIRE_W / 2, ay - TIRE_H / 2, TIRE_W, TIRE_H, TIRE_R);
        ctx.fill();
      }
    }
  }
}
