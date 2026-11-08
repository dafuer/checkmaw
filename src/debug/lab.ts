import * as THREE from 'three';
import type { PieceType } from '../domain/types';
import type { BoardView } from '../rendering/boardView';
import { PieceView } from '../rendering/pieces/pieceView';
import type { Stage } from '../rendering/stage';

/** Lines up every piece type (both colours) in monster form for visual tuning. */
export function openLab(stage: Stage, view: BoardView, monster: boolean): void {
  view.group.visible = false;
  const lab = new THREE.Group();
  const types: PieceType[] = ['p', 'n', 'b', 'r', 'q', 'k'];
  const pieces: PieceView[] = [];
  types.forEach((t, i) => {
    for (const color of ['w', 'b'] as const) {
      const p = new PieceView(`lab-${color}${t}`, t, color);
      p.root.position.set(-3 + i * 1.2, 0, color === 'w' ? 0.9 : -0.9);
      p.root.rotation.y = 0.5;
      p.monster = monster ? 1 : 0;
      p.mouth = monster ? 0.85 : 0;
      p.tentacleReach = 0;
      lab.add(p.root);
      pieces.push(p);
    }
  });
  stage.scene.add(lab);
  stage.onFrame((dt) => pieces.forEach((p) => p.update(dt)));
  stage.camera.position.set(0.5, 3.2, 7.4);
  stage.controls.target.set(0, 0.6, 0);
  (window as unknown as { lab: PieceView[] }).lab = pieces;
}
