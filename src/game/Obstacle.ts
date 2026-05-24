import { Rng } from '../utils/math';
import type { Track } from './Track';

// ─── Constants ────────────────────────────────────────────────────────────────

const SHADOW_DX = 5;
const SHADOW_DY = 6;

// ─── Types ────────────────────────────────────────────────────────────────────

export type ObstacleKind = 'haybale' | 'tire';

export interface Obstacle {
  wx: number; wy: number;   // world position
  kind: ObstacleKind;
  radius: number;
  dist: number;             // track arc-length — used for zone filtering
}

// ─── Placement ────────────────────────────────────────────────────────────────

/**
 * Scatter hay bales and tires on the road surface.
 * Avoids the start zone (first 450 u) and finish zone (last 380 u).
 * Lateral offset: 28–95 world units from centerline so the player can dodge.
 */
export function placeObstacles(track: Track, seed: number): Obstacle[] {
  const rng    = new Rng(seed);
  const result: Obstacle[] = [];

  const startAt = 450;
  const endAt   = track.finishDist - 380;
  let   nextAt  = startAt;

  for (const s of track.samples) {
    if (s.dist < nextAt || s.dist > endAt) continue;
    nextAt = s.dist + 255 + rng.range(-40, 40);

    const side    = rng.next() > 0.5 ? 1 : -1;
    const lateral = side * rng.range(28, 95);
    const kind: ObstacleKind = rng.next() > 0.38 ? 'haybale' : 'tire';

    result.push({
      wx:     s.x + s.nx * lateral,
      wy:     s.y + s.ny * lateral,
      kind,
      radius: kind === 'haybale' ? 20 : 14,
      dist:   s.dist,
    });
  }

  return result;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

/**
 * Draw a single obstacle at screen position (sx, sy).
 * Objects have a small flat shadow; no outlines.
 */
export function renderObstacle(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,
  obs: Obstacle,
): void {
  if (obs.kind === 'haybale') {
    drawHayBale(ctx, sx, sy, obs.radius);
  } else {
    drawTire(ctx, sx, sy, obs.radius);
  }
}

function drawHayBale(ctx: CanvasRenderingContext2D, bx: number, by: number, r: number): void {
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.beginPath();
  ctx.arc(bx + SHADOW_DX, by + SHADOW_DY, r, 0, Math.PI * 2);
  ctx.fill();

  // Body — no outline
  ctx.fillStyle = '#d4a017';
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.fill();

  // Binding detail lines (internal, not an outline)
  const dr = r * 0.6;
  ctx.strokeStyle = '#b08010';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(bx - dr, by); ctx.lineTo(bx + dr, by);
  ctx.moveTo(bx, by - dr); ctx.lineTo(bx, by + dr);
  ctx.stroke();
}

function drawTire(ctx: CanvasRenderingContext2D, bx: number, by: number, r: number): void {
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.beginPath();
  ctx.arc(bx + SHADOW_DX, by + SHADOW_DY, r, 0, Math.PI * 2);
  ctx.fill();

  // Outer rubber — no outline
  ctx.fillStyle = '#252525';
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.fill();

  // Rim
  ctx.fillStyle = '#4a4a4a';
  ctx.beginPath();
  ctx.arc(bx, by, r * 0.52, 0, Math.PI * 2);
  ctx.fill();

  // Center hole
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(bx, by, r * 0.26, 0, Math.PI * 2);
  ctx.fill();
}
