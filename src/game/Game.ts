import { InputHandler } from '../utils/InputHandler';
import { Track } from './Track';
import { Car, CAR_RADIUS } from './Car';
import { placeObstacles, renderObstacle } from './Obstacle';
import { ParticleSystem } from './ParticleSystem';
import { AudioSystem } from './AudioSystem';
import { BirdSystem } from './BirdSystem';
import { FlowerSystem } from './FlowerSystem';
import type { Obstacle } from './Obstacle';
import {
  isRemoteHighScoresConfigured,
  loadRemoteHighScores,
  saveRemoteHighScore,
  type HighScoreEntry,
} from '../services/LootLockerHighScores';
import {
  buildCarConfig,
  CAR_COLORS,
  DEFAULT_SETUP,
  type CarSetup,
} from './CarConfig';
import { COURSES, type CourseConfig } from './CourseConfig';

export type GameState = 'menu' | 'countdown' | 'race' | 'finish';

const TARGET_H = 720;  // fixed world height — width adapts to window
const FIXED_DT = 1 / 60;  // 60 Hz physics tick
const CAM_AHEAD = 180;      // world units camera looks ahead of car
const HIGHSCORE_KEY = 'seifenkisten.highscores.v1';
const MAX_HIGHSCORES = 5;
const RIPPLE_DURATION = 0.48;

// Grass stripe colours — two subtly different greens, stripe = 2× road stripe
const GRASS_STRIPE = 130;
// Menu slider definitions
type SliderKey = 'weight' | 'steering' | 'aero';
type SliderDef = { key: SliderKey; header: string; lo: string; hi: string; labelY: number; trackY: number };
const SLIDER_DEFS: ReadonlyArray<SliderDef> = [
  { key: 'weight',   header: 'GEWICHT',     lo: 'LEICHT', hi: 'SCHWER', labelY: 212, trackY: 236 },
  { key: 'steering', header: 'LENKUNG',     lo: 'TRÄGE',  hi: 'DIREKT', labelY: 285, trackY: 309 },
  { key: 'aero',     header: 'AERODYNAMIK', lo: 'RUND',   hi: 'SPITZ',  labelY: 358, trackY: 382 },
];
// Compact slider positions for narrow (mobile portrait) layout
const NARROW_SLIDER_DEFS: ReadonlyArray<SliderDef> = [
  { key: 'weight',   header: 'GEWICHT',     lo: 'LEICHT', hi: 'SCHWER', labelY: 378, trackY: 396 },
  { key: 'steering', header: 'LENKUNG',     lo: 'TRÄGE',  hi: 'DIREKT', labelY: 430, trackY: 448 },
  { key: 'aero',     header: 'AERODYNAMIK', lo: 'RUND',   hi: 'SPITZ',  labelY: 482, trackY: 500 },
];

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
  private birds   = new BirdSystem();
  private flowers = new FlowerSystem();

  // Car setup (configured in menu)
  private setup: CarSetup = { ...DEFAULT_SETUP };
  private courseIndex = 0;
  private draggingSlider: number | null = null;
  private startButtonTouched = false;

  // Camera (world coordinates of screen centre)
  private camX = 0;
  private camY = 0;

  // Crash feedback
  private shakeAmt = 0;    // screen shake magnitude (pixels), decays to 0
  private rippleTime = 0;

  // Race systems
  private raceTime = 0;
  private finishTime = 0;
  private countdownTime = 3;
  private countdownBeep = 3;
  private highScores: HighScoreEntry[] = [];
  private pendingHighScoreRank: number | null = null;
  private pendingName = '';

  // Mobile name-entry keyboard support
  private nameInput: HTMLInputElement | null = null;
  private nameInputActive = false;

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
    void this.refreshHighScores();

    this.initRace();   // pre-generate track so it's ready on first start
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Ensure the canvas always has keyboard focus on macOS/Chrome
    canvas.setAttribute('tabindex', '0');
    canvas.focus();
    window.addEventListener('click', () => { if (!this.nameInputActive) canvas.focus(); });
    window.addEventListener('pointerdown', () => { if (!this.nameInputActive) canvas.focus(); });

    // Menu config UI interactions
    canvas.addEventListener('pointerdown', (e) => {
      if (this.state === 'menu')   this.onMenuPointerDown(e);
      if (this.state === 'finish') this.onFinishPointerDown(e);
    });
    canvas.addEventListener('pointermove', (e) => this.onMenuPointerMove(e));
    canvas.addEventListener('pointerup',   () => { this.draggingSlider = null; });
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  /** (Re-)create track, car and obstacles. Called on first load and "race again". */
  private initRace(): void {
    const course = this.currentCourse();
    this.track = new Track(course);
    this.car = new Car(this.track, buildCarConfig(this.setup), this.setup);
    this.obstacles = placeObstacles(this.track, course.obstacleSeed);
    this.birds.place(this.track, course.birdSeed);
    this.flowers.place(this.track, course.flowerSeed);
    this.particles.clear();
    this.shakeAmt = 0;
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

  private currentCourse(): CourseConfig {
    return COURSES[this.courseIndex] ?? COURSES[0];
  }

  // ─── Sizing ────────────────────────────────────────────────────────────────

  private resize(): void {
    // Scale only by height — road stays full-size, grass crops horizontally.
    const scale = window.innerHeight / TARGET_H;
    this.canvas.width  = Math.round(window.innerWidth / scale);
    this.canvas.height = TARGET_H;
    this.canvas.style.width  = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
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
      this.input.flush();
      this.accumulator -= FIXED_DT;
    }

    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  private update(dt: number): void {
    switch (this.state) {
      case 'menu': this.updateMenu(dt); break;
      case 'countdown': this.updateCountdown(dt); break;
      case 'race': this.updateRace(dt); break;
      case 'finish': this.updateFinish(dt); break;
    }
  }

  private updateMenu(_dt: number): void {
    if (this.input.wasPressed('ArrowLeft') || this.input.wasPressed('KeyQ')) {
      this.setCourseIndex(this.courseIndex - 1);
    }
    if (this.input.wasPressed('ArrowRight') || this.input.wasPressed('KeyE')) {
      this.setCourseIndex(this.courseIndex + 1);
    }
    if (this.input.wasPressed('Space') || this.input.wasPressed('Enter') || this.startButtonTouched) {
      this.startButtonTouched = false;
      this.audio.resume();
      this.initRace();
      this.setState('countdown');
      this.audio.start();
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
      this.audio.driveStart();
      this.setState('race');
    }
  }

  private updateRace(dt: number): void {
    if (this.input.wasPressed('Escape')) {
      this.audio.squeal(0);
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
    this.shakeAmt  = Math.max(0, this.shakeAmt  - dt * 42);
    this.rippleTime = Math.max(0, this.rippleTime - dt);

    // ── Particle trail ───────────────────────────────────────────────────────
    const speed = this.car.speed;
    if (speed > 60 && this.car.frozen <= 0) {
      const fwdX = Math.sin(this.car.angle);
      const fwdY = -Math.cos(this.car.angle);
      this.particles.emit(this.car.worldX, this.car.worldY, fwdX, fwdY, speed);
    }
    this.particles.update(dt);

    // ── Tire squeal ───────────────────────────────────────────────────────────
    const squealIntensity = this.car.frozen > 0
      ? 0
      : Math.max(0, (this.car.lateralSpeed - 25) / 100);
    this.audio.squeal(squealIntensity);

    // Camera: direct follow with look-ahead so more track is visible ahead
    this.camX = this.car.worldX;
    this.camY = this.car.worldY + CAM_AHEAD;

    // Birds update after camera so screen positions are correct for this frame
    this.birds.update(dt, this.car.worldX, this.car.worldY,
      this.camX, this.camY, this.canvas.width, this.canvas.height);
  }

  private triggerCrash(): void {
    this.car.onCollision(this.track);
    this.shakeAmt = 14;
    this.rippleTime = RIPPLE_DURATION;
    this.audio.crash();
  }

  private triggerObstacleCrash(nx: number, ny: number, pushOut: number): void {
    this.car.onObstacleCollision(this.track, nx, ny, pushOut);
    this.shakeAmt = 14;
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
  }

  private setState(next: GameState): void {
    this.state = next;
  }

  private finishRace(): void {
    this.audio.squeal(0);
    this.finishTime = this.raceTime;
    const rank = this.getHighScoreRank(this.finishTime);
    if (rank !== null) {
      this.pendingHighScoreRank = rank;
      this.pendingName = '';
      this.ensureNameInput(); // create element early; focus happens on first user tap
    }
  }

  private updateNameEntry(): void {
    if (this.nameInputActive) {
      // All text input is handled by the hidden <input> element; only intercept Enter here
      // (keydown on the input also fires Enter, but guard in case focus was lost)
      if (this.input.wasPressed('Enter')) {
        this.commitPendingHighScore();
      }
      return;
    }

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
    const entry = {
      name: (this.pendingName || '---').slice(0, 3).toUpperCase(),
      time: this.finishTime,
      date: new Date().toISOString(),
      courseId: this.currentCourse().id,
    };
    this.highScores.push(entry);
    this.highScores.sort((a, b) => a.time - b.time);
    this.highScores = this.highScores.slice(0, MAX_HIGHSCORES);
    this.saveHighScores();
    void this.syncHighScores(entry);
    this.pendingHighScoreRank = null;
    this.blurNameInput();
    this.audio.save();
  }

  private async refreshHighScores(): Promise<void> {
    const courseId = this.currentCourse().id;
    const remoteScores = await loadRemoteHighScores(MAX_HIGHSCORES, courseId);
    if (!remoteScores) return;
    if (courseId !== this.currentCourse().id) return;
    this.highScores = this.mergeHighScores(remoteScores);
    this.saveHighScores();
  }

  private async syncHighScores(entry: HighScoreEntry): Promise<void> {
    const courseId = this.currentCourse().id;
    const saved = await saveRemoteHighScore(entry, courseId);
    if (!saved) return;
    const remoteScores = await loadRemoteHighScores(MAX_HIGHSCORES, courseId);
    if (!remoteScores) return;
    if (courseId !== this.currentCourse().id) return;
    this.highScores = this.mergeHighScores([entry, ...remoteScores]);
    this.saveHighScores();
  }

  private mergeHighScores(remoteScores: HighScoreEntry[]): HighScoreEntry[] {
    const seen = new Set<string>();
    const sources = isRemoteHighScoresConfigured()
      ? remoteScores
      : [...remoteScores, ...this.highScores];
    return sources
      .filter((entry) => {
        const key = `${entry.name}|${entry.time}|${entry.date}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.time - b.time)
      .slice(0, MAX_HIGHSCORES);
  }

  private normalizeStoredHighScore(entry: Partial<HighScoreEntry>): HighScoreEntry | null {
    if (
      typeof entry.name !== 'string' ||
      typeof entry.time !== 'number' ||
      typeof entry.date !== 'string' ||
      !Number.isFinite(entry.time) ||
      entry.time < 0
    ) {
      return null;
    }
    return {
      name: (entry.name.trim().toUpperCase().replace(/\s+/g, '') || '---').slice(0, 3),
      time: entry.time,
      date: entry.date,
      courseId: this.currentCourse().id,
    };
  }

  private loadHighScores(): HighScoreEntry[] {
    if (isRemoteHighScoresConfigured()) return [];

    try {
      const raw = localStorage.getItem(this.highScoreKey())
        ?? (this.currentCourse().id === COURSES[0].id ? localStorage.getItem(HIGHSCORE_KEY) : null);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as Partial<HighScoreEntry>[];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((entry) => this.normalizeStoredHighScore(entry))
        .filter((entry): entry is HighScoreEntry => entry !== null)
        .sort((a, b) => a.time - b.time)
        .slice(0, MAX_HIGHSCORES);
    } catch {
      return [];
    }
  }

  private saveHighScores(): void {
    if (isRemoteHighScoresConfigured()) return;

    try {
      localStorage.setItem(this.highScoreKey(), JSON.stringify(this.highScores));
    } catch {
      // Ignore private-mode/quota failures; gameplay should continue.
    }
  }

  private highScoreKey(): string {
    return `${HIGHSCORE_KEY}.${this.currentCourse().id}`;
  }

  private formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds - minutes * 60;
    return `${minutes}:${rest.toFixed(2).padStart(5, '0')}`;
  }

  private getHighScoreRank(time: number): number | null {
    const rank = this.highScores.findIndex((score) => time < score.time);
    if (rank >= 0) return rank;
    return this.highScores.length < MAX_HIGHSCORES ? this.highScores.length : null;
  }

  // ─── Menu pointer interaction ──────────────────────────────────────────────

  /** Convert a PointerEvent position to logical canvas coordinates. */
  private toCanvasCoords(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width  * this.canvas.width,
      y: (e.clientY - rect.top)  / rect.height * this.canvas.height,
    };
  }

  // ─── Hidden input for mobile keyboard (name entry) ─────────────────────────

  private ensureNameInput(): void {
    if (this.nameInput) return;
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.maxLength = 3;
    inp.setAttribute('autocomplete', 'off');
    inp.setAttribute('autocapitalize', 'characters');
    inp.setAttribute('autocorrect', 'off');
    inp.setAttribute('spellcheck', 'false');
    // Off-screen but not display:none — must be visible to browsers for focus/keyboard
    inp.style.cssText = [
      'position:fixed', 'top:-120px', 'left:0',
      'width:1px', 'height:1px', 'opacity:0',
      'pointer-events:none', 'font-size:16px',  // 16px prevents iOS zoom
    ].join(';');
    document.body.appendChild(inp);

    inp.addEventListener('input', () => {
      if (!this.nameInputActive) return;
      const val = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      this.pendingName = val.slice(0, 3);
      inp.value = this.pendingName;
    });
    inp.addEventListener('keydown', (e) => {
      if (!this.nameInputActive) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        this.commitPendingHighScore();
      }
    });
    inp.addEventListener('blur', () => { this.nameInputActive = false; });
    this.nameInput = inp;
  }

  private focusNameInput(): void {
    this.ensureNameInput();
    if (!this.nameInput) return;
    this.nameInput.value = this.pendingName;
    this.nameInputActive = true;
    this.nameInput.focus();
  }

  private blurNameInput(): void {
    this.nameInputActive = false;
    this.nameInput?.blur();
  }

  // ─── Finish screen pointer interaction ─────────────────────────────────────

  private onFinishPointerDown(e: PointerEvent): void {
    if (this.pendingHighScoreRank === null) return;
    const { y } = this.toCanvasCoords(e);
    const H = this.canvas.height;
    const cy = H * 0.5;

    // Any tap on the finish screen: focus the input (iOS requires this to be
    // called synchronously inside a user-gesture handler to show the keyboard)
    if (!this.nameInputActive) {
      this.focusNameInput();
    }

    // OK button hit area
    if (y >= cy + 172 && y <= cy + 228) {
      this.commitPendingHighScore();
    }
  }

  private getMenuLayout(W: number) {
    const cx = W / 2;

    // Compute where the two columns would land in wide mode
    const scoreHalfW = 190;
    const sliderHalfW = 110 + 24; // trackW/2 + padding
    const lcxWide = Math.max(scoreHalfW + 10, cx - 260);
    const rcxWide = Math.min(W - sliderHalfW - 10, cx + 260);
    const columnGap = (rcxWide - 110) - (lcxWide + scoreHalfW);
    const narrow = columnGap < 30; // switch to single-column before overlap

    if (narrow) {
      const trackW = Math.min(220, W - 80);
      const trackX = cx - trackW / 2;
      const colorSpacing = 34;
      const colorStartX  = cx - (CAR_COLORS.length - 1) / 2 * colorSpacing;
      const startBtnW = Math.min(300, W - 40);
      return {
        cx, narrow,
        lcx: cx, rcx: cx,
        trackW, trackX, colorSpacing, colorStartX,
        courseX: cx - W * 0.46, courseY: 116, courseW: W * 0.92,
        colorY: 546, colorR: 13,
        startBtnY: 594, startBtnW, startBtnH: 52,
        sliderDefs: NARROW_SLIDER_DEFS,
      };
    }

    const clamp = (value: number, min: number, max: number): number =>
      Math.max(min, Math.min(max, value));
    const trackW = 220;
    const lcx = (() => {
      const halfWidth = 190;
      const min = halfWidth + 10;
      const max = W - halfWidth - 10;
      return min <= max ? clamp(cx - 260, min, max) : cx;
    })();
    const rcx = (() => {
      const halfWidth = trackW / 2 + 24;
      const min = halfWidth + 10;
      const max = W - halfWidth - 10;
      return min <= max ? clamp(cx + 260, min, max) : cx;
    })();
    const trackX = rcx - trackW / 2;
    const colorSpacing = 38;
    const colorStartX  = rcx - (CAR_COLORS.length - 1) / 2 * colorSpacing;
    const courseX = lcx - 190;
    const courseW = (rcx + 190) - courseX;
    return {
      cx, narrow,
      lcx, rcx, trackW, trackX, colorSpacing, colorStartX,
      courseX, courseY: 126, courseW,
      colorY: 438, colorR: 14,
      startBtnY: 508, startBtnW: 340, startBtnH: 52,
      sliderDefs: SLIDER_DEFS,
    };
  }

  private onMenuPointerDown(e: PointerEvent): void {
    if (this.state !== 'menu') return;
    const { x, y } = this.toCanvasCoords(e);
    const layout = this.getMenuLayout(this.canvas.width);

    if (
      y >= layout.courseY - 22 &&
      y <= layout.courseY + 28 &&
      x >= layout.courseX &&
      x <= layout.courseX + layout.courseW
    ) {
      const dir = x < layout.courseX + layout.courseW / 2 ? -1 : 1;
      this.setCourseIndex(this.courseIndex + dir);
      return;
    }

    // Hit-test sliders
    for (let i = 0; i < layout.sliderDefs.length; i++) {
      const sl = layout.sliderDefs[i];
      if (
        Math.abs(y - sl.trackY) < 20 &&
        x >= layout.trackX - 10 &&
        x <= layout.trackX + layout.trackW + 10
      ) {
        this.draggingSlider = i;
        this.canvas.setPointerCapture(e.pointerId);
        const t = Math.max(0, Math.min(1, (x - layout.trackX) / layout.trackW));
        this.setup[sl.key] = t;
        return;
      }
    }

    // Hit-test color swatches
    for (let i = 0; i < CAR_COLORS.length; i++) {
      const cx = layout.colorStartX + i * layout.colorSpacing;
      if (Math.hypot(x - cx, y - layout.colorY) < layout.colorR + 6) {
        this.setup.colorIndex = i;
        return;
      }
    }

    // Hit-test start button
    const bx = layout.cx - layout.startBtnW / 2;
    if (
      x >= bx && x <= bx + layout.startBtnW &&
      y >= layout.startBtnY && y <= layout.startBtnY + layout.startBtnH
    ) {
      this.startButtonTouched = true;
    }
  }

  private onMenuPointerMove(e: PointerEvent): void {
    if (this.state !== 'menu' || this.draggingSlider === null) return;
    const { x } = this.toCanvasCoords(e);
    const layout = this.getMenuLayout(this.canvas.width);
    const t = Math.max(0, Math.min(1, (x - layout.trackX) / layout.trackW));
    this.setup[layout.sliderDefs[this.draggingSlider].key] = t;
  }

  private setCourseIndex(index: number): void {
    const next = (index + COURSES.length) % COURSES.length;
    if (next === this.courseIndex) return;
    this.courseIndex = next;
    this.highScores = this.loadHighScores();
    void this.refreshHighScores();
    this.initRace();
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
    }

    this.renderHUD();
  }

  // ── Menu ───────────────────────────────────────────────────────────────────

  private renderMenu(): void {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    const layout = this.getMenuLayout(W);

    if (layout.narrow) {
      this.renderMenuNarrow(layout);
    } else {
      this.renderMenuWide(layout);
    }

    // Hint text (responsive)
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '400 14px "Open Sans", sans-serif';
    ctx.fillStyle = '#888880';
    if (layout.narrow) {
      ctx.fillText('Touch: Links / Mitte Bremse / Rechts', layout.cx, H - 18);
    } else {
      ctx.fillText('Steuerung: ← → oder A D · Bremse: ↓ oder S', layout.cx, H - 30);
    }
    ctx.restore();
  }

  private renderMenuSliders(
    layout: ReturnType<typeof this.getMenuLayout>,
  ): void {
    const { ctx } = this;
    const { rcx, trackW, trackX, sliderDefs } = layout;
    const TRACK_H = 8;
    const THUMB_R = 10;

    for (const sl of sliderDefs) {
      const val = this.setup[sl.key];
      const thumbX = trackX + val * trackW;

      ctx.font = '700 13px "Open Sans", sans-serif';
      ctx.fillStyle = '#888880';
      ctx.textAlign = 'center';
      ctx.fillText(sl.header, rcx, sl.labelY);

      ctx.font = '700 12px "Open Sans", sans-serif';
      ctx.fillStyle = '#aaa89a';
      ctx.textAlign = 'right';
      ctx.fillText(sl.lo, trackX - 8, sl.trackY + 4);
      ctx.textAlign = 'left';
      ctx.fillText(sl.hi, trackX + trackW + 8, sl.trackY + 4);

      ctx.fillStyle = 'rgba(17,17,17,0.12)';
      ctx.beginPath();
      ctx.roundRect(trackX, sl.trackY - TRACK_H / 2, trackW, TRACK_H, TRACK_H / 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(17,17,17,0.55)';
      ctx.beginPath();
      ctx.roundRect(trackX, sl.trackY - TRACK_H / 2, val * trackW, TRACK_H, TRACK_H / 2);
      ctx.fill();

      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.arc(thumbX, sl.trackY, THUMB_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(thumbX, sl.trackY, THUMB_R - 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.arc(thumbX, sl.trackY, THUMB_R - 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderMenuColors(layout: ReturnType<typeof this.getMenuLayout>): void {
    const { ctx } = this;
    const { rcx, colorY, colorR, colorStartX, colorSpacing } = layout;

    ctx.font = '700 13px "Open Sans", sans-serif';
    ctx.fillStyle = '#888880';
    ctx.textAlign = 'center';
    ctx.fillText('FARBE', rcx, colorY - colorR - 8);

    for (let i = 0; i < CAR_COLORS.length; i++) {
      const cx_i = colorStartX + i * colorSpacing;
      const selected = i === this.setup.colorIndex;
      const r = selected ? colorR : colorR - 3;

      if (selected) {
        ctx.fillStyle = '#111111';
        ctx.beginPath();
        ctx.arc(cx_i, colorY, r + 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = CAR_COLORS[i].hex;
      ctx.beginPath();
      ctx.arc(cx_i, colorY, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(17,17,17,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  private renderMenuCourse(layout: ReturnType<typeof this.getMenuLayout>): void {
    const { ctx } = this;
    const course = this.currentCourse();
    const { courseX, courseY, courseW } = layout;
    const cx = courseX + courseW / 2;
    const h = layout.narrow ? 56 : 62;

    ctx.save();
    ctx.textAlign = 'center';

    ctx.fillStyle = 'rgba(17,17,17,0.08)';
    ctx.beginPath();
    ctx.roundRect(courseX, courseY - 18, courseW, h, 6);
    ctx.fill();

    ctx.fillStyle = '#111111';
    ctx.font = `800 ${layout.narrow ? 18 : 22}px "Open Sans", sans-serif`;
    ctx.fillText(course.name.toUpperCase(), cx, courseY + 6);
    ctx.font = '400 13px "Open Sans", sans-serif';
    ctx.fillStyle = '#555550';
    ctx.fillText(course.description, cx, courseY + 26);

    ctx.font = '800 24px "Open Sans", sans-serif';
    ctx.fillStyle = '#111111';
    ctx.fillText('‹', courseX + 24, courseY + 14);
    ctx.fillText('›', courseX + courseW - 24, courseY + 14);
    ctx.restore();
  }

  /** Narrow (mobile portrait) single-column menu. */
  private renderMenuNarrow(layout: ReturnType<typeof this.getMenuLayout>): void {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const { cx, startBtnY, startBtnW, startBtnH } = layout;
    const colHalfW = W * 0.46;

    ctx.save();
    ctx.textAlign = 'center';

    // Title — two lines on narrow screens
    ctx.font = '800 38px "Open Sans", sans-serif';
    ctx.fillStyle = '#111111';
    ctx.fillText('SEIFENKISTEN', cx, 44);
    ctx.fillText('RENNEN', cx, 84);
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - colHalfW, 98);
    ctx.lineTo(cx + colHalfW, 98);
    ctx.stroke();

    this.renderMenuCourse(layout);

    // BESTZEITEN — above vehicle config
    ctx.font = '700 13px "Open Sans", sans-serif';
    ctx.fillStyle = '#888880';
    ctx.fillText('BESTZEITEN', cx, 174);

    if (this.highScores.length === 0) {
      ctx.font = '400 15px "Open Sans", sans-serif';
      ctx.fillStyle = '#aaa89a';
      ctx.fillText('Noch keine Zeiten.', cx, 204);
    } else {
      const rowH = 30;
      const top = 202;
      for (let i = 0; i < this.highScores.length; i++) {
        const score = this.highScores[i];
        const ry = top + i * rowH;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(17,17,17,0.06)' : 'rgba(17,17,17,0.025)';
        ctx.fillRect(cx - colHalfW, ry - 20, colHalfW * 2, 26);
        ctx.textAlign = 'left';
        ctx.font = '700 16px "Open Sans", sans-serif';
        ctx.fillStyle = '#111111';
        ctx.fillText(`${String(i + 1).padStart(2, '0')}. ${score.name}`, cx - colHalfW + 8, ry);
        ctx.textAlign = 'right';
        ctx.fillText(this.formatTime(score.time), cx + colHalfW - 8, ry);
        ctx.textAlign = 'center';
      }
    }

    // Separator before vehicle config
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - colHalfW, 348);
    ctx.lineTo(cx + colHalfW, 348);
    ctx.stroke();

    // FAHRZEUG header
    ctx.font = '700 13px "Open Sans", sans-serif';
    ctx.fillStyle = '#888880';
    ctx.fillText('FAHRZEUG', cx, 366);

    this.renderMenuSliders(layout);
    this.renderMenuColors(layout);

    // Separator before start button
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - colHalfW, startBtnY - 14);
    ctx.lineTo(cx + colHalfW, startBtnY - 14);
    ctx.stroke();

    // Start button
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.roundRect(cx - startBtnW / 2, startBtnY, startBtnW, startBtnH, 6);
    ctx.fill();
    ctx.font = '700 20px "Open Sans", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('TIPPEN — START', cx, startBtnY + 33);

    ctx.restore();
  }

  /** Wide (desktop / landscape) two-column menu. */
  private renderMenuWide(layout: ReturnType<typeof this.getMenuLayout>): void {
    const { ctx } = this;
    const { cx, lcx, rcx, startBtnY, startBtnW, startBtnH } = layout;

    ctx.save();
    ctx.textAlign = 'center';

    // Title
    ctx.font = '800 72px "Open Sans", sans-serif';
    ctx.fillStyle = '#111111';
    ctx.fillText('SEIFENKISTEN RENNEN', cx, 82);
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 540, 100);
    ctx.lineTo(cx + 540, 100);
    ctx.stroke();

    this.renderMenuCourse(layout);

    // Column headers
    ctx.font = '700 15px "Open Sans", sans-serif';
    ctx.fillStyle = '#888880';
    ctx.fillText('BESTZEITEN', lcx, 188);
    ctx.fillText('FAHRZEUG', rcx, 188);

    // Left: Highscores
    if (this.highScores.length === 0) {
      ctx.font = '400 18px "Open Sans", sans-serif';
      ctx.fillStyle = '#888880';
      ctx.fillText('Noch keine Zeiten.', lcx, 260);
    } else {
      const rowH = 38;
      const top  = 230;
      for (let i = 0; i < this.highScores.length; i++) {
        const score = this.highScores[i];
        const y = top + i * rowH;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(17,17,17,0.06)' : 'rgba(17,17,17,0.025)';
        ctx.fillRect(lcx - 190, y - 24, 380, 32);
        ctx.textAlign = 'left';
        ctx.font = '700 20px "Open Sans", sans-serif';
        ctx.fillStyle = '#111111';
        ctx.fillText(`${String(i + 1).padStart(2, '0')}.`, lcx - 170, y);
        ctx.fillText(score.name, lcx - 108, y);
        ctx.textAlign = 'right';
        ctx.fillText(this.formatTime(score.time), lcx + 170, y);
        ctx.textAlign = 'center';
      }
    }

    // Right: Config sliders
    this.renderMenuSliders(layout);

    // Right: Color swatches
    this.renderMenuColors(layout);

    // Divider + start button
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 540, startBtnY - 20);
    ctx.lineTo(cx + 540, startBtnY - 20);
    ctx.stroke();

    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.roundRect(cx - startBtnW / 2, startBtnY, startBtnW, startBtnH, 6);
    ctx.fill();
    ctx.font = '700 22px "Open Sans", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('SPACE · ENTER — Start', cx, startBtnY + 34);

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
    const course = this.currentCourse();

    // ── Grass stripes — horizontal world-Y bands, drawn before shake ──────────
    // sy = camY − wy + H/2  →  stripe idx i covers world Y [i·S, (i+1)·S]
    {
      const S = GRASS_STRIPE;
      const iTop = Math.floor((this.camY + H * 0.5) / S);
      const iBot = Math.floor((this.camY - H * 0.5) / S);
      for (let i = iTop; i >= iBot; i--) {
        const syA = Math.max(0, Math.floor(this.camY - (i + 1) * S + H * 0.5));
        const syB = Math.min(H, Math.floor(this.camY - i * S + H * 0.5));
        if (syB <= syA) continue;
        ctx.fillStyle = i % 2 === 0 ? course.grassLight : course.grassDark;
        ctx.fillRect(0, syA, W, syB - syA);
      }
    }

    // ── Screen shake: translate world, restore before HUD overlays ────────────
    ctx.save();
    if (this.shakeAmt > 0) {
      ctx.translate(
        (Math.random() - 0.5) * 2 * this.shakeAmt,
        (Math.random() - 0.5) * 2 * this.shakeAmt,
      );
    }

    // ── Flowers (on grass, beneath road) ─────────────────────────────────────
    this.flowers.render(ctx, this.camX, this.camY, W, H);

    // ── Track (road + borders + bales + start/finish) ─────────────────────────
    this.track.render(ctx, this.camX, this.camY, W, H);

    // ── Sitting birds (on road surface, behind obstacles) ─────────────────────
    this.birds.renderSitting(ctx, this.camX, this.camY, W, H);

    // ── Road obstacles ────────────────────────────────────────────────────────
    const cullY = H * 0.6 + 80;
    for (const obs of this.obstacles) {
      const sx = obs.wx - this.camX + W * 0.5;
      const sy = this.camY - obs.wy + H * 0.5;

      if (sy < -cullY || sy > H + cullY || sx < -100 || sx > W + 100) continue;
      renderObstacle(ctx, sx, sy, obs);
    }

    // ── Particle trail ────────────────────────────────────────────────────────
    this.particles.render(ctx, this.camX, this.camY, W, H, this.car.color);

    // ── Car ───────────────────────────────────────────────────────────────────
    this.car.render(ctx, this.camX, this.camY, W, H);

    // ── Speed lines ───────────────────────────────────────────────────────────
    this.renderSpeedLines(W, H);

    // ── Flying birds (airborne, in front of car) ──────────────────────────────
    this.birds.renderFlying(ctx);

    ctx.restore();  // end shake — overlays below are screen-stable

    // ── Ripple + "+3s" popup ──────────────────────────────────────────────────
    this.renderRipple(W, H);

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
    ctx.fillStyle = this.currentCourse().grassDark;
    ctx.fillRect(0, 0, W, H);
    this.track.render(ctx, this.camX, this.camY, W, H);
    this.car.render(ctx, this.camX, this.camY, W, H);

    // Responsive panel
    const panelW = Math.min(560, W - 24);
    const panelH = this.pendingHighScoreRank !== null ? 340 : 300;
    ctx.fillStyle = 'rgba(245,242,235,0.92)';
    ctx.beginPath();
    ctx.roundRect(cx - panelW / 2, cy - 130, panelW, panelH, 8);
    ctx.fill();
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.save();
    ctx.textAlign = 'center';

    const titleSize = panelW < 360 ? 36 : 52;
    ctx.font = `800 ${titleSize}px "Open Sans", sans-serif`;
    ctx.fillStyle = '#111111';
    ctx.fillText('ZIEL ERREICHT!', cx, cy - 70);

    // Current time
    ctx.font = '800 32px "Open Sans", sans-serif';
    ctx.fillStyle = '#111111';
    ctx.fillText(this.formatTime(this.finishTime), cx, cy - 26);

    // Best time
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

      // OK button (touch submit)
      const okW = Math.min(200, panelW - 40);
      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.roundRect(cx - okW / 2, cy + 172, okW, 46, 6);
      ctx.fill();
      ctx.font = '700 18px "Open Sans", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('OK ✓', cx, cy + 201);

      ctx.restore();
      return;
    }

    const btnW = Math.min(300, panelW - 40);
    const btnH = 48;
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.roundRect(cx - btnW / 2, cy + 72, btnW, btnH, 6);
    ctx.fill();
    ctx.font = '700 20px "Open Sans", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('SPACE — Nochmal', cx, cy + 104);

    ctx.font = '400 15px "Open Sans", sans-serif';
    ctx.fillStyle = '#555550';
    ctx.fillText('ESC — Menü', cx, cy + 148);

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
