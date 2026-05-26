import { Rng } from '../utils/math';
import type { Track } from './Track';

// ─── Constants ────────────────────────────────────────────────────────────────

const SHADOW_DX = 5;
const SHADOW_DY = 6;
const SHADOW_COLOR = 'rgba(0,0,0,0.50)';
const SHADOW_BLUR = 10;
const HAY_LIGHT = '#b48420';
const HAY_DARK = '#bc8d24';
const HAY_GRID = 4;   // cells per side of the checkerboard

// ─── Types ────────────────────────────────────────────────────────────────────

export type ObstacleKind = 'haybale' | 'tire';

export interface Obstacle {
  wx: number; wy: number;   // world position
  kind: ObstacleKind;
  radius: number;
  dist: number;             // track arc-length — used for zone filtering
  angle: number;
}

// ─── Placement ────────────────────────────────────────────────────────────────

/**
 * Scatter hay bales and tires on the road surface.
 * Avoids the start zone (first 450 u) and finish zone (last 380 u).
 * Lateral offset: 28–95 world units from centerline so the player can dodge.
 */
export function placeObstacles(track: Track, seed: number): Obstacle[] {
  const rng = new Rng(seed);
  const result: Obstacle[] = [];

  const startAt = 450;
  const endAt = track.finishDist - 380;
  let nextAt = startAt;

  for (const s of track.samples) {
    if (s.dist < nextAt || s.dist > endAt) continue;
    nextAt = s.dist + 255 + rng.range(-40, 40);

    const side = rng.next() > 0.5 ? 1 : -1;
    const lateral = side * rng.range(28, 95);
    const kind: ObstacleKind = rng.next() > 0.38 ? 'haybale' : 'tire';

    result.push({
      wx: s.x + s.nx * lateral,
      wy: s.y + s.ny * lateral,
      kind,
      radius: kind === 'haybale' ? 20 : 14,
      dist: s.dist,
      angle: kind === 'haybale' ? rng.range(0, Math.PI * 2) : 0,
    });
  }

  return result;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

/**
 * Draw a single obstacle at screen position (sx, sy).
 */
export function renderObstacle(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,
  obs: Obstacle,
): void {
  if (obs.kind === 'haybale') {
    // Pass world coords so straw seed is stable regardless of camera position.
    drawHayBale(ctx, sx, sy, obs.radius, obs.angle, obs.wx, obs.wy);
  } else {
    drawTire(ctx, sx, sy, obs.radius);
  }
}

/**
 * Draw a hay bale at screen position (bx, by).
 * worldX/worldY are used as the straw-pattern seed so the decoration stays
 * stable as the camera scrolls.
 * Exported so Track can reuse it for border bales.
 */
export function drawHayBale(
  ctx: CanvasRenderingContext2D,
  bx: number, by: number,
  r: number,
  angle: number,
  _worldX: number, _worldY: number,
): void {
  const size = r * 1.65;
  const corner = 5;
  const half = size * 0.5;
  const cell = size / HAY_GRID;

  // Shadow
  ctx.save();
  ctx.translate(bx + SHADOW_DX, by + SHADOW_DY);
  ctx.rotate(angle);
  ctx.fillStyle = SHADOW_COLOR;
  ctx.filter = `blur(${SHADOW_BLUR}px)`;
  ctx.beginPath();
  ctx.roundRect(-half, -half, size, size, corner);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(angle);

  // Clip to rounded-rect outline
  ctx.beginPath();
  ctx.roundRect(-half, -half, size, size, corner);
  ctx.clip();

  // Checkerboard: HAY_GRID × HAY_GRID alternating light/dark squares
  for (let row = 0; row < HAY_GRID; row++) {
    for (let col = 0; col < HAY_GRID; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? HAY_LIGHT : HAY_DARK;
      ctx.fillRect(-half + col * cell, -half + row * cell, cell, cell);
    }
  }

  ctx.restore();
}

function drawTire(
  ctx: CanvasRenderingContext2D,
  bx: number, by: number,
  r: number,
): void {
  // Shadow
  ctx.save();
  ctx.fillStyle = SHADOW_COLOR;
  ctx.filter = `blur(${SHADOW_BLUR}px)`;
  ctx.beginPath();
  ctx.arc(bx + SHADOW_DX, by + SHADOW_DY, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Outer rubber
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
