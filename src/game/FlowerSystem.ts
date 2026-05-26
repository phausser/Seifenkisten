import { Rng } from '../utils/math';
import type { Track } from './Track';

// ─── Constants ────────────────────────────────────────────────────────────────

const NUM_GROUPS = 20;   // total flower groups on the course
const BALE_W     = 44;   // hay-bale diameter (radius 22 × 2)
const GRASS_MIN  = 4 * BALE_W;  // = 176 — four bale-widths from road edge
const GRASS_MAX  = 300;  // max lateral offset beyond road edge
const FLOWER_GAP = 5;    // minimum gap between petal edges within a group

// ─── Types ────────────────────────────────────────────────────────────────────

interface Flower {
  wx:     number;
  wy:     number;
  radius: number;  // overall radius  (6–11 world units)
  petals: number;  // 5 or 6
  angle:  number;  // random rotation
}

// ─── FlowerSystem ─────────────────────────────────────────────────────────────

export class FlowerSystem {
  private flowers: Flower[] = [];

  // ── Placement ──────────────────────────────────────────────────────────────

  place(track: Track, seed: number): void {
    this.flowers = [];
    const rng  = new Rng(seed);
    const step = track.finishDist / (NUM_GROUPS + 1);

    for (let g = 1; g <= NUM_GROUPS; g++) {
      const dist = step * g;
      const s    = track.getSampleAtDist(dist);
      const side = rng.next() > 0.5 ? 1 : -1;
      const lat  = s.halfWidth + GRASS_MIN + rng.range(0, GRASS_MAX - GRASS_MIN);
      // anchor point of the group
      const gx   = s.x + s.nx * lat * side;
      const gy   = s.y + s.ny * lat * side;

      // 3 – 5 flowers per group
      const count = 3 + Math.floor(rng.next() * 3);

      // Generate radii first so we can compute the ring radius
      const radii:  number[] = [];
      const petals: number[] = [];
      const fAngle: number[] = [];
      for (let i = 0; i < count; i++) {
        radii .push(6 + rng.next() * 5);   // 6 – 11 world units
        petals.push(rng.next() < 0.5 ? 5 : 6);
        fAngle.push(rng.range(0, Math.PI * 2));
      }

      // Radius of the ring: large enough so adjacent flower edges don't touch.
      // For a regular N-gon: chord = 2·R·sin(π/N).
      // We need chord ≥ r[i] + r[(i+1)%N] + GAP for every adjacent pair.
      let maxPair = 0;
      for (let i = 0; i < count; i++) {
        maxPair = Math.max(maxPair, radii[i] + radii[(i + 1) % count] + FLOWER_GAP);
      }
      const R = count === 1 ? 0 : maxPair / (2 * Math.sin(Math.PI / count));

      const startAngle = rng.range(0, Math.PI * 2);
      for (let i = 0; i < count; i++) {
        const a = startAngle + (i / count) * Math.PI * 2;
        this.flowers.push({
          wx:     gx + Math.cos(a) * R,
          wy:     gy + Math.sin(a) * R,
          radius: radii[i],
          petals: petals[i],
          angle:  fAngle[i],
        });
      }
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  render(
    ctx: CanvasRenderingContext2D,
    camX: number, camY: number,
    W: number, H: number,
  ): void {
    if (this.flowers.length === 0) return;

    const scx = (wx: number) => wx - camX + W * 0.5;
    const scy = (wy: number) => camY - wy + H * 0.5;

    // Cull to screen
    const PAD = 40;
    const vis = this.flowers.filter(f => {
      const sx = scx(f.wx), sy = scy(f.wy);
      return sx > -PAD && sx < W + PAD && sy > -PAD && sy < H + PAD;
    });
    if (vis.length === 0) return;

    // ── Shadows (batched under one filter state) ────────────────────────────
    ctx.save();
    ctx.filter = 'blur(4px)';
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    for (const f of vis) {
      const sx = scx(f.wx) + 3;
      const sy = scy(f.wy) + 5;
      ctx.beginPath();
      ctx.ellipse(sx, sy, f.radius * 1.1, f.radius * 0.68, 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ── Flowers ─────────────────────────────────────────────────────────────
    for (const f of vis) {
      const sx = scx(f.wx);
      const sy = scy(f.wy);

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(f.angle);

      // Petals – white ellipses arranged radially
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < f.petals; i++) {
        const a  = (i / f.petals) * Math.PI * 2;
        const px = Math.cos(a) * f.radius * 0.52;
        const py = Math.sin(a) * f.radius * 0.52;
        ctx.beginPath();
        ctx.ellipse(px, py, f.radius * 0.44, f.radius * 0.30, a, 0, Math.PI * 2);
        ctx.fill();
      }

      // Center – yellow circle
      ctx.fillStyle = '#f5ca00';
      ctx.beginPath();
      ctx.arc(0, 0, f.radius * 0.29, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  clear(): void { this.flowers = []; }
}
