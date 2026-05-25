import { InputHandler } from '../utils/InputHandler';
import { Track } from './Track';
import { Car, CAR_RADIUS } from './Car';
import { placeObstacles, renderObstacle } from './Obstacle';
import { ParticleSystem } from './ParticleSystem';
import { AudioSystem } from './AudioSystem';
import type { Obstacle } from './Obstacle';

export type GameState = 'menu' | 'countdown' | 'race' | 'finish' | 'highscores';

const TARGET_W = 1280;
const TARGET_H = 720;
const FIXED_DT = 1 / 60;  // 60 Hz physics tick
const CAM_AHEAD = 180;      // world units camera looks ahead of car
const PENALTY_SECONDS = 3;
const HIGHSCORE_KEY = 'seifenkisten.highscores.v1';
const MAX_HIGHSCORES = 5;
const RIPPLE_DURATION = 0.48;

interface HighScoreEntry {
  name: string;
  time: number;
  date: string;
}

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
  private audio = new AudioSystem();

  // Camera (world coordinates of screen centre)
  private camX = 0;
  private camY = 0;

  // Crash feedback
  private crashFlash = 0;  // 0–1, fades after collision
  private crashPopup = 0;  // seconds remaining for "+3s" label
  private rippleTime = 0;

  // Race systems
  private raceTime = 0;
  private finishTime = 0;
  private countdownTime = 3;
  private countdownBeep = 3;
  private highScores: HighScoreEntry[] = [];
  private pendingHighScoreRank: number | null = null;
  private pendingName = '';

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
    this.input.attachTouchTarget(canvas);
    this.highScores = this.loadHighScores();

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
    this.rippleTime = 0;
    this.raceTime = 0;
    this.finishTime = 0;
    this.countdownTime = 3;
    this.countdownBeep = 3;
    this.pendingHighScoreRank = null;
    this.pendingName = '';
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
      case 'countdown': this.updateCountdown(dt); break;
      case 'race': this.updateRace(dt); break;
      case 'finish': this.updateFinish(dt); break;
      case 'highscores': this.updateHighScores(dt); break;
    }
  }

  private updateMenu(_dt: number): void {
    if (this.input.wasPressed('Space') || this.input.wasPressed('Enter') || this.input.wasTouchPressed) {
      this.audio.resume();
      this.initRace();
      this.setState('countdown');
      this.audio.start();
    }
    if (this.input.wasPressed('KeyH')) {
      this.setState('highscores');
    }
  }

  private updateCountdown(dt: number): void {
    if (this.input.wasPressed('Escape')) {
      this.setState('menu');
      return;
    }
    this.countdownTime -= dt;
    const nextBeep = Math.ceil(this.countdownTime);
    if (nextBeep > 0 && nextBeep < this.countdownBeep) {
      this.countdownBeep = nextBeep;
      this.audio.countdown();
    }
    if (this.countdownTime <= 0) {
      this.setState('race');
    }
  }

  private updateRace(dt: number): void {
    if (this.input.wasPressed('Escape')) {
      this.setState('menu');
      return;
    }

    this.raceTime += dt;
    this.car.update(dt, this.input.steerAxis, this.input.brakeAxis, this.track);

    // Clamp car at finish
    if (this.car.dist >= this.track.finishDist) {
      this.car.dist = this.track.finishDist;
      this.finishRace();
      this.setState('finish');
      this.audio.finish();
      return;
    }

    // ── Collision: obstacles ─────────────────────────────────────────────────
    if (this.car.frozen <= 0) {
      for (const obs of this.obstacles) {
        const dx = this.car.worldX - obs.wx;
        const dy = this.car.worldY - obs.wy;
        const dist = Math.hypot(dx, dy);
        const minDist = CAR_RADIUS + obs.radius;
        if (dist < minDist) {
          const normal = this.obstacleNormal(dx, dy, dist);
          this.triggerObstacleCrash(normal.nx, normal.ny, minDist - dist + 8);
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
    this.rippleTime = Math.max(0, this.rippleTime - dt);

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
    this.raceTime += PENALTY_SECONDS;
    this.crashFlash = 1.0;
    this.crashPopup = 0.9;
    this.rippleTime = RIPPLE_DURATION;
    this.audio.crash();
  }

  private triggerObstacleCrash(nx: number, ny: number, pushOut: number): void {
    this.car.onObstacleCollision(this.track, nx, ny, pushOut);
    this.raceTime += PENALTY_SECONDS;
    this.crashFlash = 1.0;
    this.crashPopup = 0.9;
    this.rippleTime = RIPPLE_DURATION;
    this.audio.crash();
  }

  private obstacleNormal(dx: number, dy: number, dist: number): { nx: number; ny: number } {
    if (dist > 0.0001) {
      return { nx: dx / dist, ny: dy / dist };
    }

    const s = this.track.getSampleAtDist(this.car.dist);
    const side = this.car.lateralOffset >= 0 ? 1 : -1;
    return { nx: s.nx * side, ny: s.ny * side };
  }

  private updateFinish(_dt: number): void {
    if (this.pendingHighScoreRank !== null) {
      this.updateNameEntry();
      return;
    }
    if (this.input.wasPressed('Space') || this.input.wasPressed('Enter') || this.input.wasTouchPressed) {
      this.audio.resume();
      this.initRace();
      this.setState('countdown');
      this.audio.start();
    }
    if (this.input.wasPressed('Escape')) {
      this.setState('menu');
    }
    if (this.input.wasPressed('KeyH')) {
      this.setState('highscores');
    }
  }

  private updateHighScores(_dt: number): void {
    if (
      this.input.wasPressed('Escape') ||
      this.input.wasPressed('Space') ||
      this.input.wasPressed('Enter') ||
      this.input.wasTouchPressed
    ) {
      this.setState('menu');
    }
  }

  private setState(next: GameState): void {
    this.state = next;
  }

  private finishRace(): void {
    this.finishTime = this.raceTime;
    const rank = this.getHighScoreRank(this.finishTime);
    if (rank !== null) {
      this.pendingHighScoreRank = rank;
      this.pendingName = '';
    }
  }

  private updateNameEntry(): void {
    for (const code of this.input.pressedCodes) {
      if (code === 'Backspace') {
        this.pendingName = this.pendingName.slice(0, -1);
        continue;
      }
      if (code === 'Enter') {
        this.commitPendingHighScore();
      }
    }

    for (const char of this.input.typedChars) {
      if (this.pendingName.length >= 3) break;
      this.pendingName += char;
    }
  }

  private commitPendingHighScore(): void {
    if (this.pendingHighScoreRank === null) return;
    const name = (this.pendingName || '---').slice(0, 3).toUpperCase();
    this.highScores.push({
      name,
      time: this.finishTime,
      date: new Date().toISOString(),
    });
    this.highScores.sort((a, b) => a.time - b.time);
    this.highScores = this.highScores.slice(0, MAX_HIGHSCORES);
    this.saveHighScores();
    this.pendingHighScoreRank = null;
    this.audio.save();
  }

  private getHighScoreRank(time: number): number | null {
    const rank = this.highScores.findIndex((score) => time < score.time);
    if (rank >= 0) return rank;
    return this.highScores.length < MAX_HIGHSCORES ? this.highScores.length : null;
  }

  private loadHighScores(): HighScoreEntry[] {
    try {
      const raw = localStorage.getItem(HIGHSCORE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as HighScoreEntry[];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((entry) => (
          typeof entry.name === 'string' &&
          typeof entry.time === 'number' &&
          typeof entry.date === 'string'
        ))
        .sort((a, b) => a.time - b.time)
        .slice(0, MAX_HIGHSCORES);
    } catch {
      return [];
    }
  }

  private saveHighScores(): void {
    try {
      localStorage.setItem(HIGHSCORE_KEY, JSON.stringify(this.highScores));
    } catch {
      // Ignore private-mode/quota failures; gameplay should continue.
    }
  }

  private formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds - minutes * 60;
    return `${minutes}:${rest.toFixed(2).padStart(5, '0')}`;
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  private render(): void {
    const { ctx, canvas } = this;

    // Base clear
    ctx.fillStyle = '#f5f2eb';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    switch (this.state) {
      case 'menu': this.renderMenu(); break;
      case 'countdown': this.renderCountdown(); break;
      case 'race': this.renderRace(); break;
      case 'finish': this.renderFinish(); break;
      case 'highscores': this.renderHighScores(); break;
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
    ctx.fillText('Steuerung: ← → oder A D · Bremse: ↓ oder S', cx, cy + 118);
    ctx.fillText('H — Bestzeiten', cx, cy + 144);

    ctx.restore();
  }

  // ── Race ───────────────────────────────────────────────────────────────────

  private renderCountdown(): void {
    this.renderRace();

    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    const label = this.countdownTime > 1
      ? String(Math.ceil(this.countdownTime))
      : 'LOS';

    ctx.save();
    ctx.fillStyle = 'rgba(245,242,235,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = '800 110px "Open Sans", sans-serif';
    ctx.fillStyle = '#111111';
    ctx.fillText(label, W * 0.5, H * 0.46);
    ctx.font = '700 22px "Open Sans", sans-serif';
    ctx.fillStyle = '#555550';
    ctx.fillText('Bereit machen', W * 0.5, H * 0.46 + 46);
    ctx.restore();
  }

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
    this.renderRipple(W, H);

    if (this.crashFlash > 0) {
      ctx.fillStyle = `rgba(210,30,30,${(this.crashFlash * 0.30).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }

    // ── "+3s" popup ───────────────────────────────────────────────────────────
    if (this.crashPopup > 0) {
      const alpha = Math.min(1, this.crashPopup * 5);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '800 52px "Open Sans", sans-serif';
      ctx.fillStyle = `rgba(200,20,20,${alpha.toFixed(3)})`;
      ctx.fillText('+3s', W * 0.5, H * 0.33);
      ctx.restore();
    }

    // ── ESC hint ──────────────────────────────────────────────────────────────
    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = '400 14px "Open Sans", sans-serif';
    ctx.fillStyle = '#111111';
    ctx.fillText('[ESC] Menü', W - 14, H - 14);
    ctx.restore();

    this.renderTouchHints(W, H);
  }

  private renderRipple(W: number, H: number): void {
    if (this.rippleTime <= 0) return;

    const t = 1 - this.rippleTime / RIPPLE_DURATION;
    const { ctx } = this;
    const cx = W * 0.5;
    const cy = H * 0.5 + CAM_AHEAD;
    const radius = 40 + t * 210;
    const alpha = (1 - t) * 0.42;

    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
    ctx.lineWidth = 5 + t * 10;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(17,17,17,${(alpha * 0.45).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private renderTouchHints(W: number, H: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.roundRect(18, H - 92, 96, 62, 8);
    ctx.roundRect(W - 114, H - 92, 96, 62, 8);
    ctx.roundRect(W * 0.5 - 58, H - 92, 116, 62, 8);
    ctx.fill();
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 30px "Open Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('←', 66, H - 51);
    ctx.fillText('↓', W * 0.5, H - 51);
    ctx.fillText('→', W - 66, H - 51);
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
      const phase = this.seededUnit(i, this.frameCount + this.fps * 13);
      const angle = (i / numLines) * Math.PI * 2 + phase * 0.08;
      const len = minLen + this.seededUnit(i, 7) * (maxLen - minLen);
      const startR = 55 + this.seededUnit(i, 11) * 40;
      ctx.globalAlpha = (0.08 + intensity * 0.22) * (0.5 + this.seededUnit(i, 17) * 0.5);
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

  private seededUnit(index: number, salt: number): number {
    const n = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
    return n - Math.floor(n);
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

    // Overlay panel — tall enough for name-entry flow
    ctx.fillStyle = 'rgba(245,242,235,0.92)';
    ctx.beginPath();
    ctx.roundRect(cx - 280, cy - 130, 560, 300, 8);
    ctx.fill();
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.save();
    ctx.textAlign = 'center';

    ctx.font = '800 52px "Open Sans", sans-serif';
    ctx.fillStyle = '#111111';
    ctx.fillText('ZIEL ERREICHT!', cx, cy - 70);

    // Current time
    ctx.font = '800 32px "Open Sans", sans-serif';
    ctx.fillStyle = '#111111';
    ctx.fillText(this.formatTime(this.finishTime), cx, cy - 26);

    // Best time (same font, grey)
    const best = this.highScores[0];
    ctx.font = '400 13px "Open Sans", sans-serif';
    ctx.fillStyle = '#888880';
    ctx.fillText('Bestzeit', cx, cy + 8);
    ctx.font = '800 32px "Open Sans", sans-serif';
    ctx.fillStyle = best ? '#555550' : '#c9c2b4';
    ctx.fillText(best ? this.formatTime(best.time) : '—:——.——', cx, cy + 40);

    if (this.pendingHighScoreRank !== null) {
      ctx.font = '700 18px "Open Sans", sans-serif';
      ctx.fillStyle = '#111111';
      ctx.fillText(`Neue Bestzeit #${this.pendingHighScoreRank + 1}`, cx, cy + 74);
      this.renderNameEntry(cx, cy + 110);
      ctx.font = '400 15px "Open Sans", sans-serif';
      ctx.fillStyle = '#555550';
      ctx.fillText('3 Zeichen · ENTER speichern · BACKSPACE löschen', cx, cy + 154);
      ctx.restore();
      return;
    }

    const btnW = 300, btnH = 48;
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.roundRect(cx - btnW / 2, cy + 72, btnW, btnH, 6);
    ctx.fill();
    ctx.font = '700 20px "Open Sans", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('SPACE — Nochmal', cx, cy + 104);

    ctx.font = '400 15px "Open Sans", sans-serif';
    ctx.fillStyle = '#555550';
    ctx.fillText('H — Bestzeiten · ESC — Menü', cx, cy + 148);

    ctx.restore();
  }

  private renderNameEntry(cx: number, y: number): void {
    const { ctx } = this;
    const boxW = 48;
    const boxH = 54;
    const gap = 10;
    const totalW = boxW * 3 + gap * 2;
    const startX = cx - totalW * 0.5;
    const activeIndex = Math.min(this.pendingName.length, 2);
    const showCursor = Math.floor(performance.now() / 420) % 2 === 0;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '800 32px "Open Sans", sans-serif';

    for (let i = 0; i < 3; i++) {
      const x = startX + i * (boxW + gap);
      const char = this.pendingName[i] ?? '';
      const isActive = i === activeIndex && this.pendingName.length < 3;

      ctx.fillStyle = isActive ? '#ffffff' : '#ece8dc';
      ctx.beginPath();
      ctx.roundRect(x, y - boxH * 0.5, boxW, boxH, 6);
      ctx.fill();
      ctx.strokeStyle = isActive ? '#111111' : '#c9c2b4';
      ctx.lineWidth = isActive ? 3 : 2;
      ctx.stroke();

      if (char) {
        ctx.fillStyle = '#111111';
        ctx.fillText(char, x + boxW * 0.5, y + 12);
      } else if (isActive && showCursor) {
        ctx.fillStyle = '#111111';
        ctx.fillRect(x + boxW * 0.5 - 2, y - 18, 4, 34);
      } else {
        ctx.fillStyle = '#b7afa0';
        ctx.fillText('_', x + boxW * 0.5, y + 12);
      }
    }

    ctx.restore();
  }

  private renderHighScores(): void {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    const cx = W * 0.5;
    const top = 120;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '800 56px "Open Sans", sans-serif';
    ctx.fillStyle = '#111111';
    ctx.fillText('BESTZEITEN', cx, top);

    ctx.font = '700 18px "Open Sans", sans-serif';
    ctx.fillStyle = '#555550';
    ctx.fillText('Top 5', cx, top + 34);

    if (this.highScores.length === 0) {
      ctx.font = '400 22px "Open Sans", sans-serif';
      ctx.fillStyle = '#555550';
      ctx.fillText('Noch keine Zeiten gespeichert.', cx, top + 150);
    } else {
      ctx.textAlign = 'left';
      ctx.font = '700 22px "Open Sans", sans-serif';
      for (let i = 0; i < this.highScores.length; i++) {
        const score = this.highScores[i];
        const y = top + 92 + i * 38;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(17,17,17,0.06)' : 'rgba(17,17,17,0.025)';
        ctx.fillRect(cx - 230, y - 25, 460, 32);
        ctx.fillStyle = '#111111';
        ctx.fillText(`${String(i + 1).padStart(2, '0')}.`, cx - 210, y);
        ctx.fillText(score.name, cx - 150, y);
        ctx.textAlign = 'right';
        ctx.fillText(this.formatTime(score.time), cx + 210, y);
        ctx.textAlign = 'left';
      }
    }

    ctx.textAlign = 'center';
    ctx.font = '400 16px "Open Sans", sans-serif';
    ctx.fillStyle = '#555550';
    ctx.fillText('SPACE · ENTER · ESC — Menü', cx, H - 58);
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

    if (this.state === 'race' || this.state === 'countdown') {
      const kmh = Math.round(this.car.speed * 0.18); // u/s → rough km/h
      ctx.font = '700 16px "Open Sans", sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillText(`${kmh} km/h`, 10, 42);

      ctx.font = '800 32px "Open Sans", sans-serif';
      ctx.fillStyle = '#111111';
      ctx.fillText(this.formatTime(this.raceTime), 10, 78);

      const best = this.highScores[0];
      ctx.font = '400 13px "Open Sans", sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillText('Bestzeit', 10, 96);
      ctx.font = '800 32px "Open Sans", sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillText(best ? this.formatTime(best.time) : '—:——.——', 10, 126);

      this.renderProgressBar();
    }

    ctx.restore();
  }

  private renderProgressBar(): void {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const x = W * 0.5 - 210;
    const y = canvas.height - 34;
    const w = 420;
    const h = 10;
    const progress = Math.max(0, Math.min(1, this.car.dist / this.track.finishDist));

    ctx.save();
    ctx.fillStyle = 'rgba(17,17,17,0.22)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 5);
    ctx.fill();
    if (progress > 0) {
      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.roundRect(x, y, w * progress, h, 5);
      ctx.fill();
    }
    ctx.fillStyle = '#e63030';
    ctx.beginPath();
    ctx.arc(x + w * progress, y + h * 0.5, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
