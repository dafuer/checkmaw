import * as THREE from 'three';
import type { Sfx } from '../../audio/sfx';
import type { PieceType } from '../../domain/types';
import type { Stage } from '../stage';
import type { Particles } from '../effects/particles';
import { ease } from '../animation/animator';
import { TEAM_GLOW, type PieceView } from '../pieces/pieceView';
import { DuelKit } from './duelKit';
import { CAMERA_NAMES, FINALE_NAMES, FINISHER_NAMES, REACTION_NAMES, type CameraName, type FinisherName } from './finisherNames';
import { finisher } from './finishers';
import type { Locomotion } from './locomotion';
import { REACTIONS } from './reactions';
import { Variety } from './variety';

export interface BattleHooks {
  letterbox(on: boolean): void;
  /** Announces which piece is transforming (null hides the caption). */
  announce(type: PieceType | null): void;
  /** Names the finishing move about to be played (null hides the caption). */
  announceMove(name: FinisherName | null): void;
}

/**
 * Directs a capture as a short duel: the camera sets up, the attacker
 * transforms, the victim reacts, and the attacker ends it with one of its
 * finishing moves. The camera angle, the reaction and the finisher are each
 * dealt from a shuffled deck (see Variety), so no two captures in a row look
 * alike. The choreography itself lives in the finisher catalogues; every beat
 * is an awaited tween, so it reads top-to-bottom and respects the animator
 * speed.
 */
export class BattleDirector {
  readonly variety: Variety;
  private readonly kit: DuelKit;

  constructor(
    private readonly stage: Stage,
    particles: Particles,
    sfx: Sfx,
    private readonly hooks: BattleHooks,
    variety = new Variety(),
  ) {
    this.variety = variety;
    this.kit = new DuelKit(stage, particles, sfx, variety);
  }

  get moves(): Locomotion {
    return this.kit.moves;
  }

  private get anim() {
    return this.stage.animator;
  }

  async battle(attacker: PieceView, victim: PieceView, destination: THREE.Vector3): Promise<void> {
    const kit = this.kit;
    const savedPose = this.stage.pose();
    kit.lendLights(attacker, victim);
    this.stage.controls.enabled = false;
    this.hooks.letterbox(true);
    let stopTracking = (): void => {};
    try {
      const A = attacker.root.position.clone();
      const V = victim.root.position.clone();
      const dir = V.clone().sub(A).setY(0).normalize();

      const camera = this.variety.pick('camera', CAMERA_NAMES);
      await Promise.all([this.frameFight(A, V, savedPose.position, 1.1, camera), this.faceEachOther(attacker, victim, 0.5)]);
      stopTracking = this.track(attacker, victim, this.variety.sign() * this.variety.range(0.03, 0.11));

      this.hooks.announce(attacker.type);
      await this.transform(attacker);
      this.hooks.announce(null);
      await REACTIONS[this.variety.pick('reaction', REACTION_NAMES)](kit, victim, attacker);
      kit.tremble(victim);

      const name: FinisherName = this.variety.pick(`finisher:${attacker.type}`, FINISHER_NAMES[attacker.type]);
      const move = finisher(attacker.type, name);
      if (move.reach > 0) {
        const stop = V.clone().addScaledVector(dir, -Math.min(move.reach, A.distanceTo(V) - 0.1));
        if (A.distanceTo(stop) > 0.05) await kit.moves.walk(attacker, stop, 2.1);
      }
      this.hooks.announceMove(name);
      void this.anim.wait(1.7).then(() => this.hooks.announceMove(null));
      await move.play(kit, attacker, victim);
      victim.root.visible = false;
      kit.stopTremble(victim);

      attacker.root.position.y = 0;
      if (attacker.root.position.distanceTo(destination) > 0.05) await kit.moves.walk(attacker, destination, 2.4);
      stopTracking();
      const back = this.stage.flyTo(savedPose, 1.0);
      kit.sfx.skitter();
      await kit.moves.slumber(attacker, 0.8);
      await back;
    } catch (error) {
      // A broken choreography must never leave the game stuck mid-duel.
      console.error('Battle animation failed', error);
      void this.stage.flyTo(savedPose, 0.6);
    } finally {
      stopTracking();
      kit.focusTop = 0;
      this.hooks.announce(null);
      this.hooks.announceMove(null);
      kit.stopTremble(victim);
      victim.root.visible = false;
      attacker.resetPose();
      attacker.root.visible = true;
      attacker.root.position.copy(destination);
      attacker.root.rotation.set(0, attacker.restFacing, 0);
      kit.returnLights(attacker, victim);
      this.hooks.letterbox(false);
      this.stage.controls.enabled = true;
    }
  }

  /** Takes the pooled lights back from any pieces holding them. */
  returnLights(...pieces: PieceView[]): void {
    this.kit.returnLights(...pieces);
  }

  /**
   * Checkmate finale: the loser topples, the winning king transforms and
   * celebrates in one of a few ways while his army cheers.
   */
  async celebrate(winner: PieceView, loser: PieceView | undefined, allies: PieceView[] = []): Promise<void> {
    const kit = this.kit;
    this.stage.controls.enabled = false;
    try {
      const w = winner.root.position;
      // Look at the king from the board side, high enough to clear the other pieces.
      const toCam = new THREE.Vector3(-w.x, 0, -w.z).normalize();
      if (toCam.lengthSq() < 0.01) toCam.set(0, 0, winner.color === 'w' ? 1 : -1);
      const position = w.clone().addScaledVector(toCam, 4.2).add(new THREE.Vector3(0, 3.4, 0));
      await this.stage.flyTo({ position, target: w.clone().add(new THREE.Vector3(0, 1, 0)) }, 1.4);
      kit.lendLights(winner);
      await kit.moves.turn(winner, winner.faceTowards(position.x, position.z), 0.4);
      if (loser) {
        const fall = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        kit.sfx.crack();
        void this.anim.tween(0.9, (t) => {
          loser.pitch = fall.z * t * (Math.PI / 2);
          loser.roll = -fall.x * t * (Math.PI / 2);
        }, ease.outBounce).then(() => {
          kit.particles.shatter(loser.root.position, loser.mats.body.color, 30, 1.6, 0.3);
          this.stage.addShake(0.4);
        });
      }
      await this.transform(winner);
      this.cheer(winner, allies);
      const glow = TEAM_GLOW[winner.color];
      await kit.moves.drawSword(winner);
      const finale = this.variety.pick('finale', FINALE_NAMES);
      if (finale === 'fireworks') {
        // Sword to the sky, and the sky answers.
        await kit.moves.pose(winner, { guard: 0, lift: 1 }, 0.5, ease.outBack);
        for (let i = 0; i < 6; i++) {
          const burst = w.clone().add(new THREE.Vector3((Math.random() - 0.5) * 5, 2.6 + Math.random() * 1.6, (Math.random() - 0.5) * 5));
          void kit.fx.beam(winner.weaponTip(), burst, glow, 0.02, 0.2);
          await this.anim.wait(0.14);
          kit.sfx.crack();
          kit.particles.sparksAt(burst, { count: 120, color: i % 2 ? 0xffd27a : glow, speed: 3.6, life: 1.3, gravity: 1.6, drag: 1.6 });
          kit.particles.sparksAt(burst, { count: 25, color: 0xffffff, speed: 1.2, life: 0.5 });
          void this.stage.pulseBloom(1.5, 0.3);
          await this.anim.wait(0.16);
        }
      } else if (finale === 'flourish') {
        // Three cuts at the air, a turn of the cape, and the point driven into the board.
        const endTrail = kit.trail(winner);
        for (let i = 0; i < 3; i++) {
          await kit.moves.pose(winner, { guard: 0, raise: 1, strike: 0 }, 0.14, ease.outQuad);
          kit.sfx.slash();
          await kit.moves.pose(winner, { raise: 0, strike: 1 }, 0.1, ease.inCubic);
          void kit.fx.slashArc(winner.weaponTip(), winner.root.rotation.y + (i - 1) * 0.5, glow, i !== 1, 0.4);
        }
        endTrail();
        await this.anim.tween(0.5, (t) => {
          winner.twist = t * Math.PI * 2;
          winner.gait = Math.sin(t * Math.PI) * 0.8;
          winner.gaitPhase += 0.3;
        }, ease.inOutCubic);
        winner.twist = 0;
        winner.gait = 0;
        await kit.moves.pose(winner, { strike: 0, lift: 1 }, 0.3, ease.outBack);
        kit.groundSlam(w, 0.8, glow);
        void kit.fx.pillar(w, glow, 5, 0.6, 0.8);
        kit.particles.sparksAt(winner.weaponTip(), { count: 120, color: glow, speed: 3, life: 1.2 });
        void this.stage.pulseBloom(1.8, 0.6);
      } else {
        await kit.moves.pose(winner, { guard: 0, lift: 1 }, 0.5, ease.outBack);
        kit.particles.sparksAt(winner.weaponTip(), { count: 120, color: glow, speed: 3, life: 1.2 });
        void this.stage.pulseBloom(1.6, 0.6);
      }
    } catch (error) {
      console.error('Checkmate finale failed', error);
    } finally {
      this.stage.controls.enabled = true;
    }
  }

  /** The winner's surviving pieces hop for joy, in a wave spreading out from the king. */
  private cheer(winner: PieceView, allies: PieceView[]): void {
    for (const ally of allies) {
      if (ally === winner) continue;
      const delay = ally.root.position.distanceTo(winner.root.position) * 0.11;
      void this.anim.wait(delay).then(async () => {
        for (let i = 0; i < 3; i++) {
          await this.anim.tween(0.34, (t) => {
            ally.hop = Math.sin(t * Math.PI) * 0.3;
            ally.squash = 1 + Math.sin(t * Math.PI) * 0.14 - (t > 0.85 ? (t - 0.85) * 1.2 : 0);
          }, ease.linear);
          ally.hop = 0;
          ally.squash = 1;
          await this.anim.wait(0.08);
        }
      });
    }
  }

  /** Short version used when cinematics are disabled. */
  async quickCapture(attacker: PieceView, victim: PieceView, destination: THREE.Vector3): Promise<void> {
    const kit = this.kit;
    const vpos = victim.root.position.clone();
    kit.particles.shatter(vpos, victim.mats.body.color, 26, 2.2, victim.height);
    kit.particles.sparksAt(vpos.clone().setY(0.5), { count: 40, color: TEAM_GLOW[victim.color], speed: 3, life: 0.8 });
    kit.sfx.crack();
    victim.root.visible = false;
    await kit.moves.glide(attacker, destination, 0.45);
  }

  // ------------------------------------------------------------ camera beats

  private async frameFight(A: THREE.Vector3, V: THREE.Vector3, current: THREE.Vector3, duration: number, style: CameraName): Promise<void> {
    const mid = A.clone().add(V).multiplyScalar(0.5);
    const d = V.clone().sub(A).setY(0);
    const len = Math.max(0.8, d.length());
    d.normalize();
    let side = new THREE.Vector3(-d.z, 0, d.x);
    // Stay on the same side of the fight as the current camera.
    if (side.dot(current.clone().sub(mid)) < 0) side = side.negate();
    const dist = Math.max(2.5, len * 0.6 + 1.8);
    const target = mid.clone().add(new THREE.Vector3(0, 0.75, 0));
    let position: THREE.Vector3;
    switch (style) {
      case 'low':
        // Down among the pieces, looking up at the fighters.
        position = mid.clone().addScaledVector(side, dist * 0.92).add(new THREE.Vector3(0, 1.0 + len * 0.1, 0)).addScaledVector(d, -0.2);
        break;
      case 'high':
        // A three-quarter view from above.
        position = mid.clone().addScaledVector(side, dist).add(new THREE.Vector3(0, 2.5 + len * 0.25, 0)).addScaledVector(d, -0.5);
        break;
      case 'shoulder':
        // Behind the attacker, off to one side, with the victim ahead.
        position = A.clone().addScaledVector(d, -(1.9 + len * 0.25)).addScaledVector(side, 1.5).add(new THREE.Vector3(0, 2.0 + len * 0.15, 0));
        break;
      default:
        position = mid.clone().addScaledVector(side, dist).add(new THREE.Vector3(0, 1.7 + len * 0.2, 0)).addScaledVector(d, -0.3);
    }
    await this.stage.flyTo({ position, target }, duration);
  }

  /** Smoothly follows both fighters so walks, leaps and lifts stay in frame, drifting slowly round them. */
  private track(attacker: PieceView, victim: PieceView, drift = 0): () => void {
    const cam = this.stage.camera.position;
    const target = this.stage.controls.target;
    const dir = cam.clone().sub(target).normalize();
    const tmp = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    return this.anim.every((dt) => {
      dir.applyAxisAngle(up, drift * dt);
      const a = attacker.root.position;
      const v = victim.root.visible ? victim.root.position : a;
      const top = Math.max(a.y + attacker.hop + attacker.height * 0.6, v.y + 0.4, this.kit.focusTop);
      tmp.set((a.x + v.x) / 2, Math.max(0.6, top * 0.75), (a.z + v.z) / 2);
      const separation = Math.hypot(a.x - v.x, a.z - v.z);
      // Bulky monsters need more room in the frame.
      const dist = 2.9 + separation * 0.55 + top * 1.0 + ((attacker.traits.bulk ?? 1) - 1) * 2.4 * attacker.monster;
      const k = 1 - Math.exp(-dt * 2.5);
      target.lerp(tmp, k);
      cam.lerp(tmp.clone().addScaledVector(dir, dist), k);
      return false;
    });
  }

  private async faceEachOther(a: PieceView, b: PieceView, duration: number): Promise<void> {
    const pa = a.root.position;
    const pb = b.root.position;
    await Promise.all([
      this.kit.moves.turn(a, a.faceTowards(pb.x, pb.z), duration),
      this.kit.moves.turn(b, b.faceTowards(pa.x, pa.z), duration),
    ]);
  }

  // ------------------------------------------------------- transformations

  /** Shell cracks, legs and weapons burst out, the jaw splits open with a roar. The knight mounts its war horse instead. */
  private async transform(piece: PieceView): Promise<void> {
    const glow = TEAM_GLOW[piece.color];
    const center = piece.root.position.clone().setY(piece.height * 0.5);

    // 1. Tremble with glowing cracks.
    this.kit.sfx.crack();
    await this.anim.tween(0.55, (t) => {
      piece.body.rotation.z = Math.sin(t * 60) * 0.06 * t;
      piece.body.rotation.x = Math.cos(t * 47) * 0.04 * t;
      piece.setGlow(t * 0.9);
    }, ease.inQuad);
    piece.body.rotation.set(0, 0, 0);

    // 2. Burst.
    this.kit.particles.shatter(center, piece.mats.body.color, 22, 1.8, piece.height * 0.6);
    this.kit.particles.sparksAt(center, { count: 90, color: glow, speed: 4.5, life: 0.9, drag: 2.5 });
    this.stage.addShake(0.5);
    void this.stage.pulseBloom(1.8, 0.6);
    this.kit.sfx.impact();

    if (piece.figure) {
      await this.kit.moves.comeAlive(piece, 0.8);
      if (piece.type === 'b') {
        // The tin soldier is wound up, clicks its heels and presents its sword.
        piece.figure.winding = 14;
        for (let i = 0; i < 4; i++) {
          this.kit.sfx.select();
          await this.anim.wait(0.12);
        }
        piece.figure.winding = 0;
        this.kit.sfx.clang();
        await this.anim.tween(0.18, (t) => (piece.hop = Math.sin(t * Math.PI) * 0.08), ease.outQuad);
        piece.hop = 0;
        await this.kit.moves.pose(piece, { raise: 0.55, guard: 0.6 }, 0.35, ease.outBack);
        await this.anim.wait(0.25);
        await this.kit.moves.restPose(piece, 0.3);
      } else if (piece.type === 'q') {
        // She lifts her staff and the crystal flares.
        await this.kit.moves.pose(piece, { raise: 0.85 }, 0.45, ease.outBack);
        this.kit.sfx.magic();
        this.kit.particles.sparksAt(piece.weaponTip(), { count: 80, color: glow, speed: 2.5, life: 0.9 });
        void this.stage.pulseBloom(1.6, 0.5);
        await this.anim.wait(0.5);
        await this.kit.moves.restPose(piece, 0.35);
      } else {
        // He squares his shoulders, cape billowing, hand on the hilt.
        await this.anim.tween(0.8, (t) => (piece.gait = Math.sin(t * Math.PI) * 0.35), ease.inOutQuad);
        piece.gait = 0;
      }
      return;
    }

    if (piece.type === 'n') {
      await this.anim.tween(0.7, (t) => (piece.mounted = t), ease.outElastic);
      this.kit.sfx.neigh();
      await this.anim.tween(0.7, (t) => {
        piece.rear = Math.sin(t * Math.PI);
        piece.mouth = Math.sin(t * Math.PI) * 0.8;
        if (piece.mount) piece.mount.couch = 0;
      }, ease.inOutQuad);
      return;
    }

    await this.anim.tween(0.7, (t) => {
      piece.monster = t;
      piece.armed = t;
    }, ease.outElastic);

    // 3. Roar, weapon raised.
    this.kit.sfx.roar();
    this.stage.addShake(0.35);
    void this.kit.moves.pose(piece, piece.type === 'r' ? { lift: 0.7 } : { raise: 0.6, guard: 0.5 }, 0.4, ease.outBack);
    await this.anim.tween(0.35, (t) => (piece.mouth = t), ease.outBack);
    const roarEnd = this.anim.every((dt) => {
      this.kit.particles.sparksAt(piece.mouthWorld(), {
        count: 3,
        color: glow,
        speed: 2.5,
        life: 0.5,
        direction: new THREE.Vector3(Math.sin(piece.root.rotation.y), 0.4, Math.cos(piece.root.rotation.y)),
        cone: 0.6,
      });
      piece.body.rotation.x = -0.15 + Math.sin(this.anim.now * 40) * 0.02;
      return dt < 0;
    });
    await this.anim.wait(0.8);
    roarEnd();
    await Promise.all([
      this.anim.tween(0.3, (t) => {
        piece.mouth = 1 - t * 0.7;
        piece.body.rotation.x = -0.15 * (1 - t);
      }),
      this.kit.moves.restPose(piece, 0.3),
    ]);
  }
}
