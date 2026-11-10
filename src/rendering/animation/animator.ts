export type Easing = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  inBack: (t: number) => {
    const c1 = 1.70158;
    return (c1 + 1) * t * t * t - c1 * t * t;
  },
  outElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  outBounce: (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
} satisfies Record<string, Easing>;

interface Tween {
  elapsed: number;
  duration: number;
  easing: Easing;
  onUpdate: (t: number) => void;
  resolve: () => void;
}

type Ticker = (dt: number, time: number) => void | boolean;

/**
 * Frame-driven timeline. Tweens resolve promises so sequences read as async code.
 * `speed` scales every tween, which lets the UI fast-forward cinematics.
 */
export class Animator {
  speed = 1;
  /** Temporary slow-down (hit-stop, slow motion): factor and real seconds left. */
  private warp = 1;
  private warpLeft = 0;
  private tweens: Tween[] = [];
  private tickers = new Set<Ticker>();
  private time = 0;

  tween(duration: number, onUpdate: (t: number) => void, easing: Easing = ease.inOutQuad): Promise<void> {
    return new Promise((resolve) => {
      if (duration <= 0) {
        onUpdate(1);
        resolve();
        return;
      }
      onUpdate(0);
      this.tweens.push({ elapsed: 0, duration, easing, onUpdate, resolve });
    });
  }

  wait(duration: number): Promise<void> {
    return this.tween(duration, () => {}, ease.linear);
  }

  /** Runs every frame until it returns true or the returned disposer is called. */
  every(ticker: Ticker): () => void {
    this.tickers.add(ticker);
    return () => this.tickers.delete(ticker);
  }

  get now(): number {
    return this.time;
  }

  /** How fast animation time runs right now: the player's speed times any active warp. */
  get scale(): number {
    return this.speed * (this.warpLeft > 0 ? this.warp : 1);
  }

  /**
   * Runs everything at `factor` speed for `realSeconds` of wall-clock time: a
   * few frozen frames sell an impact, a longer stretch is slow motion.
   * Fast-forwarding shortens it.
   */
  warpTime(factor: number, realSeconds: number): void {
    this.warp = factor;
    this.warpLeft = realSeconds;
  }

  /** How many tweens and tickers are still running (for leak checks). */
  get pending(): { tweens: number; tickers: number } {
    return { tweens: this.tweens.length, tickers: this.tickers.size };
  }

  update(rawDt: number): void {
    const dt = rawDt * this.scale;
    if (this.warpLeft > 0) {
      this.warpLeft -= rawDt * Math.max(1, this.speed);
      if (this.warpLeft < 1e-9) this.warpLeft = 0;
    }
    this.time += dt;
    const active = this.tweens;
    this.tweens = [];
    for (const tw of active) {
      tw.elapsed += dt;
      const p = Math.min(1, tw.elapsed / tw.duration);
      tw.onUpdate(tw.easing(p));
      if (p >= 1) tw.resolve();
      else this.tweens.push(tw);
    }
    for (const ticker of [...this.tickers]) {
      if (ticker(dt, this.time) === true) this.tickers.delete(ticker);
    }
  }
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
