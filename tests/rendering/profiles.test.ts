import { describe, expect, it } from 'vitest';
import { radiusAt, SHAPES, splitProfile } from '../../src/rendering/pieces/profiles';

describe('piece profiles', () => {
  it('defines every piece with a mouth inside its height', () => {
    for (const shape of Object.values(SHAPES)) {
      expect(shape.mouthY).toBeGreaterThan(0.2);
      expect(shape.mouthY).toBeLessThan(shape.height);
      for (const [r] of shape.profile) expect(r).toBeGreaterThanOrEqual(0);
    }
  });

  it('interpolates the radius along the outline', () => {
    expect(radiusAt([[0, 0], [1, 1]], 0.5)).toBeCloseTo(0.5);
  });

  it('splits a profile so both halves meet at the cut', () => {
    const { lower, upper } = splitProfile([[0, 0], [1, 0], [1, 1], [0, 1]], 0.4);
    expect(lower.at(-1)).toEqual([1, 0.4]);
    expect(upper[0]).toEqual([1, 0.4]);
    expect(lower.every(([, y]) => y <= 0.4)).toBe(true);
    expect(upper.every(([, y]) => y >= 0.4)).toBe(true);
  });
});
