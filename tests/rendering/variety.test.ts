import { describe, expect, it } from 'vitest';
import { mulberry32, Variety } from '../../src/rendering/battle/variety';

const OPTIONS = ['a', 'b', 'c', 'd'] as const;

describe('Variety', () => {
  it('plays every option once before repeating any', () => {
    const variety = new Variety(mulberry32(7));
    for (let round = 0; round < 5; round++) {
      const seen = new Set<string>();
      for (let i = 0; i < OPTIONS.length; i++) seen.add(variety.pick('finisher', OPTIONS));
      expect(seen.size).toBe(OPTIONS.length);
    }
  });

  it('never plays the same option twice in a row', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const variety = new Variety(mulberry32(seed));
      let last = '';
      for (let i = 0; i < 60; i++) {
        const pick = variety.pick('finisher', OPTIONS);
        expect(pick).not.toBe(last);
        last = pick;
      }
    }
  });

  it('keeps an independent rotation per key', () => {
    const variety = new Variety(mulberry32(3));
    const pawn = new Set<string>();
    const rook = new Set<string>();
    for (let i = 0; i < OPTIONS.length; i++) {
      pawn.add(variety.pick('p', OPTIONS));
      rook.add(variety.pick('r', OPTIONS));
    }
    expect(pawn.size).toBe(OPTIONS.length);
    expect(rook.size).toBe(OPTIONS.length);
  });

  it('is reproducible from its seed', () => {
    const run = (seed: number) => {
      const variety = new Variety(mulberry32(seed));
      return Array.from({ length: 12 }, () => variety.pick('k', OPTIONS)).join('');
    };
    expect(run(11)).toBe(run(11));
    expect(run(11)).not.toBe(run(12));
  });

  it('returns the only option there is, and rejects an empty list', () => {
    const variety = new Variety(mulberry32(1));
    expect(variety.pick('solo', ['x'])).toBe('x');
    expect(variety.pick('solo', ['x'])).toBe('x');
    expect(() => variety.pick('none', [])).toThrow();
  });

  it('can be forced to one option and released again', () => {
    const variety = new Variety(mulberry32(5));
    variety.force('finisher', 'c');
    expect([1, 2, 3].map(() => variety.pick('finisher', OPTIONS))).toEqual(['c', 'c', 'c']);
    // A forced name that is not on offer is ignored.
    expect(['a', 'b']).toContain(variety.pick('finisher', ['a', 'b']));
    variety.force('finisher', null);
    const seen = new Set(Array.from({ length: 8 }, () => variety.pick('finisher', OPTIONS)));
    expect(seen.size).toBe(OPTIONS.length);
  });

  it('starts a fresh rotation when the options on offer change', () => {
    const variety = new Variety(mulberry32(9));
    variety.pick('march', ['a', 'b', 'c']);
    for (let i = 0; i < 10; i++) expect(['a', 'b']).toContain(variety.pick('march', ['a', 'b']));
  });

  it('draws numbers inside the requested range', () => {
    const variety = new Variety(mulberry32(2));
    for (let i = 0; i < 50; i++) {
      const v = variety.range(-2, 3);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(3);
      expect([-1, 1]).toContain(variety.sign());
    }
  });
});
