/**
 * Tracks keyboard state for each frame.
 * Keys are stored by their KeyboardEvent.code value.
 */
export class InputHandler {
  private held = new Set<string>();
  private justPressed = new Set<string>();
  private justReleased = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (!this.held.has(e.code)) {
        this.justPressed.add(e.code);
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

  /** True while the key is held down. */
  isHeld(code: string): boolean {
    return this.held.has(code);
  }

  /** True only on the first frame the key was pressed. */
  wasPressed(code: string): boolean {
    return this.justPressed.has(code);
  }

  /** Key codes pressed during the current frame. */
  get pressedCodes(): readonly string[] {
    return [...this.justPressed];
  }

  /** True only on the first frame the key was released. */
  wasReleased(code: string): boolean {
    return this.justReleased.has(code);
  }

  /** Steering input: -1 (left), 0 (none), +1 (right). */
  get steerAxis(): number {
    const left = this.isHeld('ArrowLeft') || this.isHeld('KeyA') ? -1 : 0;
    const right = this.isHeld('ArrowRight') || this.isHeld('KeyD') ? 1 : 0;
    return left + right;
  }

  /** Call once at the end of each frame to clear per-frame sets. */
  flush(): void {
    this.justPressed.clear();
    this.justReleased.clear();
  }
}
