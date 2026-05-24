import { InputHandler } from '../utils/InputHandler';

export type GameState = 'menu' | 'race' | 'crash' | 'finish' | 'highscores';

const TARGET_W = 1280;
const TARGET_H = 720;
const FIXED_DT = 1 / 60; // 60 Hz physics tick

/**
 * Core game loop and state machine.
 * Owns the canvas, the clock, and all sub-systems.
 */
export class Game {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly input: InputHandler;

  private state: GameState = 'menu';
  private running = false;

  // Frame timing
  private lastTimestamp = 0;
  private accumulator = 0;

  // Debug overlay
  private fps = 0;
  private frameCount = 0;
  private fpsTimer = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context');
    this.ctx = ctx;
    this.input = new InputHandler();

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // ─── Sizing ────────────────────────────────────────────────────────────────

  private resize(): void {
    const scaleX = window.innerWidth / TARGET_W;
    const scaleY = window.innerHeight / TARGET_H;
    const scale = Math.min(scaleX, scaleY);

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

    const rawDt = Math.min((timestamp - this.lastTimestamp) / 1000, 0.1); // cap at 100ms
    this.lastTimestamp = timestamp;

    // FPS counter
    this.frameCount++;
    this.fpsTimer += rawDt;
    if (this.fpsTimer >= 1) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsTimer -= 1;
    }

    // Fixed-timestep accumulator
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
      case 'menu':
        this.updateMenu(dt);
        break;
      case 'race':
        this.updateRace(dt);
        break;
    }
  }

  private updateMenu(_dt: number): void {
    if (this.input.wasPressed('Space') || this.input.wasPressed('Enter')) {
      this.setState('race');
    }
  }

  private updateRace(_dt: number): void {
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

    // Clear — warm off-white base
    ctx.fillStyle = '#f5f2eb';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    switch (this.state) {
      case 'menu':
        this.renderMenu();
        break;
      case 'race':
        this.renderRace();
        break;
    }

    this.renderHUD();
  }

  private renderMenu(): void {
    const { ctx, canvas } = this;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    ctx.save();
    ctx.textAlign = 'center';

    // Title — large, bold, black on light background
    ctx.font = '800 76px "Open Sans", sans-serif';
    ctx.fillStyle = '#111111';
    ctx.fillText('SEIFENKISTEN RENNEN', cx, cy - 70);

    // Subtitle — smaller, muted
    ctx.font = '700 30px "Open Sans", sans-serif';
    ctx.fillStyle = '#555550';
    ctx.fillText('TIME DRIFT', cx, cy - 26);

    // Divider
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 200, cy + 4);
    ctx.lineTo(cx + 200, cy + 4);
    ctx.stroke();

    // Start hint — pill button look
    const btnW = 340;
    const btnH = 52;
    const btnX = cx - btnW / 2;
    const btnY = cy + 24;
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.roundRect(btnX, btnY, btnW, btnH, 6);
    ctx.fill();
    ctx.font = '700 22px "Open Sans", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('SPACE · ENTER — Start', cx, btnY + 34);

    // Controls hint
    ctx.font = '400 16px "Open Sans", sans-serif';
    ctx.fillStyle = '#888880';
    ctx.fillText('Steuerung: ← → oder A D', cx, cy + 118);

    ctx.restore();
  }

  private renderRace(): void {
    const { ctx, canvas } = this;
    const cx = canvas.width / 2;

    // Flat grass — bright comic green
    ctx.fillStyle = '#6abf3a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Road — mid gray with hard edges (comic flat)
    const roadLeft = cx - 200;
    const roadW = 400;
    ctx.fillStyle = '#b0aead';
    ctx.fillRect(roadLeft, 0, roadW, canvas.height);

    // Road border stripes — black, crisp
    ctx.fillStyle = '#111111';
    ctx.fillRect(roadLeft - 6, 0, 6, canvas.height);
    ctx.fillRect(roadLeft + roadW, 0, 6, canvas.height);

    // Center dashes — white
    ctx.setLineDash([40, 30]);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);

    // Placeholder car — flat comic shapes with outline
    ctx.save();
    ctx.translate(cx, canvas.height / 2);

    // Body
    ctx.fillStyle = '#e63030';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.rect(-20, -35, 40, 70);
    ctx.fill();
    ctx.stroke();

    // Wheels
    ctx.fillStyle = '#222222';
    const wheels = [[-24, -30], [14, -30], [-24, 12], [14, 12]] as const;
    for (const [wx, wy] of wheels) {
      ctx.beginPath();
      ctx.rect(wx, wy, 10, 18);
      ctx.fill();
    }
    ctx.restore();

    // ESC hint — black on grass strip
    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = '#111111';
    ctx.font = '400 14px "Open Sans", sans-serif';
    ctx.fillText('[ESC] Menü', canvas.width - 14, canvas.height - 14);
    ctx.restore();
  }

  private renderHUD(): void {
    const { ctx } = this;
    // FPS counter — dev overlay, small, black
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.font = '400 13px "Open Sans", sans-serif';
    ctx.fillText(`${this.fps} fps`, 10, 20);
    ctx.restore();
  }
}
