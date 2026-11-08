/**
 * Procedural sound effects built with the Web Audio API: no audio files, so no
 * licensing concerns. The context is created lazily on the first user gesture.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private droneStarted = false;
  muted = false;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.startDrone();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  select(): void {
    this.tone(660, 0.08, 'triangle', 0.15, 990);
  }

  invalid(): void {
    this.tone(160, 0.15, 'square', 0.08, 120);
  }

  step(): void {
    this.noise(0.08, 0.25, 300, 'lowpass');
    this.tone(90, 0.1, 'sine', 0.25, 60);
  }

  skitter(): void {
    for (let i = 0; i < 4; i++) setTimeout(() => this.noise(0.03, 0.12, 2500 + Math.random() * 2000, 'bandpass'), i * 45);
  }

  crack(): void {
    this.noise(0.25, 0.4, 4000, 'highpass');
    this.tone(220, 0.25, 'sawtooth', 0.12, 55);
  }

  growl(duration = 1.1, pitch = 70): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.5, t + 0.08);
    out.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.linearRampToValueAtTime(1400, t + duration * 0.3);
    filter.frequency.linearRampToValueAtTime(200, t + duration);
    filter.Q.value = 6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 28;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 25;
    lfo.connect(lfoGain);
    for (const detune of [-14, 0, 9]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(pitch, t);
      osc.frequency.linearRampToValueAtTime(pitch * 1.6, t + duration * 0.35);
      osc.frequency.linearRampToValueAtTime(pitch * 0.7, t + duration);
      osc.detune.value = detune * 10;
      lfoGain.connect(osc.frequency);
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + duration);
    }
    lfo.start(t);
    lfo.stop(t + duration);
    filter.connect(out).connect(this.master);
    this.noise(duration * 0.8, 0.15, 900, 'bandpass');
  }

  roar(): void {
    this.growl(1.6, 55);
    this.noise(1.2, 0.35, 600, 'bandpass');
  }

  chomp(): void {
    this.noise(0.12, 0.6, 1800, 'bandpass');
    this.tone(120, 0.12, 'square', 0.25, 40);
    setTimeout(() => this.noise(0.08, 0.35, 5000, 'highpass'), 40);
  }

  swallow(): void {
    this.tone(260, 0.5, 'sine', 0.3, 70);
    this.noise(0.4, 0.15, 400, 'lowpass');
  }

  whoosh(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(3000, t + 0.25);
    f.frequency.exponentialRampToValueAtTime(400, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.6);
  }

  impact(): void {
    this.tone(70, 0.5, 'sine', 0.6, 30);
    this.noise(0.3, 0.5, 500, 'lowpass');
  }

  magic(): void {
    for (let i = 0; i < 5; i++) this.tone(880 * 1.26 ** i, 0.5, 'sine', 0.06, 880 * 1.26 ** i * 1.5, i * 0.05);
  }

  check(): void {
    this.tone(440, 0.25, 'sawtooth', 0.12, 415);
    this.tone(554, 0.25, 'sawtooth', 0.1, 523, 0.05);
  }

  fanfare(win: boolean): void {
    const notes = win ? [392, 523, 659, 784] : [330, 311, 294, 220];
    notes.forEach((n, i) => this.tone(n, 0.45, 'triangle', 0.2, n, i * 0.18));
  }

  private startDrone(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.droneStarted) return;
    this.droneStarted = true;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 400;
    for (const freq of [55, 82.4, 110.5]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.connect(f);
      o.start();
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lg = ctx.createGain();
    lg.gain.value = 180;
    lfo.connect(lg).connect(f.frequency);
    lfo.start();
    f.connect(g).connect(this.master);
  }

  private tone(freq: number, duration: number, type: OscillatorType, volume: number, endFreq = freq, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  private noise(duration: number, volume: number, freq: number, type: BiquadFilterType): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + duration + 0.05);
  }
}
