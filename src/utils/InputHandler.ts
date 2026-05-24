/**
 * Tracks keyboard state for each frame.
 * Keys are stored by their KeyboardEvent.code value.
 */
export class InputHandler {
  private held = new Set<string>();
  private justPressed = new Set<string>();
  private justReleased = new Set<string>();
  private typed = '';
  private touchSteer = 0;
  private touchBrake = 0;
  private touchPressed = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (!this.held.has(e.code)) {
        this.justPressed.add(e.code);
      }
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1 && /^[a-z0-9]$/i.test(e.key)) {
        this.typed += e.key.toUpperCase();
      }
      this.held.add(e.code);
      // Prevent arrow keys from scrolling
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace'].includes(e.code)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      this.justReleased.add(e.code);
    });
  }

  attachTouchTarget(canvas: HTMLCanvasElement): void {
    const updateTouches = (event: TouchEvent) => {
      event.preventDefault();
      this.touchSteer = 0;
      this.touchBrake = 0;

      const rect = canvas.getBoundingClientRect();
      for (const touch of Array.from(event.touches)) {
        const x = (touch.clientX - rect.left) / rect.width;
        const y = (touch.clientY - rect.top) / rect.height;
        if (y > 0.58 && x < 0.34) this.touchSteer = -1;
        if (y > 0.58 && x > 0.66) this.touchSteer = 1;
        if (y > 0.58 && x >= 0.34 && x <= 0.66) this.touchBrake = 1;
      }
    };

    const startTouches = (event: TouchEvent) => {
      this.touchPressed = true;
      updateTouches(event);
    };

    const clearTouches = () => {
      this.touchSteer = 0;
      this.touchBrake = 0;
    };

    canvas.addEventListener('touchstart', startTouches, { passive: false });
    canvas.addEventListener('touchmove', updateTouches, { passive: false });
    canvas.addEventListener('touchend', updateTouches, { passive: false });
    canvas.addEventListener('touchcancel', clearTouches);
  }

  /** True while the key is held down. */
  isHeld(code: string): boolean {
    return this.held.has(code);
  }

  /** True only on the first frame the key was pressed. */
  wasPressed(code: string): boolean {
    return this.justPressed.has(code);
  }

  /** True on the first frame any touch starts. */
  get wasTouchPressed(): boolean {
    return this.touchPressed;
  }

  /** Key codes pressed during the current frame. */
  get pressedCodes(): readonly string[] {
    return [...this.justPressed];
  }

  /** Text typed during the current frame, already uppercased. */
  get typedChars(): string {
    return this.typed;
  }

  /** True only on the first frame the key was released. */
  wasReleased(code: string): boolean {
    return this.justReleased.has(code);
  }

  /** Steering input: -1 (left), 0 (none), +1 (right). */
  get steerAxis(): number {
    const left = this.isHeld('ArrowLeft') || this.isHeld('KeyA') ? -1 : 0;
    const right = this.isHeld('ArrowRight') || this.isHeld('KeyD') ? 1 : 0;
    return left + right + this.touchSteer;
  }

  /** Brake input: 1 while braking, 0 otherwise. */
  get brakeAxis(): number {
    return this.isHeld('ArrowDown') || this.isHeld('KeyS') || this.touchBrake > 0 ? 1 : 0;
  }

  /** Call once at the end of each frame to clear per-frame sets. */
  flush(): void {
    this.justPressed.clear();
    this.justReleased.clear();
    this.typed = '';
    this.touchPressed = false;
  }
}
