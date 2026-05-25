import { catmullRom, Rng } from '../utils/math';
import type { Vec2 } from '../utils/math';
import { drawHayBale } from './Obstacle';

// ─── Constants ────────────────────────────────────────────────────────────────

const HALF_WIDTH = 140;  // road half-width (full road = 280 world units)
const SAMPLE_STEP = 10;   // arc-length between stored samples
const YSTEP = 560;  // Y spacing between track waypoints
const NUM_SEGS = 15;   // number of curved segments (→ ~30 s at 280 u/s)
const BALE_EVERY = 78;   // arc-length between hay-bale pairs
const BALE_R = 22;   // hay-bale radius (world units)
const BALE_OFF = BALE_R - 3; // keeps the inner edge close to the road edge
const BALE_ANGLE_JITTER = Math.PI / 36; // ±5°

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrackSample {
  x: number; y: number;    // world center position
  tx: number; ty: number;  // unit tangent  (direction of travel)
  nx: number; ny: number;  // unit left-normal (perpendicular to tangent)
  halfWidth: number;
  dist: number;            // arc-length from track origin
}

interface Bale { wx: number; wy: number; angle: number; }

// ─── Track class ──────────────────────────────────────────────────────────────

export class Track {
  readonly samples: TrackSample[] = [];
  readonly bales: Bale[] = [];
  readonly totalLength: number;
  readonly finishDist: number;

  constructor(seed = 1337) {
    const pts = this.genWaypoints(seed);
    this.buildSamples(pts);
    this.totalLength = this.samples.at(-1)?.dist ?? 0;
    this.finishDist = this.totalLength - 280;
    this.placeBales(seed ^ 0xBEEF);
    this.placeFinishBarrier();
  }

  /** Place a wall of hay bales across the road just past the finish line. */
  private placeFinishBarrier(): void {
    const BARRIER_COUNT = 7;
    const s = this.getSampleAtDist(this.finishDist + BALE_R * 2.5);
    const usableHalf = HALF_WIDTH - BALE_R;
    const baseAngle = Math.atan2(-s.ty, s.tx);

    for (let i = 0; i < BARRIER_COUNT; i++) {
      const t = (i / (BARRIER_COUNT - 1)) * 2 - 1; // −1 … +1
      const lateral = t * usableHalf;
      this.bales.push({
        wx: s.x + s.nx * lateral,
        wy: s.y + s.ny * lateral,
        angle: baseAngle,
      });
    }
  }

  // ── Generation ──────────────────────────────────────────────────────────────

  private genWaypoints(seed: number): Vec2[] {
    const rng = new Rng(seed);
    const pts: Vec2[] = [];

    // Ghost points + straight opening
    for (let i = -3; i <= 0; i++) pts.push({ x: 0, y: YSTEP * i });

    // Curvy body
    let prevX = 0;
    for (let i = 1; i <= NUM_SEGS; i++) {
      prevX = Math.max(-520, Math.min(520, prevX + rng.range(-300, 300)));
      pts.push({ x: prevX, y: YSTEP * i });
    }

    // Straight closing + ghost points
    const lx = pts.at(-1)!.x;
    pts.push({ x: lx * 0.5, y: YSTEP * (NUM_SEGS + 1) });
    pts.push({ x: 0, y: YSTEP * (NUM_SEGS + 2) });
    pts.push({ x: 0, y: YSTEP * (NUM_SEGS + 3) });
    pts.push({ x: 0, y: YSTEP * (NUM_SEGS + 4) });

    return pts;
  }

  /**
   * Walk the Catmull-Rom spline and store samples at regular arc-length
   * intervals (SAMPLE_STEP), preserving the tangent direction at each point.
   */
  private buildSamples(pts: Vec2[]): void {
    const SUB = 180; // sub-steps per segment for accurate arc-length walking

    let arcDist = 0;
    let nextAt = 0;
    let prev = catmullRom(pts[0], pts[1], pts[2], pts[3], 0);

    for (let seg = 1; seg < pts.length - 2; seg++) {
      const [p0, p1, p2, p3] = [pts[seg - 1], pts[seg], pts[seg + 1], pts[seg + 2]];

      for (let s = 1; s <= SUB; s++) {
        const pos = catmullRom(p0, p1, p2, p3, s / SUB);
        const dx = pos.x - prev.x;
        const dy = pos.y - prev.y;
        const dl = Math.hypot(dx, dy);
        if (dl === 0) continue;

        arcDist += dl;

        while (arcDist >= nextAt) {
          // Interpolate back from pos to exact sample location
          const overshoot = arcDist - nextAt;
          const tx = dx / dl;
          const ty = dy / dl;

          this.samples.push({
            x: pos.x - tx * overshoot,
            y: pos.y - ty * overshoot,
            tx, ty,
            nx: -ty,  // left normal
            ny: tx,
            halfWidth: HALF_WIDTH,
            dist: nextAt,
          });

          nextAt += SAMPLE_STEP;
        }

        prev = pos;
      }
    }
  }

  private placeBales(seed: number): void {
    const rng = new Rng(seed);
    let nextAt = BALE_EVERY;

    for (const s of this.samples) {
      if (s.dist < nextAt) continue;
      nextAt = s.dist + BALE_EVERY + rng.range(-24, 24);

      const off = s.halfWidth + BALE_OFF + rng.range(0, 6);
      const baseAngle = Math.atan2(-s.ty, s.tx);
      const leftAngle = baseAngle + rng.range(-BALE_ANGLE_JITTER, BALE_ANGLE_JITTER);
      const rightAngle = baseAngle + rng.range(-BALE_ANGLE_JITTER, BALE_ANGLE_JITTER);
      this.bales.push({ wx: s.x + s.nx * off, wy: s.y + s.ny * off, angle: leftAngle }); // left
      this.bales.push({ wx: s.x - s.nx * off, wy: s.y - s.ny * off, angle: rightAngle }); // right
    }
  }

  // ── Queries ─────────────────────────────────────────────────────────────────

  /** O(1) sample lookup by arc-length distance. */
  getSampleAtDist(dist: number): TrackSample {
    const idx = Math.min(
      Math.max(0, Math.round(dist / SAMPLE_STEP)),
      this.samples.length - 1,
    );
    return this.samples[idx];
  }

  /** Binary search — index of sample whose Y is closest to worldY. */
  private idxAtY(worldY: number): number {
    let lo = 0, hi = this.samples.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.samples[mid].y < worldY) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  render(
    ctx: CanvasRenderingContext2D,
    camX: number, camY: number,
    W: number, H: number,
  ): void {
    // Determine visible sample range (with margin for curves near screen edge)
    const margin = H * 0.6 + 100;
    const lo = Math.max(0, this.idxAtY(camY - margin) - 2);
    const hi = Math.min(this.samples.length - 1, this.idxAtY(camY + margin) + 2);
    if (hi - lo < 2) return;

    const slice = this.samples.slice(lo, hi + 1);
    const scx = (wx: number) => wx - camX + W * 0.5;
    // Y is flipped: world +Y (downhill) → screen −Y (upward on screen).
    const scy = (wy: number) => camY - wy + H * 0.5;

    // Pre-compute edge arrays
    const lx: number[] = [];
    const ly: number[] = [];
    const rx: number[] = [];
    const ry: number[] = [];

    for (const s of slice) {
      lx.push(scx(s.x + s.nx * s.halfWidth));
      ly.push(scy(s.y + s.ny * s.halfWidth));
      rx.push(scx(s.x - s.nx * s.halfWidth));
      ry.push(scy(s.y - s.ny * s.halfWidth));
    }

    // ── Road fill: per-segment quads with alternating stripes ─────────────────
    // Each stripe pair spans STRIPE_LEN arc-length units.
    const STRIPE_LEN = 65;
    for (let i = 0; i < slice.length - 1; i++) {
      const even = Math.floor(slice[i].dist / STRIPE_LEN) % 2 === 0;
      ctx.fillStyle = even ? '#b4b2b0' : '#a9a7a5';
      ctx.beginPath();
      ctx.moveTo(lx[i], ly[i]);
      ctx.lineTo(lx[i + 1], ly[i + 1]);
      ctx.lineTo(rx[i + 1], ry[i + 1]);
      ctx.lineTo(rx[i], ry[i]);
      ctx.closePath();
      ctx.fill();
    }

    // ── Center dashes ─────────────────────────────────────────────────────────
    // One dash per stripe (every 2 * STRIPE_LEN).
    const DASH_LEN = 28;
    const DASH_W = 7;
    for (let i = 0; i < slice.length - 1; i++) {
      const s = slice[i];
      const sn = slice[i + 1];
      const seg = Math.floor(s.dist / STRIPE_LEN);
      if (seg % 2 !== 0) continue;          // only one stripe out of two
      // Use midpoint between the two samples
      const my = scy((s.y + sn.y) * 0.5);
      const mx = scx((s.x + sn.x) * 0.5);
      const tx = (s.tx + sn.tx) * 0.5;
      const ty = (s.ty + sn.ty) * 0.5;
      const angle = Math.atan2(-ty, tx);

      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      this.renderDash(ctx, mx, my, angle, DASH_LEN, DASH_W);
    }

    // ── Hay bales ─────────────────────────────────────────────────────────────
    this.renderBales(ctx, camX, camY, W, H);

    // ── Start & finish lines ──────────────────────────────────────────────────
    this.renderLine(ctx, camX, camY, W, H, 0, '#ffffff', 'START');
    this.renderLine(ctx, camX, camY, W, H, this.finishDist, '#ffffff', 'ZIEL');
  }

  private renderDash(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    angle: number,
    len: number, width: number,
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillRect(-len * 0.5, -width * 0.5, len, width);
    ctx.restore();
  }

  private renderLine(
    ctx: CanvasRenderingContext2D,
    camX: number, camY: number,
    W: number, H: number,
    dist: number,
    color: string,
    label: string,
  ): void {
    const s = this.getSampleAtDist(dist);
    // Y flipped
    const cx = s.x - camX + W * 0.5;
    const cy = camY - s.y + H * 0.5;
    if (cy < -80 || cy > H + 80) return;

    // Left/right edges — Y component uses minus because scy flips the normal offset
    const lx = (s.x + s.nx * s.halfWidth) - camX + W * 0.5;
    const ly = camY - (s.y + s.ny * s.halfWidth) + H * 0.5;
    const rx = (s.x - s.nx * s.halfWidth) - camX + W * 0.5;
    const ry = camY - (s.y - s.ny * s.halfWidth) + H * 0.5;

    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(rx, ry);
    ctx.stroke();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 15px "Open Sans", sans-serif';
    ctx.fillStyle = '#111111';
    ctx.fillText(label, cx, cy - 14);
    ctx.restore();
  }

  private renderBales(
    ctx: CanvasRenderingContext2D,
    camX: number, camY: number,
    W: number, H: number,
  ): void {
    const scx = (wx: number) => wx - camX + W * 0.5;
    const scy = (wy: number) => camY - wy + H * 0.5;

    for (const b of this.bales) {
      const bx = scx(b.wx);
      const by = scy(b.wy);
      if (by < -(BALE_R + 20) || by > H + BALE_R + 20 || bx < -(BALE_R + 20) || bx > W + BALE_R + 20) continue;
      drawHayBale(ctx, bx, by, BALE_R, b.angle, b.wx, b.wy);
    }
  }
}
