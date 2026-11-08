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

// Title screen: the camera circles the arena until the players begin.
if (!location.hash.startsWith('#lab') && !location.search.includes('skipIntro')) {
  stage.controls.enabled = false;
  const stopOrbit = stage.animator.every((_dt, time) => {
    const a = time * 0.12;
    stage.camera.position.set(Math.sin(a) * 13, 6.5, Math.cos(a) * 13);
    stage.controls.target.set(0, 0, 0);
    return false;
  });
  hud.showIntro(() => {
    sfx.unlock();
    stopOrbit();
    stage.controls.enabled = true;
    controller?.setAutoCamera(true);
  });
}

// Debug lab: `#lab` shows every monster form up close, `#lab-closed` the pieces.
if (location.hash.startsWith('#lab')) void import('./debug/lab').then((m) => m.openLab(stage, view, location.hash === '#lab'));

// Exposed for debugging and automated visual checks.
(window as unknown as { chess: unknown }).chess = { controller, stage, view };
