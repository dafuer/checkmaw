export type Rng = () => number;

/** Small seedable generator, so a run of picks can be reproduced. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Bag {
  /** The options the bag was filled from, to notice when the offer changes. */
  signature: string;
  remaining: string[];
  last: string | null;
}

/**
 * Chooses which pre-built animation plays next. Each key (for example "the
 * pawn's finisher") deals its options like a shuffled deck: every option comes
 * up once before any repeats, and never twice in a row, so the players see the
 * whole repertoire instead of whatever a plain random number happens to favour.
 */
export class Variety {
  private readonly bags = new Map<string, Bag>();
  private readonly forced = new Map<string, string>();

  constructor(private readonly rng: Rng = Math.random) {}

  pick<T extends string>(key: string, options: readonly T[]): T {
    if (options.length === 0) throw new Error(`No options to pick from for "${key}"`);
    const forced = this.forced.get(key);
    if (forced !== undefined && options.includes(forced as T)) return forced as T;

    const signature = options.join('|');
    let bag = this.bags.get(key);
    if (!bag || bag.signature !== signature) {
      bag = { signature, remaining: [], last: null };
      this.bags.set(key, bag);
    }
    if (bag.remaining.length === 0) {
      bag.remaining = this.shuffle(options);
      // The new deal must not open with the option that closed the previous one.
      if (bag.remaining.length > 1 && bag.remaining[bag.remaining.length - 1] === bag.last) {
        const swapWith = Math.floor(this.rng() * (bag.remaining.length - 1));
        const top = bag.remaining.length - 1;
        [bag.remaining[top], bag.remaining[swapWith]] = [bag.remaining[swapWith], bag.remaining[top]];
      }
    }
    const pick = bag.remaining.pop() as T;
    bag.last = pick;
    return pick;
  }

  /** Debugging and visual checks: always play this option for the key (null releases it). */
  force(key: string, option: string | null): void {
    if (option === null) this.forced.delete(key);
    else this.forced.set(key, option);
  }

  /** A number in [min, max). */
  range(min: number, max: number): number {
    return min + this.rng() * (max - min);
  }

  /** -1 or 1. */
  sign(): number {
    return this.rng() < 0.5 ? -1 : 1;
  }

  private shuffle<T extends string>(options: readonly T[]): string[] {
    const deck: string[] = [...options];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }
}
