import type { Track } from './Track';

// Car geometry constants (world units, drawn at local origin)
const BODY_W  = 28;
const BODY_H  = 68;
const AXLE_W  = 52;
const AXLE_H  = 7;
const TIRE_W  = 13;
const TIRE_H  = 22;
const TIRE_R  = 3;   // rounded-rect corner radius

/** Y-positions of front/rear axle relative to car origin. */
const REAR_Y  =  BODY_H / 2 - 14;
const FRONT_Y = -BODY_H / 2 + 14;

/**
 * The player's soapbox car.
 *
 * Phase 3: follows the track centerline at a constant placeholder speed.
 * Phase 2 will replace `update()` with real physics (gravity, steering, friction).
 */
export class Car {
  worldX = 0;
  worldY = 0;
  angle  = 0;   // canvas rotation (0 = front pointing up / screen-north)
  dist   = 0;   // arc-length traveled along track

  // Phase 2 will expose these to the physics system
  readonly speed = 280; // world units / second (placeholder)

  constructor(track: Track) {
    const s = track.getSampleAtDist(0);
    this.worldX = s.x;
    this.worldY = s.y;
  }

  /**
   * Advance car along the track centerline.
   * Replace this body in Phase 2 with real steering + physics.
   */
  update(dt: number, track: Track): void {
    this.dist += this.speed * dt;
    const s = track.getSampleAtDist(this.dist);
    this.worldX = s.x;
    this.worldY = s.y;
    // Map tangent vector → canvas rotation angle:
    // car body front is at local (0, -BODY_H/2), should align with travel direction (tx, ty)
    this.angle = Math.atan2(s.ty, s.tx) + Math.PI * 0.5;
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
   * Draw the soapbox car at origin, front pointing in the −Y direction.
   * Static so Track (and later a ghost car) can reuse the same shape.
   */
  static drawShape(ctx: CanvasRenderingContext2D): void {
    const tireOffX = AXLE_W / 2 - TIRE_W / 2;

    // Body — no outline per style guide
    ctx.fillStyle = '#e63030';
    ctx.fillRect(-BODY_W / 2, -BODY_H / 2, BODY_W, BODY_H);

    // Axles
    ctx.fillStyle = '#111111';
    ctx.fillRect(-AXLE_W / 2, REAR_Y  - AXLE_H / 2, AXLE_W, AXLE_H);
    ctx.fillRect(-AXLE_W / 2, FRONT_Y - AXLE_H / 2, AXLE_W, AXLE_H);

    // Tires — rounded rectangles
    for (const ay of [REAR_Y, FRONT_Y]) {
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.roundRect(side * tireOffX - TIRE_W / 2, ay - TIRE_H / 2, TIRE_W, TIRE_H, TIRE_R);
        ctx.fill();
      }
    }
  }
}
