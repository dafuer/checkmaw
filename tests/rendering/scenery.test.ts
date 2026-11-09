import { describe, expect, it } from 'vitest';
import { LOOKS, readScene, SCENES } from '../../src/rendering/scenery';

describe('scenery', () => {
  it('keeps the dark arena as the default and offers the mountain meadow', () => {
    expect(SCENES).toEqual(['arena', 'meadow']);
    expect(readScene(null)).toBe('arena');
    expect(readScene('meadow')).toBe('meadow');
    expect(readScene('moon')).toBe('arena');
  });

  it('lights the meadow brighter and with less glow than the arena', () => {
    const { arena, meadow } = LOOKS;
    expect(meadow.bloom).toBeLessThan(arena.bloom);
    expect(meadow.hemisphere.intensity).toBeGreaterThan(arena.hemisphere.intensity);
    expect(meadow.background.getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThan(arena.background.getHSL({ h: 0, s: 0, l: 0 }).l);
  });
});
