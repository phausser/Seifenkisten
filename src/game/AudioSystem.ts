type OscType = OscillatorType;

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private enabled = true;

  // Persistent squeal chain (created once, gain driven each frame)
  private squealGain:   GainNode | null = null;
  private squealFilter: BiquadFilterNode | null = null;

  // Preloaded drive-start MP3
  private driveBuffer: AudioBuffer | null = null;
  private driveLoadPromise: Promise<void> | null = null;

  resume(): void {
    const audio = this.getContext();
    if (audio.state !== 'running') void audio.resume();
    this.preloadDrive();
  }

  private preloadDrive(): void {
    if (this.driveBuffer || this.driveLoadPromise || !this.enabled) return;
    this.driveLoadPromise = (async () => {
      try {
        const res = await fetch('sounds/Soapbox-Riot-Run.mp3');
        const buf = await res.arrayBuffer();
        const audio = this.getContext();
        this.driveBuffer = await audio.decodeAudioData(buf);
      } catch {
        // Sound nicht verfügbar — Spiel läuft trotzdem
      }
    })();
  }

  driveStart(): void {
    if (!this.enabled || !this.driveBuffer) return;
    try {
      const audio = this.getContext();
      if (audio.state !== 'running') return;
      const src = audio.createBufferSource();
      src.buffer = this.driveBuffer;
      src.connect(audio.destination);
      src.start();
    } catch {
      this.enabled = false;
    }
  }

  start(): void {
    this.tone(440, 0.07, 0.035, 'square');
    this.tone(660, 0.11, 0.025, 'square');
  }

  countdown(): void {
    this.tone(520, 0.06, 0.025, 'square');
  }

  crash(): void {
    this.tone(95, 0.18, 0.10, 'sawtooth');
    this.noise(0.16, 0.09);
  }

  finish(): void {
    this.tone(523, 0.07, 0.035, 'triangle');
    this.tone(659, 0.13, 0.035, 'triangle');
    this.tone(784, 0.20, 0.04, 'triangle');
  }

  save(): void {
    this.tone(740, 0.06, 0.025, 'square');
    this.tone(988, 0.11, 0.025, 'square');
  }

  /**
   * Continuous tire-squeal effect.
   * Call every frame with intensity 0–1; fades in/out smoothly.
   * intensity = 0 → silent, 1 → full squeal.
   */
  squeal(intensity: number): void {
    if (!this.enabled) return;
    try {
      const audio = this.getContext();
      if (audio.state !== 'running') return;

      // Lazy init: looping noise → very high-Q bandpass → gain.
      // A Q of ~35 makes the bandpass so resonant it "rings" at one frequency,
      // turning noise into a harsh, gritty squeal — neither wind nor whistle.
      if (!this.squealGain) {
        const SR  = audio.sampleRate;
        const buf = audio.createBuffer(1, SR * 0.3, SR);
        const d   = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

        const src = audio.createBufferSource();
        src.buffer = buf;
        src.loop   = true;

        // Very high Q: noise becomes a harsh resonant screech
        this.squealFilter = audio.createBiquadFilter();
        this.squealFilter.type            = 'bandpass';
        this.squealFilter.frequency.value = 700;
        this.squealFilter.Q.value         = 35;

        this.squealGain = audio.createGain();
        this.squealGain.gain.value = 0;

        src.connect(this.squealFilter);
        this.squealFilter.connect(this.squealGain);
        this.squealGain.connect(audio.destination);
        src.start();
      }

      // Keep volume low — this texture carries even at low gain
      const target = Math.min(1, intensity) * 0.09;
      this.squealGain.gain.setTargetAtTime(target, audio.currentTime, 0.06);

      // Frequency creeps up as the drift intensifies (700 → 1 000 Hz)
      if (intensity > 0 && this.squealFilter) {
        this.squealFilter.frequency.setTargetAtTime(
          700 + intensity * 300, audio.currentTime, 0.12,
        );
      }
    } catch {
      this.enabled = false;
    }
  }

  private getContext(): AudioContext {
    if (this.ctx) return this.ctx;
    this.ctx = new AudioContext();
    return this.ctx;
  }

  private tone(freq: number, delay: number, gain: number, type: OscType): void {
    if (!this.enabled) return;
    try {
      const audio = this.getContext();
      const start = audio.currentTime + delay;
      const osc = audio.createOscillator();
      const amp = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.connect(amp);
      amp.connect(audio.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    } catch {
      this.enabled = false;
    }
  }

  private noise(delay: number, gain: number): void {
    if (!this.enabled) return;
    try {
      const audio = this.getContext();
      const start = audio.currentTime + delay;
      const buffer = audio.createBuffer(1, audio.sampleRate * 0.12, audio.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const source = audio.createBufferSource();
      const amp = audio.createGain();
      source.buffer = buffer;
      amp.gain.setValueAtTime(gain, start);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
      source.connect(amp);
      amp.connect(audio.destination);
      source.start(start);
    } catch {
      this.enabled = false;
    }
  }
}
