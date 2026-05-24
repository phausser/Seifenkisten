type OscType = OscillatorType;

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private enabled = true;

  resume(): void {
    const audio = this.getContext();
    if (audio.state !== 'running') void audio.resume();
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
