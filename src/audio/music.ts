/**
 * Gentle procedural music for the mountain meadow: a soft pad on a slow
 * I–vi–IV–V progression in C major, a sparse music-box melody from the
 * pentatonic notes of each chord, and now and then a bird. Scheduled on the
 * audio clock a little ahead of time, so timers only decide what to queue.
 */

const BPM = 72;
const BEAT = 60 / BPM;
const BEATS_PER_CHORD = 8;
const LOOKAHEAD = 0.8;

/** Chords as MIDI notes: C, Am, F, G. */
const CHORDS = [
  [48, 52, 55, 60],
  [45, 52, 57, 60],
  [41, 53, 57, 60],
  [43, 55, 59, 62],
];
/** C major pentatonic, two octaves up. */
const PENTATONIC = [72, 74, 76, 79, 81, 84, 86, 88];

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export class CalmMusic {
  private readonly out: GainNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBeat = 0;
  private beat = 0;
  private lastNote = 76;

  constructor(
    private readonly ctx: BaseAudioContext,
    destination: AudioNode,
    private readonly random: () => number = Math.random,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(destination);
  }

  get playing(): boolean {
    return this.timer !== null;
  }

  /** Fades in and keeps scheduling until stop(). */
  start(volume = 0.8): void {
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(volume, now, 1.2);
    if (this.timer) return;
    this.nextBeat = now + 0.1;
    this.beat = 0;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 200);
  }

  /** Fades out, then stops scheduling. */
  stop(): void {
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(0, now, 0.6);
    const timer = this.timer;
    this.timer = null;
    if (timer) setTimeout(() => clearInterval(timer), 2500);
  }

  /** Queues every beat that starts within the lookahead window. */
  schedule(until = this.ctx.currentTime + LOOKAHEAD): void {
    while (this.nextBeat < until) {
      this.playBeat(this.beat, this.nextBeat);
      this.nextBeat += BEAT;
      this.beat++;
    }
  }

  private playBeat(beat: number, t: number): void {
    const chord = CHORDS[Math.floor(beat / BEATS_PER_CHORD) % CHORDS.length];
    if (beat % BEATS_PER_CHORD === 0) {
      for (const note of chord) this.pad(hz(note), t, BEAT * BEATS_PER_CHORD);
      if (this.random() < 0.45) this.bird(t + BEAT * (1 + this.random() * 4));
    }
    // A sparse melody: rests keep it airy; steps stay small so it never jumps around.
    if (this.random() < 0.55) {
      const fits = PENTATONIC.filter((n) => Math.abs(n - this.lastNote) <= 5);
      const note = fits[Math.floor(this.random() * fits.length)] ?? 76;
      this.lastNote = note;
      this.pluck(hz(note), t + (this.random() < 0.25 ? BEAT / 2 : 0));
    }
  }

  private pad(freq: number, t: number, length: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.022, t + 1.2);
    g.gain.setValueAtTime(0.022, t + length - 1);
    g.gain.linearRampToValueAtTime(0.0001, t + length + 0.8);
    osc.connect(filter).connect(g).connect(this.out);
    osc.start(t);
    osc.stop(t + length + 0.9);
  }

  /** Music-box note: a sine with a bell-like overtone and a long soft decay. */
  private pluck(freq: number, t: number): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    g.connect(this.out);
    for (const [mult, level] of [[1, 1], [3.01, 0.18]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      const lg = ctx.createGain();
      lg.gain.value = level;
      osc.connect(lg).connect(g);
      osc.start(t);
      osc.stop(t + 1.7);
    }
  }

  /** Two or three quick chirps far away. */
  private bird(t: number): void {
    const ctx = this.ctx;
    const chirps = 2 + Math.floor(this.random() * 2);
    const base = 2600 + this.random() * 1400;
    for (let i = 0; i < chirps; i++) {
      const at = t + i * 0.13;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base, at);
      osc.frequency.exponentialRampToValueAtTime(base * 1.45, at + 0.07);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.012, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      osc.connect(g).connect(this.out);
      osc.start(at);
      osc.stop(at + 0.1);
    }
  }
}
