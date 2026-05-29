import type { Track } from './Track';
import type { CarConfig } from './CarConfig';

// ─── Geometry constants (world units, local origin) ───────────────────────────

const BODY_W = 18;
const BODY_H = 66;
const AXLE_W = 44;
const AXLE_H = 5;
const TIRE_W = 5;
const TIRE_H = 22;
const SHADOW_COLOR = 'rgba(0,0,0,0.50)';
const SHADOW_BLUR = 10;

const REAR_Y = BODY_H / 2 - 14;
const FRONT_Y = -BODY_H / 2 + 15;

/** Bounding circle radius used for collision detection. */
export const CAR_RADIUS = 18;

/**
 * The player's soapbox car – Phase 2 full physics.
 *
 * Primary state
 *   worldX / worldY  – world position
 *   vx / vy          – velocity vector (world units / s)
 *   angle            – heading; canvas rotation angle (0 = facing screen-up)
 *   angularVel       – turning rate (rad / s)
 *
 * Track-relative state (derived each frame from world position)
 *   dist             – arc-length progress along track
 *   lateralOffset    – signed distance from centreline (+ = left of travel)
 *
 * Forward direction: (sin(angle), −cos(angle))
 * Perpendicular axis: (cos(angle), sin(angle))   – used for grip calculation
 *
 * Angle convention: pressing RIGHT decreases angle (car rotates CW on screen,
 * turning toward screen-right when going screen-down).
 */
export class Car {
  private readonly cfg: CarConfig;
  // World state
  worldX = 0;
  worldY = 0;
  vx = 0;
  vy = 0;
  angle = 0;
  angularVel = 0;

  // Track-relative (derived each tick)
  dist = 0;
  lateralOffset = 0;

  /** Accumulated forward distance for tire rotation animation (world units). */
  tirePhase = 0;

  /** Seconds remaining in post-crash freeze. */
  frozen = 0;

  constructor(track: Track, cfg: CarConfig) {
    this.cfg = cfg;
    const s = track.getSampleAtDist(0);
    this.worldX = s.x;
    this.worldY = s.y;
    // Heading aligned with track tangent (original convention: atan2(ty,tx)+π/2)
    this.angle = Math.atan2(s.ty, s.tx) + Math.PI * 0.5;
    // Rolling start: initial velocity along track tangent
    this.vx = s.tx * cfg.initSpeed;
    this.vy = s.ty * cfg.initSpeed;
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  /**
   * Physics tick.
   * @param dt    fixed timestep (seconds)
   * @param steer steer axis: −1 = left, 0 = none, +1 = right
   * @param brake brake axis: 0 = none, 1 = braking
   * @param track current track
   */
  update(dt: number, steer: number, brake: number, track: Track): void {
    if (this.frozen > 0) {
      this.frozen -= dt;
      return;
    }

    // ── Sample track at current progress ──────────────────────────────────────
    const s = track.getSampleAtDist(this.dist);
    const onRoad = Math.abs(this.lateralOffset) < s.halfWidth - CAR_RADIUS * 0.5;
    const drag = onRoad ? this.cfg.roadDrag : this.cfg.grassDrag;
    // Grip falls with speed so the car drifts outward at high speed in corners
    const curSpeed = Math.hypot(this.vx, this.vy);
    const driftGrip = this.cfg.lateralGrip / (1 + curSpeed * this.cfg.driftSpeedFactor);
    const grip = onRoad ? driftGrip : this.cfg.grassLateralGrip;

    // ── Car heading directions ─────────────────────────────────────────────────
    const fwdX = Math.sin(this.angle);   // forward X
    const fwdY = -Math.cos(this.angle);   // forward Y
    const perpX = Math.cos(this.angle);   // perpendicular axis X
    const perpY = Math.sin(this.angle);   // perpendicular axis Y

    // ── Gravity – downhill force along track tangent ───────────────────────────
    this.vx += s.tx * this.cfg.gravity * dt;
    this.vy += s.ty * this.cfg.gravity * dt;

    // ── Forward drag ──────────────────────────────────────────────────────────
    const fwdSpeed = this.vx * fwdX + this.vy * fwdY;
    if (fwdSpeed > 0) {
      this.vx -= fwdX * drag * fwdSpeed * dt;
      this.vy -= fwdY * drag * fwdSpeed * dt;
    }

    // ── Brake – reduce forward speed without cancelling sideways drift ────────
    if (brake > 0 && fwdSpeed > 0) {
      const brakeDelta = Math.min(fwdSpeed, this.cfg.brakeForce * brake * dt);
      this.vx -= fwdX * brakeDelta;
      this.vy -= fwdY * brakeDelta;
    }

    // ── Lateral grip – kill perpendicular velocity ─────────────────────────────
    const perpSpeed = this.vx * perpX + this.vy * perpY;
    const killFrac = Math.min(1, grip * dt);
    this.vx -= perpX * perpSpeed * killFrac;
    this.vy -= perpY * perpSpeed * killFrac;

    // ── Speed cap ──────────────────────────────────────────────────────────────
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > this.cfg.maxSpeed) {
      this.vx *= this.cfg.maxSpeed / speed;
      this.vy *= this.cfg.maxSpeed / speed;
    }

    // ── Steering ──────────────────────────────────────────────────────────────
    // Right (steer > 0) → angle decreases → minus sign
    const steerRate = this.cfg.steerAccel / (1 + speed * this.cfg.steerSpeedFactor);
    this.angularVel -= steer * steerRate * dt;
    this.angularVel *= Math.exp(-this.cfg.angDamp * dt);
    this.angle += this.angularVel * dt;

    // ── Tire phase — accumulate forward distance for tread animation ──────────
    this.tirePhase += Math.max(0, fwdSpeed) * dt;

    // ── Integrate position ────────────────────────────────────────────────────
    this.worldX += this.vx * dt;
    this.worldY += this.vy * dt;

    // ── Update track-relative state ────────────────────────────────────────────
    // Advance dist by the component of velocity along the track tangent
    this.dist += (this.vx * s.tx + this.vy * s.ty) * dt;
    this.dist = Math.max(0, Math.min(track.totalLength, this.dist));

    // Lateral offset = projection of (worldPos − trackCenter) onto left-normal
    const sNew = track.getSampleAtDist(this.dist);
    const dx = this.worldX - sNew.x;
    const dy = this.worldY - sNew.y;
    this.lateralOffset = dx * sNew.nx + dy * sNew.ny;
  }

  // ─── Collision response ────────────────────────────────────────────────────

  /**
   * Called by Game on obstacle or border collision.
   * Bounces lateral velocity, reduces forward speed, pushes car back inside road.
   */
  onCollision(track: Track): void {
    const s = track.getSampleAtDist(this.dist);

    // Perpendicular / forward directions
    const perpX = Math.cos(this.angle);
    const perpY = Math.sin(this.angle);
    const fwdX = Math.sin(this.angle);
    const fwdY = -Math.cos(this.angle);

    // Bounce lateral velocity (reflect + damp)
    const perpSpeed = this.vx * perpX + this.vy * perpY;
    this.vx -= perpX * perpSpeed * 1.8;   // kill lateral + 0.8× bounce
    this.vy -= perpY * perpSpeed * 1.8;

    // Reduce forward speed by ~50 %
    const fwdVel = this.vx * fwdX + this.vy * fwdY;
    this.vx -= fwdX * fwdVel * 0.50;
    this.vy -= fwdY * fwdVel * 0.50;

    // Kill angular velocity (avoid spinning into the wall again)
    this.angularVel = 0;

    // Clamp world position back inside road
    const maxLat = s.halfWidth - CAR_RADIUS - 4;
    if (Math.abs(this.lateralOffset) > maxLat) {
      const clamped = Math.sign(this.lateralOffset) * maxLat;
      const delta = clamped - this.lateralOffset;
      this.worldX += s.nx * delta;
      this.worldY += s.ny * delta;
      this.lateralOffset = clamped;
    }

    this.frozen = 0.45;
  }

  /**
   * Separates the car from a circular obstacle and gives it a small escape push.
   * The normal must point from the obstacle center toward the car.
   */
  onObstacleCollision(track: Track, nx: number, ny: number, pushOut: number): void {
    this.worldX += nx * pushOut;
    this.worldY += ny * pushOut;

    const normalSpeed = this.vx * nx + this.vy * ny;
    if (normalSpeed < 0) {
      this.vx -= nx * normalSpeed * 1.6;
      this.vy -= ny * normalSpeed * 1.6;
    }

    const escapeSpeed = this.vx * nx + this.vy * ny;
    if (escapeSpeed < 95) {
      this.vx += nx * (95 - escapeSpeed);
      this.vy += ny * (95 - escapeSpeed);
    }

    this.vx *= 0.62;
    this.vy *= 0.62;
    this.angularVel = 0;

    const s = track.getSampleAtDist(this.dist);
    const dx = this.worldX - s.x;
    const dy = this.worldY - s.y;
    this.lateralOffset = dx * s.nx + dy * s.ny;

    this.frozen = 0.35;
  }

  // ─── Accessors ─────────────────────────────────────────────────────────────

  /** Current scalar speed (u/s) – used by the HUD. */
  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  /** Lateral (sideways) speed (u/s) – used to detect drifting. */
  get lateralSpeed(): number {
    const perpX = Math.cos(this.angle);
    const perpY = Math.sin(this.angle);
    return Math.abs(this.vx * perpX + this.vy * perpY);
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────

  render(
    ctx: CanvasRenderingContext2D,
    camX: number, camY: number,
    W: number, H: number,
  ): void {
    const sx = this.worldX - camX + W * 0.5;
    const sy = camY - this.worldY + H * 0.5;   // Y flipped

    ctx.save();
    ctx.translate(sx, sy);
    // With Y flipped, the canvas draw angle must be mirrored so the car
    // faces the direction of travel (upward on screen).
    ctx.rotate(Math.PI - this.angle);
    Car.drawShape(ctx, this.tirePhase, this.cfg.color);
    ctx.restore();
  }

  /**
   * Draw the soapbox car at local origin, front pointing in −Y direction.
   * Static so a ghost car can reuse the same shape.
   */
  static drawShape(ctx: CanvasRenderingContext2D, tirePhase = 0, color = '#e63030'): void {
    const tireOffX = AXLE_W / 2 - TIRE_W / 2;

    // Luminance-based detail color so the rear circle contrasts on dark cars
    const r = parseInt(color.slice(1, 3), 16) || 0;
    const g = parseInt(color.slice(3, 5), 16) || 0;
    const b = parseInt(color.slice(5, 7), 16) || 0;
    const lum = (r * 299 + g * 587 + b * 114) / 1000;
    const detailColor = lum > 60 ? '#111111' : '#888888';

    // Soapbox body path: small rounded nose at front (−Y), rounded rear.
    const bodyPath = (): void => {
      const hw       = BODY_W / 2;
      const hh       = BODY_H / 2;
      const noseR    = 4;           // nose tip radius
      const noseCY   = -hh + noseR; // centre of nose arc
      const noseBase = -hh + 16;    // y where full width begins
      const rearR    = 8;           // rear corner radius

      ctx.beginPath();
      // Nose arc: left point → tip (−Y) → right point, perfectly centred on x=0
      ctx.arc(0, noseCY, noseR, Math.PI, 0);
      ctx.lineTo( hw, noseBase);                             // right shoulder
      ctx.lineTo( hw,  hh - rearR);                          // right side
      ctx.arcTo(  hw,  hh,  hw - rearR,  hh, rearR);        // rear-right corner
      ctx.lineTo(-hw + rearR, hh);                           // rear bottom
      ctx.arcTo( -hw,  hh, -hw,  hh - rearR, rearR);        // rear-left corner
      ctx.lineTo(-hw, noseBase);                             // left side
      ctx.lineTo(-noseR, noseCY);                            // approach nose arc
      ctx.closePath();
    };

    // Shadow under body
    ctx.save();
    ctx.fillStyle = SHADOW_COLOR;
    ctx.filter = `blur(${SHADOW_BLUR}px)`;
    ctx.translate(5, 6);
    bodyPath();
    ctx.fill();
    ctx.restore();

    // Axles behind the body
    ctx.fillStyle = color;
    ctx.fillRect(-AXLE_W / 2, REAR_Y - AXLE_H / 2, AXLE_W, AXLE_H);
    ctx.fillRect(-AXLE_W / 2, FRONT_Y - AXLE_H / 2, AXLE_W, AXLE_H);

    // Body fill
    ctx.fillStyle = color;
    bodyPath();
    ctx.fill();

    // Rear circular detail.
    ctx.fillStyle = detailColor;
    ctx.beginPath();
    ctx.arc(0, BODY_H * 0.24, BODY_W * 0.30, 0, Math.PI * 2);
    ctx.fill();

    // ── 3-D shading: right + bottom edges darker ─────────────────────────────
    ctx.save();
    bodyPath();
    ctx.clip();

    // Right edge
    const rg = ctx.createLinearGradient(BODY_W * 0.05, 0, BODY_W / 2, 0);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = rg;
    ctx.fillRect(-BODY_W / 2, -BODY_H / 2, BODY_W, BODY_H);

    // Bottom (rear) edge
    const bg = ctx.createLinearGradient(0, BODY_H * 0.05, 0, BODY_H / 2);
    bg.addColorStop(0, 'rgba(0,0,0,0)');
    bg.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = bg;
    ctx.fillRect(-BODY_W / 2, -BODY_H / 2, BODY_W, BODY_H);

    ctx.restore();

    // ── Glanzpunkt nahe der Nasenspitze, leicht links ──────────────────────
    ctx.fillStyle = 'rgba(255,255,255,0.70)';
    ctx.beginPath();
    ctx.ellipse(
      -2,                  // leicht links der Mittellinie
      -BODY_H / 2 + 4,    // nahe der Nasenspitze
      2.0, 1.3, -0.4, 0, Math.PI * 2,
    );
    ctx.fill();

    // Tires — top-down with rolling tread stripes
    const STRIPE_PERIOD = 7;   // world units between stripe centres
    const STRIPE_THICK  = 2.5; // stripe thickness
    const offset = tirePhase % STRIPE_PERIOD;

    for (const ay of [REAR_Y, FRONT_Y]) {
      for (const side of [-1, 1]) {
        const tx = side * tireOffX - TIRE_W / 2;
        const ty = ay - TIRE_H / 2;

        ctx.save();
        ctx.beginPath();
        ctx.rect(tx, ty, TIRE_W, TIRE_H);
        ctx.clip();

        // Base rubber
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(tx, ty, TIRE_W, TIRE_H);

        // Tread stripes scrolling along Y (forward direction in local coords)
        ctx.fillStyle = '#3d3d3d';
        for (let y = ty - STRIPE_PERIOD + offset; y < ty + TIRE_H + STRIPE_PERIOD; y += STRIPE_PERIOD) {
          ctx.fillRect(tx, y, TIRE_W, STRIPE_THICK);
        }

        ctx.restore();
      }
    }
  }
}
