import { describe, expect, it } from 'vitest';
import type { PieceType } from '../../src/domain/types';
import { Gear, hasGear } from '../../src/rendering/pieces/gear';
import { createMaterials } from '../../src/rendering/pieces/materials';
import { PieceView } from '../../src/rendering/pieces/pieceView';

const TYPES: PieceType[] = ['p', 'n', 'b', 'r', 'q', 'k'];

/** Right shoulder group of a gear rig (first arm built). */
function rightShoulder(gear: Gear) {
  return gear.group.children[0];
}

describe('gear', () => {
  it('arms every piece type except the knight, which rides a horse instead', () => {
    expect(TYPES.filter(hasGear)).toEqual(['p', 'b', 'r', 'q', 'k']);
    for (const t of TYPES) {
      const view = new PieceView(`t-${t}`, t, 'w');
      expect(view.gear !== null).toBe(t !== 'n');
      expect(view.mount !== null).toBe(t === 'n');
    }
  });

  it('is hidden until it grows out', () => {
    const gear = new Gear('p', 'w', createMaterials('w'));
    gear.apply(0, 0, 0);
    expect(gear.group.visible).toBe(false);
    gear.out = 1;
    gear.apply(0, 0, 0);
    expect(gear.group.visible).toBe(true);
  });

  it('raises the weapon arm overhead when the raise weight is 1', () => {
    const gear = new Gear('b', 'b', createMaterials('b'));
    gear.out = 1;
    gear.apply(0, 0, 0);
    const rest = rightShoulder(gear).rotation.x;
    gear.pose.raise = 1;
    gear.apply(0, 0, 0);
    const raised = rightShoulder(gear).rotation.x;
    // Shoulder angle -PI is straight up; rest hangs near -0.25.
    expect(rest).toBeGreaterThan(-0.5);
    expect(raised).toBeLessThan(-2.5);
  });
});

describe('piece view parameters', () => {
  it('resetPose returns every monster, gear and mount parameter to rest', () => {
    const knight = new PieceView('k1', 'n', 'w');
    knight.mounted = 1;
    knight.rear = 0.7;
    knight.mouth = 0.5;
    knight.resetPose();
    expect([knight.mounted, knight.rear, knight.mouth, knight.monster]).toEqual([0, 0, 0, 0]);

    const bishop = new PieceView('b1', 'b', 'w');
    bishop.monster = 1;
    bishop.armed = 1;
    bishop.gear!.pose.strike = 1;
    bishop.resetPose();
    expect([bishop.monster, bishop.armed, bishop.gear!.pose.strike]).toEqual([0, 0, 0]);
  });

  it('places the mounted knight head in front of the horse and lifts it', () => {
    const knight = new PieceView('k2', 'n', 'b');
    knight.apply();
    expect(knight.body.position.z).toBe(0);
    knight.mounted = 1;
    knight.apply();
    expect(knight.body.position.z).toBeGreaterThan(0.2);
    expect(knight.body.position.y).toBeGreaterThan(0.3);
  });
});
