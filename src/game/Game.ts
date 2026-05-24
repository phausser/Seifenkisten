import { InputHandler } from '../utils/InputHandler';
import { Track }        from './Track';
import { Car }          from './Car';

export type GameState = 'menu' | 'race' | 'crash' | 'finish' | 'highscores';

const TARGET_W      = 1280;
const TARGET_H      = 720;
const FIXED_DT      = 1 / 60;  // 60 Hz physics tick
const CAM_AHEAD     = 120;      // world units camera looks ahead of car

/**
 * Core game loop and state machine.
 * Owns the canvas, clock, camera, and all sub-systems.
 */
export class Game {
  readonly canvas: HTMLCanvasElement;
  readonly ctx:    CanvasRenderingContext2D;
  readonly input:  InputHandler;

  private state: GameState = 'menu';
  private running = false;

  // Sub-systems (initialised in initRace, always valid after first call)
  private track!: Track;
  private car!:   Car;

  // Camera (world coordinates of screen centre)
  private camX = 0;
  private camY = 0;

  // Frame timing
  private lastTimestamp = 0;
  private accumulator   = 0;

  // Dev overlay
  private fps        = 0;
  private frameCount = 0;
  private fpsTimer   = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context');
    this.ctx   = ctx;
    this.input = new InputHandler();

    this.initRace();   // pre-generate track so it's ready on first start
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  /** (Re-)create track and car. Called on first load and on "race again". */
  private initRace(): void {
    this.track = new Track();
    this.car   = new Car(this.track);
    const s    = this.track.getSampleAtDist(0);
    this.camX  = s.x;
    this.camY  = s.y + CAM_AHEAD;
  }

  // ─── Sizing ────────────────────────────────────────────────────────────────

  private resize(): void {
    const scale = Math.min(window.innerWidth / TARGET_W, window.innerHeight / TARGET_H);
    this.canvas.width  = TARGET_W;
    this.canvas.height = TARGET_H;
    this.canvas.style.width  = `${TARGET_W * scale}px`;
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
      case 'menu':   this.updateMenu(dt);   break;
      case 'race':   this.updateRace(dt);   break;
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

    this.car.update(dt, this.track);

    // Clamp car at finish
    if (this.car.dist >= this.track.finishDist) {
      this.car.dist = this.track.finishDist;
      this.setState('finish');
      return;
    }

    // Camera: direct follow with look-ahead so more track is visible ahead
    this.camX = this.car.worldX;
    this.camY = this.car.worldY + CAM_AHEAD;
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
      case 'menu':   this.renderMenu();   break;
      case 'race':   this.renderRace();   break;
      case 'finish': this.renderFinish(); break;
    }

    this.renderHUD();
  }

  // ── Menu ───────────────────────────────────────────────────────────────────

  private renderMenu(): void {
    const { ctx, canvas } = this;
    const cx = canvas.width  * 0.5;
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

    // Grass background
    ctx.fillStyle = '#6abf3a';
    ctx.fillRect(0, 0, W, H);

    // Track (road + borders + dashes + bales + start/finish)
    this.track.render(ctx, this.camX, this.camY, W, H);

    // Car
    this.car.render(ctx, this.camX, this.camY, W, H);

    // ESC hint
    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = '400 14px "Open Sans", sans-serif';
    ctx.fillStyle = '#111111';
    ctx.fillText('[ESC] Menü', W - 14, H - 14);
    ctx.restore();
  }

  // ── Finish ─────────────────────────────────────────────────────────────────

  private renderFinish(): void {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    const cx = W * 0.5, cy = H * 0.5;

    // Show track in background (frozen at finish position)
    ctx.fillStyle = '#6abf3a';
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
    ctx.restore();
  }
}
