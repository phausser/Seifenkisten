import type { Track } from './Track';

// ─── Geometry constants (world units, local origin) ───────────────────────────

const BODY_W = 24;
const BODY_H = 66;
const AXLE_W = 52;
const AXLE_H = 5;
const TIRE_W = 5;
const TIRE_H = 22;
const TIRE_R = 3;
const SHADOW_COLOR = 'rgba(0,0,0,0.50)';
const SHADOW_BLUR = 10;

const REAR_Y = BODY_H / 2 - 14;
const FRONT_Y = -BODY_H / 2 + 15;

/** Bounding circle radius used for collision detection. */
export const CAR_RADIUS = 18;

// ─── Physics tuning ───────────────────────────────────────────────────────────

/** Downhill acceleration – applied along the track tangent direction (u/s²). */
const GRAVITY = 240;

/** Linear drag on the road surface.  Terminal velocity ≈ GRAVITY / ROAD_DRAG. */
const ROAD_DRAG = 0.62;   // terminal ≈ 387 u/s

/** Much higher drag off-road so the car slows noticeably on grass. */
const GRASS_DRAG = 3.2;    // terminal ≈  75 u/s

/** Lateral velocity is killed this fraction per second on road (high = grippy). */
const LATERAL_GRIP = 4.2;

/** Reduced grip on grass – the car slides more. */
const GRASS_LATERAL_GRIP = 1.2;

/** Angular acceleration from a full steer input at zero speed (rad/s²). */
const STEER_ACCEL = 11.0;

/** Speed-dependent steer reduction:  effective = STEER_ACCEL / (1 + v * k). */
const STEER_SPEED_FACTOR = 0.0017;

/** Angular velocity exponential decay rate (1/s). */
const ANG_DAMP = 10.0;

/** Brake force applied opposite forward movement (u/s²). */
const BRAKE_FORCE = 520;

/** Hard velocity cap (u/s). */
const MAX_SPEED = 500;

/** Starting speed along track so the car rolls immediately (u/s). */
const INIT_SPEED = 90;

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

  /** Seconds remaining in post-crash freeze. */
  frozen = 0;

  constructor(track: Track) {
    const s = track.getSampleAtDist(0);
    this.worldX = s.x;
    this.worldY = s.y;
    // Heading aligned with track tangent (original convention: atan2(ty,tx)+π/2)
    this.angle = Math.atan2(s.ty, s.tx) + Math.PI * 0.5;
    // Rolling start: initial velocity along track tangent
    this.vx = s.tx * INIT_SPEED;
    this.vy = s.ty * INIT_SPEED;
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
    const drag = onRoad ? ROAD_DRAG : GRASS_DRAG;
    const grip = onRoad ? LATERAL_GRIP : GRASS_LATERAL_GRIP;

    // ── Car heading directions ─────────────────────────────────────────────────
    const fwdX = Math.sin(this.angle);   // forward X
    const fwdY = -Math.cos(this.angle);   // forward Y
    const perpX = Math.cos(this.angle);   // perpendicular axis X
    const perpY = Math.sin(this.angle);   // perpendicular axis Y

    // ── Gravity – downhill force along track tangent ───────────────────────────
    this.vx += s.tx * GRAVITY * dt;
    this.vy += s.ty * GRAVITY * dt;

    // ── Forward drag ──────────────────────────────────────────────────────────
    const fwdSpeed = this.vx * fwdX + this.vy * fwdY;
    if (fwdSpeed > 0) {
      this.vx -= fwdX * drag * fwdSpeed * dt;
      this.vy -= fwdY * drag * fwdSpeed * dt;
    }

    // ── Brake – reduce forward speed without cancelling sideways drift ────────
    if (brake > 0 && fwdSpeed > 0) {
      const brakeDelta = Math.min(fwdSpeed, BRAKE_FORCE * brake * dt);
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
    if (speed > MAX_SPEED) {
      this.vx *= MAX_SPEED / speed;
      this.vy *= MAX_SPEED / speed;
    }

    // ── Steering ──────────────────────────────────────────────────────────────
    // Right (steer > 0) → angle decreases → minus sign
    const steerRate = STEER_ACCEL / (1 + speed * STEER_SPEED_FACTOR);
    this.angularVel -= steer * steerRate * dt;
    this.angularVel *= Math.exp(-ANG_DAMP * dt);
    this.angle += this.angularVel * dt;

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
    ctx.save();
    ctx.fillStyle = SHADOW_COLOR;
    ctx.filter = `blur(${SHADOW_BLUR}px)`;
    ctx.beginPath();
    ctx.roundRect(-BODY_W / 2 + 5, -BODY_H / 2 + 6, BODY_W, BODY_H, BODY_W / 2);
    ctx.fill();
    ctx.restore();

    // Axles behind the body
    ctx.fillStyle = '#e63030';
    ctx.fillRect(-AXLE_W / 2, REAR_Y - AXLE_H / 2, AXLE_W, AXLE_H);
    ctx.fillRect(-AXLE_W / 2, FRONT_Y - AXLE_H / 2, AXLE_W, AXLE_H);

    // Body: slim soapbox shape with rounded front.
    ctx.fillStyle = '#e63030';
    ctx.beginPath();
    ctx.roundRect(-BODY_W / 2, -BODY_H / 2, BODY_W, BODY_H, BODY_W / 2);
    ctx.fill();

    // Rear circular highlight.
    ctx.fillStyle = '#f04a3f';
    ctx.beginPath();
    ctx.arc(0, BODY_H * 0.24, BODY_W * 0.30, 0, Math.PI * 2);
    ctx.fill();

    // ── 3-D shading: right + bottom edges darker ─────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-BODY_W / 2, -BODY_H / 2, BODY_W, BODY_H, BODY_W / 2);
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

    // ── Glanzpunkt vorne links (~6 px vom Karosserierand) ───────────────────
    ctx.fillStyle = 'rgba(255,255,255,0.70)';
    ctx.beginPath();
    ctx.ellipse(
      -BODY_W / 2 + 7,   // 6–7 px vom linken Rand
      -BODY_H / 2 + 7,   // 6–7 px vom vorderen (oberen) Rand
      2.0, 1.3, -0.4, 0, Math.PI * 2,
    );
    ctx.fill();

    // Tires
    ctx.fillStyle = '#111111';
    for (const ay of [REAR_Y, FRONT_Y]) {
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.roundRect(side * tireOffX - TIRE_W / 2, ay - TIRE_H / 2, TIRE_W, TIRE_H, TIRE_R);
        ctx.fill();
      }
    }
  }
}
