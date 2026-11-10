import * as THREE from 'three';
import type { PieceType } from '../domain/types';
import type { BoardView } from '../rendering/boardView';
import { PieceView } from '../rendering/pieces/pieceView';
import type { Stage } from '../rendering/stage';

/** Lines up every piece type (both colours) in monster form, armed for visual tuning. */
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
      p.armed = monster ? 1 : 0;
      if (p.figure && monster) {
        // The bishop, queen and king come alive as a tin soldier, a lady and a lord.
        p.monster = 0;
        p.mouth = 0;
        p.avatar = 1;
      }
      if (t === 'n' && monster) {
        // The knight's battle form is a mounted rider, not a spider.
        p.monster = 0;
        p.mouth = 0;
        p.mounted = 1;
      }
      lab.add(p.root);
      pieces.push(p);
    }
  });
  stage.scene.add(lab);
  stage.onFrame((dt) => pieces.forEach((p) => p.update(dt)));
  stage.camera.position.set(0.5, 3.2, 7.4);
  stage.controls.target.set(0, 0.6, 0);
  /** Shows a single lab piece up close: `focusLab(index, yaw, distance, height)`. */
  stage.controls.minDistance = 1;
  const focusLab = (i: number, yaw = 0.9, dist = 2.4, h = 1.1): string => {
    pieces.forEach((p, j) => (p.root.visible = j === i));
    const p = pieces[i];
    p.root.rotation.y = yaw;
    const pos = p.root.position;
    stage.controls.target.set(pos.x, 0.6, pos.z);
    stage.camera.position.set(pos.x, h, pos.z + dist);
    return p.type + p.color;
  };
  Object.assign(window, { lab: pieces, focusLab });
}
