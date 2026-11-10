import { describe, expect, it } from 'vitest';
import { ALL_SQUARES, isLightSquare, squareToXZ, xzToSquare } from '../../src/rendering/coords';

describe('board coordinates', () => {
  it('places a1 bottom-left from white and h8 top-right', () => {
    expect(squareToXZ('a1')).toEqual({ x: -3.5, z: 3.5 });
    expect(squareToXZ('h8')).toEqual({ x: 3.5, z: -3.5 });
  });

  it('round-trips every square', () => {
    for (const sq of ALL_SQUARES) {
      const { x, z } = squareToXZ(sq);
      expect(xzToSquare(x + 0.3, z - 0.3)).toBe(sq);
    }
    expect(ALL_SQUARES).toHaveLength(64);
  });

  it('returns null outside the board and rejects invalid squares', () => {
    expect(xzToSquare(4.2, 0)).toBeNull();
    expect(xzToSquare(0, -4.1)).toBeNull();
    expect(() => squareToXZ('z9')).toThrow();
  });

  it('colours a1 dark and h1 light', () => {
    expect(isLightSquare('a1')).toBe(false);
    expect(isLightSquare('h1')).toBe(true);
  });
});
