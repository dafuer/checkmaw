import { describe, expect, it } from 'vitest';
import { CAMERA_MODES, cameraPose, followsTurn, nextCameraMode, readCameraMode, type CameraMode } from '../../src/rendering/cameraModes';

describe('camera modes', () => {
  it('offers auto, free view and preset views, auto first', () => {
    expect(CAMERA_MODES[0]).toBe('auto');
    expect(CAMERA_MODES).toEqual(expect.arrayContaining(['auto', 'free', 'top', 'side', 'corner', 'orbit']));
  });

  it('cycles through every mode and wraps around', () => {
    let mode: CameraMode = CAMERA_MODES[0];
    const seen = new Set<string>();
    for (let i = 0; i < CAMERA_MODES.length; i++) {
      seen.add(mode);
      mode = nextCameraMode(mode);
    }
    expect(seen.size).toBe(CAMERA_MODES.length);
    expect(mode).toBe(CAMERA_MODES[0]);
  });

  it('auto looks from the side to move; only auto follows the turn', () => {
    expect(cameraPose('auto', 'w')!.position.z).toBeGreaterThan(0);
    expect(cameraPose('auto', 'b')!.position.z).toBeLessThan(0);
    expect(followsTurn('auto')).toBe(true);
    for (const m of CAMERA_MODES.filter((m) => m !== 'auto')) expect(followsTurn(m)).toBe(false);
  });

  it('top looks straight down, side looks across the files, free keeps the camera', () => {
    const top = cameraPose('top', 'w')!;
    expect(Math.hypot(top.position.x, top.position.z)).toBeLessThan(0.1);
    expect(top.position.y).toBeGreaterThan(10);
    const side = cameraPose('side', 'b')!;
    expect(Math.abs(side.position.x)).toBeGreaterThan(Math.abs(side.position.z));
    expect(cameraPose('free', 'w')).toBeNull();
  });

  it('restores a saved mode and ignores unknown values', () => {
    expect(readCameraMode('top')).toBe('top');
    expect(readCameraMode('drone')).toBe('auto');
    expect(readCameraMode(null)).toBe('auto');
  });
});
