import * as THREE from 'three';
import { ChessGame } from '../domain/game';
import type { Color, GameEvent, Square } from '../domain/types';
import type { Sfx } from '../audio/sfx';
import type { Board } from '../rendering/board';
import type { BoardView } from '../rendering/boardView';
import type { CameraPose, Stage } from '../rendering/stage';
import type { Hud } from '../ui/hud';

const SIDE_POSE: Record<Color, CameraPose> = {
  w: { position: new THREE.Vector3(0, 9.5, 10.5), target: new THREE.Vector3(0, 0, 0.4) },
  b: { position: new THREE.Vector3(0, 9.5, -10.5), target: new THREE.Vector3(0, 0, -0.4) },
};

/**
 * Application layer: turns pointer input into domain moves and feeds the
 * resulting events to the presentation. Input is locked while animations run.
 */
export class GameController {
  private game = new ChessGame();
  private selected: Square | null = null;
  private busy = false;
  private autoCamera = true;
  private lastMove: Square[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();

  constructor(
    private readonly stage: Stage,
    private readonly board: Board,
    private readonly view: BoardView,
    private readonly hud: Hud,
    private readonly sfx: Sfx,
  ) {
    const canvas = stage.renderer.domElement;
    let downAt: { x: number; y: number } | null = null;
    canvas.addEventListener('pointerdown', (e) => {
      downAt = { x: e.clientX, y: e.clientY };
      this.sfx.unlock();
    });
    canvas.addEventListener('pointerup', (e) => {
      // Ignore orbit drags; only treat short presses as clicks.
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6) void this.click(e);
      downAt = null;
    });
    canvas.addEventListener('pointermove', (e) => this.hover(e));
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        this.stage.animator.speed = 3.5;
        e.preventDefault();
      }
      if (e.key === 'u' || e.key === 'U') this.undo();
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.stage.animator.speed = 1;
    });
  }

  start(): void {
    this.view.sync(this.game.pieces());
    this.refresh();
  }

  setAutoCamera(on: boolean): void {
    this.autoCamera = on;
    if (on && !this.busy) void this.stage.flyTo(SIDE_POSE[this.game.turn()], 1.2);
  }

  restart(): void {
    if (this.busy) return;
    this.game = new ChessGame();
    this.selected = null;
    this.lastMove = [];
    this.hud.hideOverlay();
    this.view.sync(this.game.pieces());
    this.refresh();
    if (this.autoCamera) void this.stage.flyTo(SIDE_POSE.w, 1.2);
  }

  undo(): void {
    if (this.busy || !this.game.undo()) return;
    this.selected = null;
    this.lastMove = [];
    this.hud.hideOverlay();
    this.view.sync(this.game.pieces());
    this.refresh();
    if (this.autoCamera) void this.stage.flyTo(SIDE_POSE[this.game.turn()], 0.9);
  }

  /** Test/automation hook: plays a move as if the user clicked it. */
  async playMove(from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n'): Promise<boolean> {
    if (this.busy) return false;
    return this.execute(from, to, promotion);
  }

  private squareFromEvent(e: PointerEvent): Square | null {
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.stage.camera);
    const pieceId = this.view.pickPiece(this.raycaster);
    if (pieceId) {
      const piece = this.game.pieces().find((p) => p.id === pieceId);
      if (piece) return piece.square;
    }
    return this.board.pick(this.raycaster);
  }

  private hover(e: PointerEvent): void {
    if (this.busy) return;
    const sq = this.squareFromEvent(e);
    this.board.setMarkers('hover', sq ? [sq] : []);
    this.stage.renderer.domElement.style.cursor = sq && this.isSelectable(sq) ? 'pointer' : 'default';
  }

  private isSelectable(square: Square): boolean {
    const piece = this.game.pieceAt(square);
    if (piece && piece.color === this.game.turn()) return true;
    return !!this.selected && this.game.legalTargets(this.selected).some((t) => t.to === square);
  }

  private async click(e: PointerEvent): Promise<void> {
    if (this.busy || this.game.status()) return;
    const sq = this.squareFromEvent(e);
    if (!sq) return;
    const piece = this.game.pieceAt(sq);

    if (this.selected) {
      const target = this.game.legalTargets(this.selected).find((t) => t.to === sq);
      if (target) {
        const promotion = target.isPromotion ? await this.hud.askPromotion(this.game.turn()) : undefined;
        await this.execute(this.selected, sq, promotion);
        return;
      }
    }
    if (piece && piece.color === this.game.turn()) {
      this.select(sq);
    } else {
      if (this.selected) this.sfx.invalid();
      this.select(null);
    }
  }

  private select(square: Square | null): void {
    this.selected = square;
    if (!square) {
      this.board.clearMarkers('selected', 'move', 'capture');
      return;
    }
    this.sfx.select();
    const targets = this.game.legalTargets(square);
    this.board.setMarkers('selected', [square]);
    this.board.setMarkers('move', targets.filter((t) => !t.isCapture).map((t) => t.to));
    this.board.setMarkers('capture', targets.filter((t) => t.isCapture).map((t) => t.to));
    const view = this.view.view(this.game.pieceAt(square)!.id);
    view?.setGlow(0.6);
  }

  private async execute(from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n'): Promise<boolean> {
    const result = this.game.move({ from, to, promotion });
    if (!result.ok) {
      this.sfx.invalid();
      return false;
    }
    this.busy = true;
    this.selected = null;
    this.board.clearMarkers('selected', 'move', 'capture', 'hover', 'check');
    this.stage.renderer.domElement.style.cursor = 'default';
    try {
      await this.view.play(result.events);
    } finally {
      this.busy = false;
    }
    this.lastMove = [from, to];
    this.refresh();
    this.react(result.events);
    return true;
  }

  private react(events: GameEvent[]): void {
    const over = events.find((e) => e.kind === 'gameOver');
    if (over && over.kind === 'gameOver') {
      this.sfx.fanfare(over.result.winner !== null);
      this.hud.showGameOver(over.result, () => this.restart());
      return;
    }
    if (events.some((e) => e.kind === 'check')) this.sfx.check();
    if (this.autoCamera) void this.stage.flyTo(SIDE_POSE[this.game.turn()], 1.3);
  }

  private refresh(): void {
    const turn = this.game.turn();
    const inCheck = this.game.isCheck();
    this.hud.setTurn(turn, inCheck);
    this.hud.setCaptured(this.game.captured());
    this.hud.setMoves(this.game.sanHistory());
    this.board.setMarkers('last', this.lastMove);
    const king = this.game.kingSquare(turn);
    this.board.setMarkers('check', inCheck && king ? [king] : []);
    this.board.clearMarkers('selected', 'move', 'capture');
  }
}
