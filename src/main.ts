import { GameController } from './app/gameController';
import type { PieceType, Square } from './domain/types';
import { Sfx } from './audio/sfx';
import { Board } from './rendering/board';
import { BoardView } from './rendering/boardView';
import { Stage } from './rendering/stage';
import { Hud } from './ui/hud';
import { I18n } from './ui/i18n';
import { readPref, writePref } from './ui/prefs';
import { readCameraMode } from './rendering/cameraModes';
import { readScene, Scenery } from './rendering/scenery';

const container = document.getElementById('app')!;
const stage = new Stage(container);
const sfx = new Sfx();
const board = new Board();
stage.scene.add(board.group);
stage.onFrame((dt) => board.update(dt));

let controller: GameController | null = null;
const i18n = new I18n();
const settings = { camera: readCameraMode(readPref('camera')), scene: readScene(readPref('scene')) };
const scenery = new Scenery(stage, board);
scenery.set(settings.scene);
sfx.setMood(settings.scene);
const hud = new Hud(container, {
  onUndo: () => controller?.undo(),
  onRestart: () => controller?.restart(),
  onToggleCinematics: (on) => (view.cinematics = on),
  onToggleMarches: (on) => (view.marches = on),
  onToggleSound: (on) => sfx.setMuted(!on),
  onScene: (scene) => {
    writePref('scene', scene);
    scenery.set(scene);
    sfx.setMood(scene);
  },
  onCameraMode: (mode) => {
    writePref('camera', mode);
    controller?.setCameraMode(mode);
  },
}, i18n, settings);
const view = new BoardView(stage, sfx, {
  letterbox: (on) => hud.letterbox(on),
  announce: (type) => hud.announce(type),
  announceMove: (name) => hud.announceMove(name),
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

/**
 * Previews one finishing move from the console, e.g. `chess.duel('q', 'stardust')`
 * or `chess.duel('r', 'homeRun', 'n', 'taunt', 'low')`: sets up a tiny position
 * where the white piece captures a black victim on d5 and plays it.
 */
async function duel(attacker: PieceType, finisherName: string, victim: PieceType = 'n', reaction?: string, camera?: string): Promise<boolean> {
  const from = { p: 'e4', n: 'e3', b: 'g2', r: 'd1', q: 'd2', k: 'e4' }[attacker];
  const board = new Map<string, string>([['h8', 'k'], ['d5', victim === 'k' ? 'q' : victim], [from, attacker.toUpperCase()]]);
  if (attacker !== 'k') board.set('a1', 'K');
  const rows: string[] = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = '';
    let empty = 0;
    for (const file of 'abcdefgh') {
      const piece = board.get(`${file}${rank}`);
      if (!piece) {
        empty++;
        continue;
      }
      row += (empty ? String(empty) : '') + piece;
      empty = 0;
    }
    rows.push(row + (empty ? String(empty) : ''));
  }
  const variety = view.director.variety;
  variety.force(`finisher:${attacker}`, finisherName);
  variety.force('reaction', reaction ?? null);
  variety.force('camera', camera ?? null);
  controller!.restart(`${rows.join('/')} w - - 0 1`);
  return controller!.playMove(from as Square, 'd5');
}

/** Previews one move style from the console, e.g. `chess.walk('n', 'vault')`. */
async function walk(type: PieceType, style: string): Promise<boolean> {
  const moves: Record<PieceType, [string, string]> = { p: ['e2', 'e4'], n: ['g1', 'f3'], b: ['c1', 'g5'], r: ['a1', 'a6'], q: ['d1', 'h5'], k: ['e1', 'e2'] };
  const fens: Record<PieceType, string> = {
    p: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    n: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    b: 'rnbqkbnr/pppppppp/8/8/8/3P4/PPP1PPPP/RNBQKBNR w KQkq - 0 1',
    r: 'rnbqkbnr/pppppppp/8/8/8/8/1PPPPPPP/RNBQKBNR w KQkq - 0 1',
    q: 'rnbqkbnr/pppppppp/8/8/8/4P3/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
    k: 'rnbqkbnr/pppppppp/8/8/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
  };
  view.director.variety.force(`march:${type}`, style);
  controller!.restart(fens[type]);
  return controller!.playMove(moves[type][0] as Square, moves[type][1] as Square);
}

(window as unknown as { chess: unknown }).chess = { controller, stage, view, i18n, scenery, sfx, soundCheck, duel, walk };
