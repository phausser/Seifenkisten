// ─── Types ────────────────────────────────────────────────────────────────────

interface Particle {
  x: number;   // world position
  y: number;
  vx: number;  // world velocity
  vy: number;
  life: number;     // seconds remaining
  maxLife: number;
  size: number;     // initial radius
  alpha: number;
}

// ─── ParticleSystem ──────────────────────────────────────────────────────────

/**
 * Manages the dust trail behind the car.
 *
 * Particles are kept in world space so they drift correctly as the
 * camera scrolls.  The emit rate is driven by the car's speed so the
 * trail appears at speed and stays subtle.
 */
export class ParticleSystem {
  private readonly particles: Particle[] = [];

  // ── API ─────────────────────────────────────────────────────────────────────

  /**
   * Emit one burst of particles at world position (cx, cy).
   * @param cx     world X of emission point
   * @param cy     world Y of emission point
   * @param fwdX   forward-X of car (used to push particles backward)
   * @param fwdY   forward-Y of car
   * @param speed  car speed (u/s) – controls emission velocity
   */
  emit(
    cx: number, cy: number,
    fwdX: number, fwdY: number,
    speed: number,
  ): void {
    const count = Math.random() < 0.55 ? 1 : 0;
    for (let i = 0; i < count; i++) {
      const spread  = 16 + Math.random() * 12;
      const lifetime = 0.42 + Math.random() * 0.28;
      this.particles.push({
        // Offset backward + slight random spread
        x: cx - fwdX * 24 + (Math.random() - 0.5) * spread,
        y: cy - fwdY * 24 + (Math.random() - 0.5) * spread,
        // Slow drift opposite travel direction
        vx: -fwdX * speed * 0.045 + (Math.random() - 0.5) * 16,
        vy: -fwdY * speed * 0.045 + (Math.random() - 0.5) * 16,
        life:    lifetime,
        maxLife: lifetime,
        size:    3 + Math.random() * 4,
        alpha:   0.16 + Math.random() * 0.10,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    camX: number, camY: number,
    W: number, H: number,
  ): void {
    ctx.save();
    for (const p of this.particles) {
      const t  = p.life / p.maxLife;         // 1 = fresh → 0 = faded
      const sx =  p.x - camX + W * 0.5;
      const sy = camY - p.y + H * 0.5;       // Y flipped
      const r  = p.size * (0.75 + 0.45 * (1 - t));

      ctx.globalAlpha = t * p.alpha;
      ctx.fillStyle = '#9b7a4a';
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  clear(): void {
    this.particles.length = 0;
  }

  get count(): number { return this.particles.length; }
}
