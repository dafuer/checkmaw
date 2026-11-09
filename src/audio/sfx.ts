import { CalmMusic } from './music';

/**
 * Procedural sound effects built with the Web Audio API: no audio files, so no
 * licensing concerns. The context is created lazily on the first user gesture.
 */
/**
 * Per-sound gain, measured offline (OfflineAudioContext peak analysis) so every
 * effect lands near its intended loudness: big beats (roar, impact) around
 * 0.35-0.5 peak, hits around 0.25, ambience (hooves, steps, glitter) quieter.
 */
const LEVELS = {
  select: 3.2, invalid: 5, step: 2.5, skitter: 2, crack: 2.5, growl: 0.8, roar: 0.8, chomp: 2,
  swallow: 2, whoosh: 1.5, impact: 2, magic: 2, check: 2.8, fanfare: 1.5, clang: 3, slash: 4.3,
  clop: 4.8, stomp: 1.7, zap: 2.2, neigh: 3, splat: 4.4, unsheathe: 2.2, sheathe: 2.5, shimmer: 6,
} as const;

export type SoundName = keyof typeof LEVELS;

/** Background sound: the arena's dark drone or the meadow's calm music. */
export type Mood = 'arena' | 'meadow';

export class Sfx {
  private ctx: BaseAudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private droneStarted = false;
  private droneGain: GainNode | null = null;
  private music: CalmMusic | null = null;
  private mood: Mood = 'arena';
  /** Gain node of the sound being built (see play()); null means straight to master. */
  private bus: AudioNode | null = null;
  muted = false;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx instanceof AudioContext && this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.attach(new Ctor());
    this.startDrone();
    this.setMood(this.mood);
  }

  /**
   * Renders one sound offline and measures it: peak amplitude, RMS level and
   * audible length. Used to balance LEVELS without listening (see
   * `chess.soundCheck()` in the console).
   */
  static async measure(name: SoundName | 'growl', sampleRate = 44100): Promise<{ peak: number; rmsDb: number; seconds: number }> {
    const ctx = new OfflineAudioContext(1, sampleRate * 2.5, sampleRate);
    const sfx = new Sfx();
    sfx.attach(ctx);
    if (name === 'fanfare') sfx.fanfare(true);
    else (sfx[name] as () => void)();
    const samples = (await ctx.startRendering()).getChannelData(0);
    let peak = 0;
    let sum = 0;
    let last = 0;
    for (let i = 0; i < samples.length; i++) {
      const a = Math.abs(samples[i]);
      if (a > peak) peak = a;
      sum += samples[i] * samples[i];
      if (a > 0.01) last = i;
    }
    const rms = Math.sqrt(sum / Math.max(1, last));
    return { peak, rmsDb: 20 * Math.log10(rms + 1e-9), seconds: last / sampleRate };
  }

  static get sounds(): SoundName[] {
    return Object.keys(LEVELS) as SoundName[];
  }

  private attach(ctx: BaseAudioContext): void {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  /** Crossfades the background between the arena drone and the meadow music. */
  setMood(mood: Mood): void {
    this.mood = mood;
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    this.droneGain?.gain.setTargetAtTime(mood === 'arena' ? 0.05 : 0, ctx.currentTime, 0.8);
    if (mood === 'meadow') {
      this.music ??= new CalmMusic(ctx, this.master);
      this.music.start();
    } else {
      this.music?.stop();
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  select(): void {
    this.play('select', () => {
      this.tone(660, 0.08, 'triangle', 0.15, 990);
    });
  }

  invalid(): void {
    this.play('invalid', () => {
      this.tone(160, 0.15, 'square', 0.08, 120);
    });
  }

  step(): void {
    this.play('step', () => {
      this.noise(0.08, 0.25, 300, 'lowpass');
      this.tone(90, 0.1, 'sine', 0.25, 60);
    });
  }

  skitter(): void {
    this.play('skitter', () => {
      for (let i = 0; i < 4; i++) this.noise(0.03, 0.12, 2500 + Math.random() * 2000, 'bandpass', i * 0.045);
    });
  }

  crack(): void {
    this.play('crack', () => {
      this.noise(0.25, 0.4, 4000, 'highpass');
      this.tone(220, 0.25, 'sawtooth', 0.12, 55);
    });
  }

  growl(duration = 1.1, pitch = 70): void {
    this.play('growl', () => this.growlVoice(duration, pitch));
  }

  private growlVoice(duration: number, pitch: number): void {
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
    filter.connect(out).connect(this.output());
    this.noise(duration * 0.8, 0.15, 900, 'bandpass');
  }

  roar(): void {
    this.play('roar', () => {
      this.growlVoice(1.6, 55);
      this.noise(1.2, 0.35, 600, 'bandpass');
    });
  }

  chomp(): void {
    this.play('chomp', () => {
      this.noise(0.12, 0.6, 1800, 'bandpass');
      this.tone(120, 0.12, 'square', 0.25, 40);
      this.noise(0.08, 0.35, 5000, 'highpass', 0.04);
    });
  }

  swallow(): void {
    this.play('swallow', () => {
      this.tone(260, 0.5, 'sine', 0.3, 70);
      this.noise(0.4, 0.15, 400, 'lowpass');
    });
  }

  whoosh(): void {
    this.play('whoosh', () => {
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
      src.connect(f).connect(g).connect(this.output());
      src.start(t);
      src.stop(t + 0.6);
    });
  }

  impact(): void {
    this.play('impact', () => {
      this.tone(70, 0.5, 'sine', 0.6, 30);
      this.noise(0.3, 0.5, 500, 'lowpass');
    });
  }

  magic(): void {
    this.play('magic', () => {
      for (let i = 0; i < 5; i++) this.tone(880 * 1.26 ** i, 0.5, 'sine', 0.06, 880 * 1.26 ** i * 1.5, i * 0.05);
    });
  }

  check(): void {
    this.play('check', () => {
      this.tone(440, 0.25, 'sawtooth', 0.12, 415);
      this.tone(554, 0.25, 'sawtooth', 0.1, 523, 0.05);
    });
  }

  fanfare(win: boolean): void {
    this.play('fanfare', () => {
      const notes = win ? [392, 523, 659, 784] : [330, 311, 294, 220];
      notes.forEach((n, i) => this.tone(n, 0.45, 'triangle', 0.2, n, i * 0.18));
    });
  }

  /** Metal on metal: blade against shield or blade. */
  clang(): void {
    this.play('clang', () => {
      for (const f of [1240, 1870, 2630]) this.tone(f, 0.45, 'triangle', 0.07, f * 0.98);
      this.noise(0.06, 0.4, 6000, 'highpass');
    });
  }

  /** A blade cutting the air. */
  slash(): void {
    this.play('slash', () => {
      this.noise(0.18, 0.35, 3200, 'bandpass');
      this.tone(1800, 0.15, 'sawtooth', 0.04, 500);
    });
  }

  /** One hoof beat. */
  clop(): void {
    this.play('clop', () => {
      this.tone(420 + Math.random() * 80, 0.05, 'square', 0.08, 180);
      this.noise(0.04, 0.2, 1500, 'bandpass');
    });
  }

  /** Heavy footstep of a giant. */
  stomp(): void {
    this.play('stomp', () => {
      this.tone(48, 0.4, 'sine', 0.7, 28);
      this.noise(0.25, 0.4, 260, 'lowpass');
    });
  }

  /** Crackling lightning bolt. */
  zap(): void {
    this.play('zap', () => {
      for (let i = 0; i < 6; i++) this.noise(0.05, 0.35, 2000 + Math.random() * 5000, 'bandpass', i * 0.03);
      this.tone(90, 0.35, 'sawtooth', 0.2, 40);
    });
  }

  /** Horse whinny. */
  neigh(): void {
    this.play('neigh', () => {
      this.tone(700, 0.18, 'sawtooth', 0.08, 1100);
      this.tone(1100, 0.5, 'sawtooth', 0.07, 520, 0.16);
    });
  }

  /** A comic flattening splat. */
  splat(): void {
    this.play('splat', () => {
      this.noise(0.25, 0.55, 700, 'lowpass');
      this.tone(160, 0.3, 'square', 0.12, 50);
    });
  }

  /** Sword leaving its scabbard: a rising metallic ring. */
  unsheathe(): void {
    this.play('unsheathe', () => {
      this.noise(0.35, 0.25, 5000, 'highpass');
      this.tone(900, 0.5, 'triangle', 0.08, 2600);
      this.tone(1800, 0.6, 'sine', 0.05, 3400, 0.05);
    });
  }

  /** Sword sliding home: a short scrape and click. */
  sheathe(): void {
    this.play('sheathe', () => {
      this.noise(0.2, 0.2, 3500, 'bandpass');
      this.tone(2400, 0.06, 'square', 0.06, 1800, 0.18);
    });
  }

  /** A soft glittering chime (the queen's footsteps). */
  shimmer(): void {
    this.play('shimmer', () => {
      const f = 1800 + Math.random() * 1600;
      this.tone(f, 0.35, 'sine', 0.025, f * 1.5);
    });
  }

  /** Builds one sound into its own gain stage at the level from LEVELS. */
  private play(name: SoundName, build: () => void): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const gain = ctx.createGain();
    gain.gain.value = LEVELS[name];
    gain.connect(this.master);
    this.bus = gain;
    try {
      build();
    } finally {
      this.bus = null;
    }
  }

  private output(): AudioNode {
    return this.bus ?? this.master!;
  }

  private startDrone(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.droneStarted) return;
    this.droneStarted = true;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    this.droneGain = g;
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
    osc.connect(g).connect(this.output());
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  private noise(duration: number, volume: number, freq: number, type: BiquadFilterType, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(f).connect(g).connect(this.output());
    src.start(t, Math.random());
    src.stop(t + duration + 0.05);
  }
}
