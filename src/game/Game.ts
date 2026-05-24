import { InputHandler } from '../utils/InputHandler';
import { Track } from './Track';
import { Car, CAR_RADIUS } from './Car';
import { placeObstacles, renderObstacle } from './Obstacle';
import { ParticleSystem } from './ParticleSystem';
import type { Obstacle } from './Obstacle';

export type GameState = 'menu' | 'race' | 'crash' | 'finish' | 'highscores';

const TARGET_W = 1280;
const TARGET_H = 720;
const FIXED_DT = 1 / 60;  // 60 Hz physics tick
const CAM_AHEAD = 180;      // world units camera looks ahead of car

/**
 * Core game loop and state machine.
 * Owns the canvas, clock, camera, and all sub-systems.
 */
export class Game {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly input: InputHandler;

  private state: GameState = 'menu';
  private running = false;

  // Sub-systems (initialised in initRace, always valid after first call)
  private track!: Track;
  private car!: Car;
  private obstacles: Obstacle[] = [];
  private particles = new ParticleSystem();

  // Camera (world coordinates of screen centre)
  private camX = 0;
  private camY = 0;

  // Crash feedback
  private crashFlash = 0;  // 0–1, fades after collision
  private crashPopup = 0;  // seconds remaining for "−3s" label

  // Frame timing
  private lastTimestamp = 0;
  private accumulator = 0;

  // Dev overlay
  private fps = 0;
  private frameCount = 0;
  private fpsTimer = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context');
    this.ctx = ctx;
    this.input = new InputHandler();

    this.initRace();   // pre-generate track so it's ready on first start
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  /** (Re-)create track, car and obstacles. Called on first load and "race again". */
  private initRace(): void {
    this.track = new Track();
    this.car = new Car(this.track);
    this.obstacles = placeObstacles(this.track, 0xA5C3);
    this.particles.clear();
    this.crashFlash = 0;
    this.crashPopup = 0;
    const s = this.track.getSampleAtDist(0);
    this.camX = s.x;
    this.camY = s.y + CAM_AHEAD;
  }

  // ─── Sizing ────────────────────────────────────────────────────────────────

  private resize(): void {
    const scale = Math.min(window.innerWidth / TARGET_W, window.innerHeight / TARGET_H);
    this.canvas.width = TARGET_W;
    this.canvas.height = TARGET_H;
    this.canvas.style.width = `${TARGET_W * scale}px`;
    this.canvas.style.height = `${TARGET_H * scale}px`;
  }

  // ─── Loop ──────────────────────────────────────────────────────────────────

  start(): void {
    this.running = true;
    requestAnimationFrame((t) => this.loop(t));
  }

  private loop(timestamp: number): void {
    if (!this.running) return;

    const rawDt = Math.min((timestamp - this.lastTimestamp) / 1000, 0.1);
    this.lastTimestamp = timestamp;

    this.frameCount++;
    this.fpsTimer += rawDt;
    if (this.fpsTimer >= 1) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsTimer -= 1;
    }

    this.accumulator += rawDt;
    while (this.accumulator >= FIXED_DT) {
      this.update(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }

    this.render();
    this.input.flush();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  private update(dt: number): void {
    switch (this.state) {
      case 'menu': this.updateMenu(dt); break;
      case 'race': this.updateRace(dt); break;
      case 'finish': this.updateFinish(dt); break;
    }
  }

  private updateMenu(_dt: number): void {
    if (this.input.wasPressed('Space') || this.input.wasPressed('Enter')) {
      this.initRace();
      this.setState('race');
    }
  }

  private updateRace(dt: number): void {
    if (this.input.wasPressed('Escape')) {
      this.setState('menu');
      return;
    }

    this.car.update(dt, this.input.steerAxis, this.track);

    // Clamp car at finish
    if (this.car.dist >= this.track.finishDist) {
      this.car.dist = this.track.finishDist;
      this.setState('finish');
      return;
    }

    // ── Collision: obstacles ─────────────────────────────────────────────────
    if (this.car.frozen <= 0) {
      for (const obs of this.obstacles) {
        const dx = this.car.worldX - obs.wx;
        const dy = this.car.worldY - obs.wy;
        if (Math.hypot(dx, dy) < CAR_RADIUS + obs.radius) {
          this.triggerCrash();
          break; // one collision per tick
        }
      }
    }

    // ── Collision: road borders ──────────────────────────────────────────────
    if (this.car.frozen <= 0) {
      const s = this.track.getSampleAtDist(this.car.dist);
      if (Math.abs(this.car.lateralOffset) > s.halfWidth - CAR_RADIUS) {
        this.triggerCrash();
      }
    }

    // ── Crash feedback decay ─────────────────────────────────────────────────
    this.crashFlash = Math.max(0, this.crashFlash - dt * 2.8);
    this.crashPopup = Math.max(0, this.crashPopup - dt);

    // ── Particle trail ───────────────────────────────────────────────────────
    const speed = this.car.speed;
    if (speed > 60 && this.car.frozen <= 0) {
      const fwdX = Math.sin(this.car.angle);
      const fwdY = -Math.cos(this.car.angle);
      this.particles.emit(this.car.worldX, this.car.worldY, fwdX, fwdY, speed);
    }
    this.particles.update(dt);

    // Camera: direct follow with look-ahead so more track is visible ahead
    this.camX = this.car.worldX;
    this.camY = this.car.worldY + CAM_AHEAD;
  }

  private triggerCrash(): void {
    this.car.onCollision(this.track);
    this.crashFlash = 1.0;
    this.crashPopup = 0.9;
  }

  private updateFinish(_dt: number): void {
    if (this.input.wasPressed('Space') || this.input.wasPressed('Enter')) {
      this.initRace();
      this.setState('race');
    }
    if (this.input.wasPressed('Escape')) {
      this.setState('menu');
    }
  }

  private setState(next: GameState): void {
    this.state = next;
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  private render(): void {
    const { ctx, canvas } = this;

    // Base clear
    ctx.fillStyle = '#f5f2eb';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    switch (this.state) {
      case 'menu': this.renderMenu(); break;
      case 'race': this.renderRace(); break;
      case 'finish': this.renderFinish(); break;
    }

    this.renderHUD();
  }

  // ── Menu ───────────────────────────────────────────────────────────────────

  private renderMenu(): void {
    const { ctx, canvas } = this;
    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;

    ctx.save();
    ctx.textAlign = 'center';

    ctx.font = '800 76px "Open Sans", sans-serif';
    ctx.fillStyle = '#111111';
    ctx.fillText('SEIFENKISTEN RENNEN', cx, cy - 70);

    ctx.font = '700 30px "Open Sans", sans-serif';
    ctx.fillStyle = '#555550';
    ctx.fillText('TIME DRIFT', cx, cy - 26);

    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 200, cy + 4);
    ctx.lineTo(cx + 200, cy + 4);
    ctx.stroke();

    const btnW = 340, btnH = 52;
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.roundRect(cx - btnW / 2, cy + 24, btnW, btnH, 6);
    ctx.fill();
    ctx.font = '700 22px "Open Sans", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('SPACE · ENTER — Start', cx, cy + 58);

    ctx.font = '400 16px "Open Sans", sans-serif';
    ctx.fillStyle = '#888880';
    ctx.fillText('Steuerung: ← → oder A D', cx, cy + 118);

    ctx.restore();
  }

  // ── Race ───────────────────────────────────────────────────────────────────

  private renderRace(): void {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;

    // ── Grass background (full screen) ───────────────────────────────────────
    ctx.fillStyle = '#3e753b';
    ctx.fillRect(0, 0, W, H);

    // ── Track (road + borders + bales + start/finish) ─────────────────────────
    this.track.render(ctx, this.camX, this.camY, W, H);

    // ── Road obstacles ────────────────────────────────────────────────────────
    const cullY = H * 0.6 + 80;
    for (const obs of this.obstacles) {
      const sx = obs.wx - this.camX + W * 0.5;
      const sy = this.camY - obs.wy + H * 0.5;

      if (sy < -cullY || sy > H + cullY || sx < -100 || sx > W + 100) continue;
      renderObstacle(ctx, sx, sy, obs);
    }

    // ── Particle trail ────────────────────────────────────────────────────────
    this.particles.render(ctx, this.camX, this.camY, W, H);

    // ── Car ───────────────────────────────────────────────────────────────────
    this.car.render(ctx, this.camX, this.camY, W, H);

    // ── Speed lines ───────────────────────────────────────────────────────────
    this.renderSpeedLines(W, H);

    // ── Crash flash overlay ───────────────────────────────────────────────────
    if (this.crashFlash > 0) {
      ctx.fillStyle = `rgba(210,30,30,${(this.crashFlash * 0.30).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }

    // ── "−3s" popup ───────────────────────────────────────────────────────────
    if (this.crashPopup > 0) {
      const alpha = Math.min(1, this.crashPopup * 5);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '800 52px "Open Sans", sans-serif';
      ctx.fillStyle = `rgba(200,20,20,${alpha.toFixed(3)})`;
      ctx.fillText('−3s', W * 0.5, H * 0.33);
      ctx.restore();
    }

    // ── ESC hint ──────────────────────────────────────────────────────────────
    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = '400 14px "Open Sans", sans-serif';
    ctx.fillStyle = '#111111';
    ctx.fillText('[ESC] Menü', W - 14, H - 14);
    ctx.restore();
  }

  // ── Speed lines ────────────────────────────────────────────────────────────

  private renderSpeedLines(W: number, H: number): void {
    const speed = this.car.speed;
    const THRESHOLD = 160;
    if (speed <= THRESHOLD) return;

    const { ctx } = this;
    const intensity = Math.min(1, (speed - THRESHOLD) / 250);
    const numLines = Math.round(10 + intensity * 22);
    // Lines radiate from the car's screen position (Y flipped: car is near bottom)
    const carSY = H * 0.5 + CAM_AHEAD;  // car is always here
    const originX = W * 0.5;
    const originY = carSY;
    const minLen = 30 + intensity * 80;
    const maxLen = minLen * 1.9;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < numLines; i++) {
      const angle = (i / numLines) * Math.PI * 2;
      const len = minLen + Math.random() * (maxLen - minLen);
      const startR = 55 + Math.random() * 40;
      ctx.globalAlpha = (0.08 + intensity * 0.22) * (0.5 + Math.random() * 0.5);
      ctx.beginPath();
      ctx.moveTo(
        originX + Math.cos(angle) * startR,
        originY + Math.sin(angle) * startR,
      );
      ctx.lineTo(
        originX + Math.cos(angle) * (startR + len),
        originY + Math.sin(angle) * (startR + len),
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Finish ─────────────────────────────────────────────────────────────────

  private renderFinish(): void {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    const cx = W * 0.5, cy = H * 0.5;

    // Show track in background (frozen at finish position)
    ctx.fillStyle = '#3e753b';
    ctx.fillRect(0, 0, W, H);
    this.track.render(ctx, this.camX, this.camY, W, H);
    this.car.render(ctx, this.camX, this.camY, W, H);

    // Overlay panel
    ctx.fillStyle = 'rgba(245,242,235,0.92)';
    ctx.beginPath();
    ctx.roundRect(cx - 260, cy - 110, 520, 220, 8);
    ctx.fill();
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.save();
    ctx.textAlign = 'center';

    ctx.font = '800 52px "Open Sans", sans-serif';
    ctx.fillStyle = '#111111';
    ctx.fillText('ZIEL ERREICHT!', cx, cy - 34);

    ctx.font = '400 18px "Open Sans", sans-serif';
    ctx.fillStyle = '#555550';
    ctx.fillText('Temporaler Checkpoint erreicht.', cx, cy + 10);

    const btnW = 300, btnH = 48;
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.roundRect(cx - btnW / 2, cy + 34, btnW, btnH, 6);
    ctx.fill();
    ctx.font = '700 20px "Open Sans", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('SPACE — Nochmal', cx, cy + 64);

    ctx.restore();
  }

  // ── HUD ────────────────────────────────────────────────────────────────────

  private renderHUD(): void {
    const { ctx } = this;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = '400 13px "Open Sans", sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillText(`${this.fps} fps`, 10, 20);

    if (this.state === 'race') {
      const kmh = Math.round(this.car.speed * 0.18); // u/s → rough km/h
      ctx.font = '700 16px "Open Sans", sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillText(`${kmh} km/h`, 10, 42);
    }

    ctx.restore();
  }
}
