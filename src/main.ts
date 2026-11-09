import { GameController } from './app/gameController';
import { Sfx } from './audio/sfx';
import { Board } from './rendering/board';
import { BoardView } from './rendering/boardView';
import { Stage } from './rendering/stage';
import { Hud } from './ui/hud';
import { I18n } from './ui/i18n';
import { readPref, writePref } from './ui/prefs';
import { readCameraMode } from './rendering/cameraModes';

const container = document.getElementById('app')!;
const stage = new Stage(container);
const sfx = new Sfx();
const board = new Board();
stage.scene.add(board.group);
stage.onFrame((dt) => board.update(dt));

let controller: GameController | null = null;
const i18n = new I18n();
const settings = { camera: readCameraMode(readPref('camera')) };
const hud = new Hud(container, {
  onUndo: () => controller?.undo(),
  onRestart: () => controller?.restart(),
  onToggleCinematics: (on) => (view.cinematics = on),
  onToggleMarches: (on) => (view.marches = on),
  onToggleSound: (on) => sfx.setMuted(!on),
  onCameraMode: (mode) => {
    writePref('camera', mode);
    controller?.setCameraMode(mode);
  },
}, i18n, settings);
const view = new BoardView(stage, sfx, {
  letterbox: (on) => hud.letterbox(on),
  announce: (type) => hud.announce(type),
});
stage.scene.add(view.group);

controller = new GameController(stage, board, view, hud, sfx);
controller.start();
if (location.search.includes('skipIntro')) controller.setCameraMode(settings.camera);
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
    controller?.setCameraMode(settings.camera);
  });
}

// Debug lab: `#lab` shows every monster form up close, `#lab-closed` the pieces.
if (location.hash.startsWith('#lab')) void import('./debug/lab').then((m) => m.openLab(stage, view, location.hash === '#lab'));

// Exposed for debugging and automated visual checks.
/** Prints peak, RMS and length of every procedural sound, rendered offline. */
async function soundCheck(): Promise<void> {
  const rows: Record<string, { peak: string; rmsDb: string; seconds: string }> = {};
  for (const name of Sfx.sounds) {
    const m = await Sfx.measure(name);
    rows[name] = { peak: m.peak.toFixed(2), rmsDb: m.rmsDb.toFixed(0), seconds: m.seconds.toFixed(2) };
  }
  console.table(rows);
}

(window as unknown as { chess: unknown }).chess = { controller, stage, view, i18n, soundCheck };
