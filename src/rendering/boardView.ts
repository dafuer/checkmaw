import * as THREE from 'three';
import type { GameEvent, Piece, PieceType, Square } from '../domain/types';
import type { Sfx } from '../audio/sfx';
import { ease } from './animation/animator';
import { BattleDirector, type BattleHooks } from './battle/battleDirector';
import { squareToXZ } from './coords';
import { Particles } from './effects/particles';
import { PieceView, TEAM_GLOW } from './pieces/pieceView';
import type { Stage } from './stage';

export function squareToWorld(square: Square): THREE.Vector3 {
  const { x, z } = squareToXZ(square);
  return new THREE.Vector3(x, 0, z);
}

/** Presentation of the pieces: keeps one PieceView per domain piece id. */
export class BoardView {
  readonly group = new THREE.Group();
  readonly particles = new Particles();
  readonly director: BattleDirector;
  cinematics = true;
  private readonly views = new Map<string, PieceView>();

  constructor(
    private readonly stage: Stage,
    private readonly sfx: Sfx,
    hooks: BattleHooks,
  ) {
    this.group.add(this.particles.group);
    this.director = new BattleDirector(stage, this.particles, sfx, hooks);
    stage.onFrame((dt) => {
      for (const v of this.views.values()) v.update(dt);
      this.particles.update(dt);
    });
  }

  view(id: string): PieceView | undefined {
    return this.views.get(id);
  }

  /** Raycast pieces and return the hit piece id. */
  pickPiece(raycaster: THREE.Raycaster): string | null {
    const roots = [...this.views.values()].filter((v) => v.root.visible).map((v) => v.root);
    const hit = raycaster.intersectObjects(roots, true)[0];
    return (hit?.object.userData.pieceId as string | undefined) ?? null;
  }

  /** Instantly mirrors the domain state (initial load, undo, restart). */
  sync(pieces: Piece[]): void {
    const alive = new Set(pieces.map((p) => p.id));
    for (const [id, view] of this.views) {
      if (!alive.has(id)) this.remove(id, view);
    }
    for (const p of pieces) {
      let view = this.views.get(p.id);
      if (view && view.type !== p.type) {
        this.remove(p.id, view);
        view = undefined;
      }
      if (!view) view = this.create(p.id, p.type, p.color);
      const pos = squareToWorld(p.square);
      view.root.position.copy(pos);
      view.root.rotation.set(0, view.restFacing, 0);
      view.root.scale.setScalar(1);
      view.root.visible = true;
      view.monster = 0;
      view.mouth = 0;
      view.hop = 0;
    }
  }

  /** Plays a move's events in order; resolves when every animation is done. */
  async play(events: GameEvent[]): Promise<void> {
    const handledMoves = new Set<number>();
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.kind === 'captured') {
        const moveIndex = events.findIndex((m, j) => j > i && m.kind === 'moved' && m.pieceId === e.attackerId);
        const move = events[moveIndex] as Extract<GameEvent, { kind: 'moved' }>;
        handledMoves.add(moveIndex);
        await this.capture(e.attackerId, e.victimId, move.to);
      } else if (e.kind === 'moved' && !handledMoves.has(i)) {
        // Castling: animate king and rook together.
        const together = [e];
        const next = events[i + 1];
        if (next?.kind === 'moved') {
          together.push(next);
          handledMoves.add(i + 1);
        }
        await Promise.all(together.map((m) => this.move(m.pieceId, m.to)));
      } else if (e.kind === 'promoted') {
        await this.promote(e.pieceId, e.to);
      }
    }
  }

  private async move(id: string, to: Square): Promise<void> {
    const view = this.views.get(id);
    if (!view) return;
    const target = squareToWorld(to);
    const distance = view.root.position.distanceTo(target);
    if (view.type === 'n') {
      await this.director.glide(view, target, 0.55, 0.9);
      this.particles.sparksAt(target.clone().setY(0.05), { count: 20, color: 0xb59a7a, speed: 1.4, life: 0.5, gravity: 3, spread: new THREE.Vector3(0.4, 0, 0.4) });
      return;
    }
    await this.director.glide(view, target, Math.min(0.9, 0.3 + distance * 0.09), 0.12 + distance * 0.02);
  }

  private async capture(attackerId: string, victimId: string, to: Square): Promise<void> {
    const attacker = this.views.get(attackerId);
    const victim = this.views.get(victimId);
    if (!attacker || !victim) return;
    const destination = squareToWorld(to);
    if (this.cinematics) await this.director.battle(attacker, victim, destination);
    else await this.director.quickCapture(attacker, victim, destination);
    this.remove(victimId, victim);
  }

  private async promote(id: string, to: PieceType): Promise<void> {
    const old = this.views.get(id);
    if (!old) return;
    const pos = old.root.position.clone();
    const glow = TEAM_GLOW[old.color];
    this.sfx.magic();
    await this.stage.animator.tween(0.5, (t) => {
      old.setGlow(t * 3);
      old.root.rotation.y += 0.3;
      old.hop = t * 0.4;
    }, ease.inQuad);
    this.particles.sparksAt(pos.clone().setY(0.7), { count: 160, color: glow, speed: 4, life: 1.1 });
    this.stage.addShake(0.3);
    void this.stage.pulseBloom(1.6, 0.5);
    this.remove(id, old);
    const fresh = this.create(id, to, old.color);
    fresh.root.position.copy(pos);
    fresh.root.rotation.y = fresh.restFacing;
    await this.stage.animator.tween(0.6, (t) => {
      fresh.root.scale.setScalar(Math.max(0.001, t));
      fresh.setGlow((1 - t) * 3);
    }, ease.outBack);
  }

  private create(id: string, type: PieceType, color: Piece['color']): PieceView {
    const view = new PieceView(id, type, color);
    this.views.set(id, view);
    this.group.add(view.root);
    return view;
  }

  private remove(id: string, view: PieceView): void {
    const stop = view.root.userData.stopTremble as (() => void) | undefined;
    stop?.();
    this.group.remove(view.root);
    view.dispose();
    this.views.delete(id);
  }
}
