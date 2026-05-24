import { catmullRom, Rng } from '../utils/math';
import type { Vec2 } from '../utils/math';

// ─── Constants ────────────────────────────────────────────────────────────────

const HALF_WIDTH  = 140;  // road half-width (full road = 280 world units)
const SAMPLE_STEP = 10;   // arc-length between stored samples
const YSTEP       = 560;  // Y spacing between track waypoints
const NUM_SEGS    = 15;   // number of curved segments (→ ~30 s at 280 u/s)
const BALE_EVERY  = 115;  // arc-length between hay-bale pairs
const BALE_R      = 22;   // hay-bale radius (world units)
const BALE_OFF    = 6;    // how far outside road edge bale centers sit

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrackSample {
  x: number; y: number;    // world center position
  tx: number; ty: number;  // unit tangent  (direction of travel)
  nx: number; ny: number;  // unit left-normal (perpendicular to tangent)
  halfWidth: number;
  dist: number;            // arc-length from track origin
}

interface Bale { wx: number; wy: number; }

// ─── Track class ──────────────────────────────────────────────────────────────

export class Track {
  readonly samples: TrackSample[] = [];
  readonly bales:   Bale[]        = [];
  readonly totalLength: number;
  readonly finishDist:  number;

  constructor(seed = 1337) {
    const pts = this.genWaypoints(seed);
    this.buildSamples(pts);
    this.totalLength = this.samples.at(-1)?.dist ?? 0;
    this.finishDist  = this.totalLength - 280;
    this.placeBales(seed ^ 0xBEEF);
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
    pts.push({ x: lx * 0.5,  y: YSTEP * (NUM_SEGS + 1) });
    pts.push({ x: 0,          y: YSTEP * (NUM_SEGS + 2) });
    pts.push({ x: 0,          y: YSTEP * (NUM_SEGS + 3) });
    pts.push({ x: 0,          y: YSTEP * (NUM_SEGS + 4) });

    return pts;
  }

  /**
   * Walk the Catmull-Rom spline and store samples at regular arc-length
   * intervals (SAMPLE_STEP), preserving the tangent direction at each point.
   */
  private buildSamples(pts: Vec2[]): void {
    const SUB = 180; // sub-steps per segment for accurate arc-length walking

    let arcDist = 0;
    let nextAt  = 0;
    let prev    = catmullRom(pts[0], pts[1], pts[2], pts[3], 0);

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
            ny:  tx,
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
      nextAt = s.dist + BALE_EVERY + rng.range(-18, 18);

      const off = s.halfWidth + BALE_OFF + rng.range(0, 14);
      this.bales.push({ wx: s.x + s.nx * off, wy: s.y + s.ny * off }); // left
      this.bales.push({ wx: s.x - s.nx * off, wy: s.y - s.ny * off }); // right
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

  /**
   * Returns road-edge X values at the track center nearest to worldY.
   * Used for collision checks in Phase 4.
   */
  getEdgesAt(worldY: number): { cx: number; leftX: number; rightX: number } {
    const s = this.samples[this.idxAtY(worldY)];
    return {
      cx:     s.x,
      leftX:  s.x + s.nx * s.halfWidth,
      rightX: s.x - s.nx * s.halfWidth,
    };
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
    const sx = (wx: number) => wx - camX + W * 0.5;
    const sy = (wy: number) => wy - camY + H * 0.5;

    // Pre-compute edge arrays
    const lx = slice.map(s => sx(s.x + s.nx * s.halfWidth));
    const ly = slice.map(s => sy(s.y + s.ny * s.halfWidth));
    const rx = slice.map(s => sx(s.x - s.nx * s.halfWidth));
    const ry = slice.map(s => sy(s.y - s.ny * s.halfWidth));

    // ── Road fill ─────────────────────────────────────────────────────────────
    ctx.fillStyle = '#b0aead';
    ctx.beginPath();
    ctx.moveTo(lx[0], ly[0]);
    for (let i = 1; i < slice.length; i++) ctx.lineTo(lx[i], ly[i]);
    for (let i = slice.length - 1; i >= 0; i--) ctx.lineTo(rx[i], ry[i]);
    ctx.closePath();
    ctx.fill();

    // ── Border lines ──────────────────────────────────────────────────────────
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    this.polyline(ctx, lx, ly);
    this.polyline(ctx, rx, ry);

    // ── Center dashes ─────────────────────────────────────────────────────────
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 18]);
    this.polyline(ctx, slice.map(s => sx(s.x)), slice.map(s => sy(s.y)));
    ctx.setLineDash([]);

    // ── Hay bales ─────────────────────────────────────────────────────────────
    this.renderBales(ctx, camX, camY, W, H);

    // ── Start & finish lines ──────────────────────────────────────────────────
    this.renderLine(ctx, camX, camY, W, H, 0,               '#22cc44', 'START');
    this.renderLine(ctx, camX, camY, W, H, this.finishDist,  '#e63030', 'ZIEL');
  }

  private polyline(ctx: CanvasRenderingContext2D, xs: number[], ys: number[]): void {
    ctx.beginPath();
    ctx.moveTo(xs[0], ys[0]);
    for (let i = 1; i < xs.length; i++) ctx.lineTo(xs[i], ys[i]);
    ctx.stroke();
  }

  private renderLine(
    ctx: CanvasRenderingContext2D,
    camX: number, camY: number,
    W: number, H: number,
    dist: number,
    color: string,
    label: string,
  ): void {
    const s  = this.getSampleAtDist(dist);
    const cx = s.x - camX + W * 0.5;
    const cy = s.y - camY + H * 0.5;
    if (cy < -80 || cy > H + 80) return;

    const lx = (s.x + s.nx * s.halfWidth) - camX + W * 0.5;
    const ly = (s.y + s.ny * s.halfWidth) - camY + H * 0.5;
    const rx = (s.x - s.nx * s.halfWidth) - camX + W * 0.5;
    const ry = (s.y - s.ny * s.halfWidth) - camY + H * 0.5;

    // Stripe
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(rx, ry);
    ctx.stroke();

    // Label
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
    const cull = BALE_R + 20;

    for (const b of this.bales) {
      const bx = b.wx - camX + W * 0.5;
      const by = b.wy - camY + H * 0.5;
      if (by < -cull || by > H + cull || bx < -cull || bx > W + cull) continue;

      // Body
      ctx.fillStyle = '#d4a017';
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx, by, BALE_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Binding detail lines
      ctx.strokeStyle = '#b08010';
      ctx.lineWidth = 1.5;
      const r = BALE_R * 0.6;
      ctx.beginPath();
      ctx.moveTo(bx - r, by); ctx.lineTo(bx + r, by);
      ctx.moveTo(bx, by - r); ctx.lineTo(bx, by + r);
      ctx.stroke();
    }
  }
}
