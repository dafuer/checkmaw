import { GameController } from './app/gameController';
import { Sfx } from './audio/sfx';
import { Board } from './rendering/board';
import { BoardView } from './rendering/boardView';
import { Stage } from './rendering/stage';
import { Hud } from './ui/hud';

const container = document.getElementById('app')!;
const stage = new Stage(container);
const sfx = new Sfx();
const board = new Board();
stage.scene.add(board.group);
stage.onFrame((dt) => board.update(dt));

let controller: GameController | null = null;
const hud = new Hud(container, {
  onUndo: () => controller?.undo(),
  onRestart: () => controller?.restart(),
  onToggleCinematics: (on) => (view.cinematics = on),
  onToggleSound: (on) => sfx.setMuted(!on),
  onToggleAutoCamera: (on) => controller?.setAutoCamera(on),
});
const view = new BoardView(stage, sfx, {
  letterbox: (on) => hud.letterbox(on),
  caption: (text) => hud.caption(text),
});
stage.scene.add(view.group);

controller = new GameController(stage, board, view, hud, sfx);
controller.start();
stage.start();

// Debug lab: `#lab` shows every monster form up close, `#lab-closed` the pieces.
if (location.hash.startsWith('#lab')) void import('./debug/lab').then((m) => m.openLab(stage, view, location.hash === '#lab'));

// Exposed for debugging and automated visual checks.
(window as unknown as { chess: unknown }).chess = { controller, stage, view };
