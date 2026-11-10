import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { PieceType } from '../../src/domain/types';
import { Gear, gearSpec, hasGear } from '../../src/rendering/pieces/gear';
import { createMaterials } from '../../src/rendering/pieces/materials';
import { PieceView } from '../../src/rendering/pieces/pieceView';
import { SHAPES } from '../../src/rendering/pieces/profiles';

const TYPES: PieceType[] = ['p', 'n', 'b', 'r', 'q', 'k'];

/** Right shoulder group of a gear rig (first arm built). */
function rightShoulder(gear: Gear) {
  return gear.group.children[0];
}

describe('gear', () => {
  it('arms every piece type except the knight, which rides a horse instead', () => {
    expect(TYPES.filter(hasGear)).toEqual(['p', 'r']);
    for (const t of TYPES) {
      const view = new PieceView(`t-${t}`, t, 'w');
      expect(view.gear !== null).toBe(t !== 'n');
      expect(view.mount !== null).toBe(t === 'n');
      expect(view.figure !== null).toBe(t === 'b' || t === 'q' || t === 'k');
    }
  });

  it('is hidden until it grows out', () => {
    const gear = new Gear(gearSpec('p'), 'w', createMaterials('w'));
    gear.apply(0, 0, 0);
    expect(gear.group.visible).toBe(false);
    gear.out = 1;
    gear.apply(0, 0, 0);
    expect(gear.group.visible).toBe(true);
  });

  it('raises the weapon arm overhead when the raise weight is 1', () => {
    const gear = new Gear(gearSpec('p'), 'b', createMaterials('b'));
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

    const pawn = new PieceView('p1', 'p', 'w');
    pawn.monster = 1;
    pawn.armed = 1;
    pawn.gear!.pose.strike = 1;
    pawn.resetPose();
    expect([pawn.monster, pawn.armed, pawn.gear!.pose.strike]).toEqual([0, 0, 0]);

    const bishop = new PieceView('b1', 'b', 'w');
    bishop.avatar = 1;
    bishop.gear!.pose.guard = 1;
    bishop.resetPose();
    expect([bishop.avatar, bishop.gear!.pose.guard]).toEqual([0, 0]);
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

describe('the bishop tin soldier', () => {
  it('replaces the piece and carries the great sword and kite shield', () => {
    const bishop = new PieceView('b2', 'b', 'b');
    bishop.avatar = 1;
    bishop.apply();
    expect(bishop.body.visible).toBe(false);
    expect(bishop.figure!.group.visible).toBe(true);
    expect(bishop.gear!.spec.right.item).toBe('greatsword');
    expect(bishop.gear!.spec.left.item).toBe('kite');
    // Its sword is always in hand: it has no scabbard.
    expect(bishop.gear!.item(0).visible).toBe(true);
  });

  it('marches with stiff knees, one leg forward and one back', () => {
    const bishop = new PieceView('b3', 'b', 'w');
    bishop.avatar = 1;
    bishop.gait = 1;
    bishop.gaitPhase = Math.PI / 2;
    bishop.apply();
    const hips = bishop.figure!.group.children.filter((c) => c.userData.hip);
    expect(hips).toHaveLength(2);
    expect(Math.sign(hips[0].rotation.x)).toBe(-Math.sign(hips[1].rotation.x));
    for (const hip of hips) {
      const knee = hip.children.find((c) => c.userData.knee)!;
      expect(knee.rotation.x).toBe(0);
    }
  });
});

describe('queen and king figures', () => {
  it('replace the chess piece as they come alive', () => {
    const queen = new PieceView('q1', 'q', 'w');
    queen.apply();
    expect(queen.body.visible).toBe(true);
    expect(queen.figure!.group.visible).toBe(false);
    queen.avatar = 1;
    queen.apply();
    expect(queen.body.visible).toBe(false);
    expect(queen.figure!.group.visible).toBe(true);
  });

  it('keep the king sword in its scabbard until he draws it', () => {
    const king = new PieceView('k1', 'k', 'b');
    king.avatar = 1;
    king.apply();
    const hand = king.gear!.item(0);
    expect(hand.visible).toBe(false);
    king.figure!.drawn = 1;
    king.apply();
    expect(hand.visible).toBe(true);
    king.resetPose();
    king.apply();
    expect(hand.visible).toBe(false);
  });
});

describe('two-legged monsters (pawn gnasher and rook brute)', () => {
  const feetHeights = (rook: PieceView): number[] => {
    rook.root.updateMatrixWorld(true);
    const ys: number[] = [];
    rook.root.traverse((o) => {
      if (o.userData.foot) ys.push(o.getWorldPosition(new THREE.Vector3()).y);
    });
    return ys;
  };

  for (const type of ['p', 'r'] as const) {
    it(`${type}: plants both feet on the floor in monster form`, () => {
      const piece = new PieceView(`${type}1`, type, 'w');
      piece.monster = 1;
      piece.apply();
      const ys = feetHeights(piece);
      expect(ys).toHaveLength(2);
      for (const y of ys) expect(Math.abs(y)).toBeLessThan(0.05);
    });

    it(`${type}: lifts one foot at a time while walking`, () => {
      const piece = new PieceView(`${type}2`, type, 'b');
      piece.monster = 1;
      piece.gait = 1;
      piece.gaitPhase = 0;
      piece.apply();
      const [a, b] = feetHeights(piece);
      expect(Math.max(a, b)).toBeGreaterThan(0.06);
      expect(Math.min(a, b)).toBeLessThan(0.05);
    });
  }

  it('no piece walks on spider legs any more', () => {
    for (const type of TYPES) expect(SHAPES[type].traits.biped || type === 'n' || ['b', 'q', 'k'].includes(type)).toBe(true);
  });
});
