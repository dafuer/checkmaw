import * as THREE from 'three';
import type { Sfx } from '../../audio/sfx';
import type { Stage } from '../stage';
import type { Particles } from '../effects/particles';
import { Fx } from '../effects/fx';
import { ease } from '../animation/animator';
import { TEAM_GLOW, type PieceView } from '../pieces/pieceView';
import { Locomotion } from './locomotion';

export interface BattleHooks {
  letterbox(on: boolean): void;
  caption(text: string | null): void;
}

const PIECE_NAMES: Record<string, string> = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };

/** How close each attacker stands before striking (weapon reach). */
const REACH: Record<string, number> = { p: 0.6, n: 0, b: 0.95, r: 0.62, q: 1.7, k: 0.8 };

/** Pieces with a shield block the victim's counter-attack; the others flinch. */
const HAS_SHIELD = new Set(['p', 'b']);

/**
 * Choreographs a capture as a short monster duel. Each attacker type has its
 * own weapon and finishing move:
 * pawn – sword combo and a gulp, knight – lance joust, bishop – great-sword
 * cleave that cuts the victim in two, rook – grab, lift and slam flat, queen –
 * a radiant lady whose great staff calls lightning and crystallises the victim,
 * king – a lord who draws his sword, cuts through the victim and sheathes it
 * as the victim falls in two.
 * Every beat is an awaited tween, so it reads top-to-bottom and respects the
 * animator speed.
 */
export class BattleDirector {
  /** Fixed pool so the number of lights (and thus shader programs) never changes. */
  private readonly lights: [THREE.PointLight, THREE.PointLight];
  readonly moves: Locomotion;
  private readonly fx: Fx;

  constructor(
    private readonly stage: Stage,
    private readonly particles: Particles,
    private readonly sfx: Sfx,
    private readonly hooks: BattleHooks,
  ) {
    this.lights = [new THREE.PointLight(0xff5a1a, 0, 1.6, 2), new THREE.PointLight(0xff5a1a, 0, 1.6, 2)];
    for (const l of this.lights) stage.scene.add(l);
    this.moves = new Locomotion(stage, particles, sfx);
    this.fx = new Fx(stage.scene, stage.animator);
  }

  private get anim() {
    return this.stage.animator;
  }

  async battle(attacker: PieceView, victim: PieceView, destination: THREE.Vector3): Promise<void> {
    const savedPose = this.stage.pose();
    attacker.borrowLight(this.lights[0]);
    victim.borrowLight(this.lights[1]);
    this.stage.controls.enabled = false;
    this.hooks.letterbox(true);

    const A = attacker.root.position.clone();
    const V = victim.root.position.clone();
    const dir = V.clone().sub(A).setY(0).normalize();

    await Promise.all([this.frameFight(A, V, savedPose.position, 1.1), this.faceEachOther(attacker, victim, 0.5)]);
    const stopTracking = this.track(attacker, victim);

    this.hooks.caption(`${PIECE_NAMES[attacker.type]} becomes ${attacker.traits.name}`);
    await this.transform(attacker);
    this.hooks.caption(null);
    await this.victimDefies(victim, attacker);

    const reach = REACH[attacker.type];
    if (reach > 0) {
      const stop = V.clone().addScaledVector(dir, -Math.min(reach, A.distanceTo(V) - 0.1));
      if (A.distanceTo(stop) > 0.05) await this.moves.walk(attacker, stop, 2.1);
    }

    switch (attacker.type) {
      case 'n':
        await this.joust(attacker, victim);
        break;
      case 'b':
        await this.cleave(attacker, victim);
        break;
      case 'r':
        await this.grabAndSlam(attacker, victim);
        break;
      case 'q':
        await this.sorcery(attacker, victim);
        break;
      case 'k':
        await this.execute(attacker, victim);
        break;
      default:
        await this.swordCombo(attacker, victim);
    }
    victim.root.visible = false;
    this.stopTremble(victim);

    if (attacker.root.position.distanceTo(destination) > 0.05) await this.moves.walk(attacker, destination, 2.4);
    stopTracking();
    const back = this.stage.flyTo(savedPose, 1.0);
    this.sfx.skitter();
    await this.moves.slumber(attacker, 0.8);
    await back;
    this.returnLights(attacker, victim);
    this.hooks.letterbox(false);
    this.stage.controls.enabled = true;
  }

  /** Takes the pooled lights back from any pieces holding them. */
  returnLights(...pieces: PieceView[]): void {
    for (const p of pieces) p.borrowLight(null);
    for (const l of this.lights) {
      l.intensity = 0;
      this.stage.scene.add(l);
    }
  }

  /** Checkmate finale: the winning king transforms and raises its hammer while the loser topples. */
  async celebrate(winner: PieceView, loser: PieceView | undefined): Promise<void> {
    this.stage.controls.enabled = false;
    const w = winner.root.position;
    // Look at the king from the board side, high enough to clear the other pieces.
    const toCam = new THREE.Vector3(-w.x, 0, -w.z).normalize();
    if (toCam.lengthSq() < 0.01) toCam.set(0, 0, winner.color === 'w' ? 1 : -1);
    const position = w.clone().addScaledVector(toCam, 4.2).add(new THREE.Vector3(0, 3.4, 0));
    await this.stage.flyTo({ position, target: w.clone().add(new THREE.Vector3(0, 1, 0)) }, 1.4);
    winner.borrowLight(this.lights[0]);
    await this.moves.turn(winner, winner.faceTowards(position.x, position.z), 0.4);
    if (loser) {
      const fall = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
      this.sfx.crack();
      void this.anim.tween(0.9, (t) => {
        loser.root.rotation.x = fall.z * t * (Math.PI / 2);
        loser.root.rotation.z = -fall.x * t * (Math.PI / 2);
      }, ease.outBounce).then(() => {
        this.particles.shatter(loser.root.position, loser.mats.body.color, 30, 1.6, 0.3);
        this.stage.addShake(0.4);
      });
    }
    await this.transform(winner);
    await this.moves.drawSword(winner);
    await this.moves.pose(winner, { guard: 0, lift: 1 }, 0.5, ease.outBack);
    this.particles.sparksAt(winner.weaponTip(), { count: 120, color: TEAM_GLOW[winner.color], speed: 3, life: 1.2 });
    void this.stage.pulseBloom(1.6, 0.6);
    this.stage.controls.enabled = true;
  }

  /** Short version used when cinematics are disabled. */
  async quickCapture(attacker: PieceView, victim: PieceView, destination: THREE.Vector3): Promise<void> {
    const vpos = victim.root.position.clone();
    this.particles.shatter(vpos, victim.mats.body.color, 26, 2.2, victim.height);
    this.particles.sparksAt(vpos.clone().setY(0.5), { count: 40, color: TEAM_GLOW[victim.color], speed: 3, life: 0.8 });
    this.sfx.crack();
    victim.root.visible = false;
    await this.moves.glide(attacker, destination, 0.45);
  }

  // ------------------------------------------------------------ camera beats

  private async frameFight(A: THREE.Vector3, V: THREE.Vector3, current: THREE.Vector3, duration: number): Promise<void> {
    const mid = A.clone().add(V).multiplyScalar(0.5);
    const d = V.clone().sub(A).setY(0);
    const len = Math.max(0.8, d.length());
    d.normalize();
    let side = new THREE.Vector3(-d.z, 0, d.x);
    // Stay on the same side of the fight as the current camera.
    if (side.dot(current.clone().sub(mid)) < 0) side = side.negate();
    const dist = Math.max(2.5, len * 0.6 + 1.8);
    const position = mid.clone().addScaledVector(side, dist).add(new THREE.Vector3(0, 1.7 + len * 0.2, 0)).addScaledVector(d, -0.3);
    const target = mid.clone().add(new THREE.Vector3(0, 0.75, 0));
    await this.stage.flyTo({ position, target }, duration);
  }

  /** Smoothly follows both fighters so walks, leaps and lifts stay in frame. */
  private track(attacker: PieceView, victim: PieceView): () => void {
    const cam = this.stage.camera.position;
    const target = this.stage.controls.target;
    const dir = cam.clone().sub(target).normalize();
    const tmp = new THREE.Vector3();
    return this.anim.every((dt) => {
      const a = attacker.root.position;
      const v = victim.root.visible ? victim.root.position : a;
      const top = Math.max(attacker.body.position.y + attacker.height * 0.6, v.y + 0.4);
      tmp.set((a.x + v.x) / 2, Math.max(0.6, top * 0.75), (a.z + v.z) / 2);
      const separation = Math.hypot(a.x - v.x, a.z - v.z);
      const dist = 2.9 + separation * 0.55 + top * 1.0;
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
      this.moves.turn(a, a.faceTowards(pb.x, pb.z), duration),
      this.moves.turn(b, b.faceTowards(pa.x, pa.z), duration),
    ]);
  }

  // ------------------------------------------------------- transformations

  /** Shell cracks, legs and weapons burst out, the jaw splits open with a roar. The knight mounts its war horse instead. */
  private async transform(piece: PieceView): Promise<void> {
    const glow = TEAM_GLOW[piece.color];
    const center = piece.root.position.clone().setY(piece.height * 0.5);

    // 1. Tremble with glowing cracks.
    this.sfx.crack();
    await this.anim.tween(0.55, (t) => {
      piece.body.rotation.z = Math.sin(t * 60) * 0.06 * t;
      piece.body.rotation.x = Math.cos(t * 47) * 0.04 * t;
      piece.setGlow(t * 0.9);
    }, ease.inQuad);
    piece.body.rotation.set(0, 0, 0);

    // 2. Burst.
    this.particles.shatter(center, piece.mats.body.color, 22, 1.8, piece.height * 0.6);
    this.particles.sparksAt(center, { count: 90, color: glow, speed: 4.5, life: 0.9, drag: 2.5 });
    this.stage.addShake(0.5);
    void this.stage.pulseBloom(1.8, 0.6);
    this.sfx.impact();

    if (piece.figure) {
      await this.moves.comeAlive(piece, 0.8);
      if (piece.type === 'q') {
        // She lifts her staff and the crystal flares.
        await this.moves.pose(piece, { raise: 0.85 }, 0.45, ease.outBack);
        this.sfx.magic();
        this.particles.sparksAt(piece.weaponTip(), { count: 80, color: glow, speed: 2.5, life: 0.9 });
        void this.stage.pulseBloom(1.6, 0.5);
        await this.anim.wait(0.5);
        await this.moves.restPose(piece, 0.35);
      } else {
        // He squares his shoulders, cape billowing, hand on the hilt.
        await this.anim.tween(0.8, (t) => (piece.gait = Math.sin(t * Math.PI) * 0.35), ease.inOutQuad);
        piece.gait = 0;
      }
      return;
    }

    if (piece.type === 'n') {
      await this.anim.tween(0.7, (t) => (piece.mounted = t), ease.outElastic);
      this.sfx.neigh();
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
    this.sfx.roar();
    this.stage.addShake(0.35);
    void this.moves.pose(piece, piece.type === 'r' ? { lift: 0.7 } : { raise: 0.6, guard: 0.5 }, 0.4, ease.outBack);
    await this.anim.tween(0.35, (t) => (piece.mouth = t), ease.outBack);
    const roarEnd = this.anim.every((dt) => {
      this.particles.sparksAt(piece.mouthWorld(), {
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
      this.moves.restPose(piece, 0.3),
    ]);
  }

  /** The victim awakens too and strikes back with its own weapon before losing. */
  private async victimDefies(victim: PieceView, attacker: PieceView): Promise<void> {
    this.sfx.growl(0.7, 140);
    const toward = attacker.root.position.clone().sub(victim.root.position).setY(0).normalize();
    if (victim.type === 'n') {
      await this.moves.mountUp(victim, 0.45);
      await Promise.all([
        this.anim.tween(0.6, (t) => (victim.rear = Math.sin(t * Math.PI)), ease.inOutQuad),
        this.anim.wait(0.3).then(() => this.flinch(attacker)),
      ]);
    } else if (victim.type === 'q') {
      // The lady answers with a bolt from her staff.
      await this.moves.comeAlive(victim, 0.45);
      await this.moves.pose(victim, { thrust: 1 }, 0.25, ease.outBack);
      this.sfx.zap();
      const blocked = HAS_SHIELD.has(attacker.type);
      if (blocked) void this.moves.pose(attacker, { guard: 1 }, 0.1, ease.outQuad);
      const hit = attacker.root.position.clone().setY(attacker.body.position.y + attacker.height * 0.5);
      await this.fx.lightning(victim.weaponTip(), hit, TEAM_GLOW[victim.color], 0.2);
      this.particles.sparksAt(hit, { count: 40, color: blocked ? 0xffd27a : TEAM_GLOW[victim.color], speed: 3, life: 0.5 });
      if (!blocked) void this.flinch(attacker);
      await Promise.all([this.moves.restPose(victim, 0.3), blocked ? this.moves.pose(attacker, { guard: 0 }, 0.3) : Promise.resolve()]);
    } else {
      if (victim.figure) {
        await this.moves.comeAlive(victim, 0.45);
        await this.moves.drawSword(victim);
      } else {
        await this.anim.tween(0.45, (t) => {
          victim.monster = t * 0.75;
          victim.armed = t;
          victim.body.rotation.z = Math.sin(t * 50) * 0.05;
        }, ease.outBack);
        victim.body.rotation.z = 0;
      }
      // Counter-attack.
      const start = victim.root.position.clone();
      await this.moves.pose(victim, { raise: 0.8, guard: 0 }, 0.22, ease.outQuad);
      this.sfx.slash();
      const blocked = HAS_SHIELD.has(attacker.type);
      await Promise.all([
        this.moves.pose(victim, { raise: 0, strike: 1 }, 0.14, ease.inCubic),
        this.anim.tween(0.14, (t) => {
          victim.root.position.copy(start).addScaledVector(toward, t * 0.2);
          victim.mouth = t;
        }),
        blocked ? this.moves.pose(attacker, { guard: 1 }, 0.12, ease.outQuad) : Promise.resolve(),
      ]);
      if (blocked) {
        this.sfx.clang();
        const at = attacker.root.position.clone().addScaledVector(toward, -0.3).setY(attacker.body.position.y + attacker.height * 0.5);
        this.particles.sparksAt(at, { count: 50, color: 0xffd27a, speed: 3.5, life: 0.4, gravity: 4 });
        this.stage.addShake(0.2);
      } else {
        this.sfx.chomp();
        void this.flinch(attacker);
      }
      await Promise.all([
        this.moves.pose(victim, { strike: 0 }, 0.3),
        blocked ? this.moves.pose(attacker, { guard: 0 }, 0.3) : Promise.resolve(),
        this.anim.tween(0.3, (t) => {
          victim.root.position.copy(start).addScaledVector(toward, 0.2 * (1 - t));
          victim.mouth = 1 - t;
        }, ease.inOutQuad),
      ]);
    }
    // Fear: trembling.
    const shaking = victim.figure?.group ?? victim.body;
    const stopTremble = this.anim.every(() => {
      shaking.rotation.z = Math.sin(this.anim.now * 70) * 0.025;
      return false;
    });
    victim.root.userData.stopTremble = stopTremble;
  }

  private async flinch(piece: PieceView): Promise<void> {
    const target = piece.figure?.group ?? piece.body;
    await this.anim.tween(0.3, (t) => {
      target.rotation.x = -Math.sin(t * Math.PI) * 0.25;
    }, ease.outQuad);
    target.rotation.x = 0;
  }

  private stopTremble(victim: PieceView): void {
    const stop = victim.root.userData.stopTremble as (() => void) | undefined;
    stop?.();
    victim.root.userData.stopTremble = undefined;
    victim.body.rotation.z = 0;
    if (victim.figure) victim.figure.group.rotation.z = 0;
  }

  /** The victim reels from a hit. */
  private async stagger(victim: PieceView, from: THREE.Vector3, amount: number): Promise<void> {
    const start = victim.root.position.clone();
    const away = start.clone().sub(from).setY(0).normalize();
    await this.anim.tween(0.25, (t) => {
      const k = Math.sin(t * Math.PI);
      victim.root.position.copy(start).addScaledVector(away, amount * t);
      victim.body.rotation.x = k * 0.35;
    }, ease.outQuad);
    victim.body.rotation.x = 0;
  }

  private hitSparks(at: THREE.Vector3, victim: PieceView, count = 40): void {
    this.particles.sparksAt(at, { count, color: TEAM_GLOW[victim.color], speed: 3.2, life: 0.6, gravity: 5 });
    this.particles.shatter(at, victim.mats.body.color, 5, 1.3, 0.1);
  }

  // -------------------------------------------------------- devour helpers

  /** Moves the victim into the attacker's mouth along a curve. */
  private async pullIntoMouth(attacker: PieceView, victim: PieceView, duration: number, lift = 0.6, spin = 0): Promise<void> {
    const start = victim.root.position.clone();
    const startScale = victim.root.scale.clone();
    await this.anim.tween(duration, (t) => {
      const mouth = attacker.mouthWorld();
      const p = start.clone().lerp(mouth.setY(mouth.y - victim.height * 0.35 * (1 - t)), t);
      p.y += Math.sin(t * Math.PI) * lift;
      victim.root.position.copy(p);
      victim.root.rotation.y += spin * 0.05;
      victim.root.rotation.x = t * 0.6;
      victim.root.scale.copy(startScale).multiplyScalar(1 - t * 0.45);
    }, ease.inOutCubic);
  }

  private async chompLoop(attacker: PieceView, victim: PieceView, chomps: number): Promise<void> {
    for (let i = 0; i < chomps; i++) {
      await this.anim.tween(0.12, (t) => (attacker.mouth = 1 - t * 0.85), ease.inQuad);
      this.sfx.chomp();
      this.stage.addShake(0.25);
      const at = attacker.mouthWorld();
      this.particles.sparksAt(at, { count: 45, color: TEAM_GLOW[victim.color], speed: 3.2, life: 0.8, gravity: 6, drag: 1 });
      this.particles.shatter(at.clone().setY(at.y - 0.2), victim.mats.body.color, 6, 1.4, 0.2);
      victim.root.scale.multiplyScalar(0.78);
      victim.body.rotation.z = (Math.random() - 0.5) * 0.8;
      await this.anim.tween(0.16, (t) => (attacker.mouth = 0.15 + t * 0.85), ease.outQuad);
    }
  }

  private async swallow(attacker: PieceView, victim: PieceView): Promise<void> {
    this.sfx.swallow();
    const s0 = victim.root.scale.clone();
    await this.anim.tween(0.3, (t) => {
      attacker.mouth = 1 - t;
      victim.root.scale.copy(s0).multiplyScalar(Math.max(0.001, 1 - t));
    }, ease.inQuad);
    victim.root.visible = false;
    // Gulp bulge.
    await this.anim.tween(0.35, (t) => {
      const bump = Math.sin(t * Math.PI) * 0.18;
      attacker.root.scale.set(1 + bump, 1 - bump * 0.5, 1 + bump);
    }, ease.outQuad);
    attacker.root.scale.setScalar(1);
    await this.burp(attacker);
  }

  private async burp(attacker: PieceView): Promise<void> {
    await this.anim.wait(0.1);
    this.sfx.growl(0.5, 60);
    await this.anim.tween(0.2, (t) => (attacker.mouth = t * 0.5), ease.outQuad);
    this.particles.sparksAt(attacker.mouthWorld(), {
      count: 60,
      color: 0xff9a3a,
      speed: 1.6,
      life: 1.2,
      gravity: -1.2,
      direction: new THREE.Vector3(Math.sin(attacker.root.rotation.y), 1, Math.cos(attacker.root.rotation.y)),
      cone: 0.5,
    });
    await this.anim.tween(0.3, (t) => (attacker.mouth = 0.5 * (1 - t)), ease.inQuad);
  }

  /** Finishes a victim with a big shatter (no eating). */
  private explode(victim: PieceView, at: THREE.Vector3, power = 3): void {
    this.particles.shatter(at, victim.mats.body.color, 40, power, victim.height * 0.6);
    this.particles.sparksAt(at, { count: 140, color: TEAM_GLOW[victim.color], speed: 4.5, life: 1, drag: 1.5 });
    this.sfx.crack();
    this.sfx.impact();
    this.stage.addShake(0.6);
    void this.stage.pulseBloom(1.8, 0.5);
    victim.root.visible = false;
  }

  // --------------------------------------------------------------- attacks

  /** Pawn: two quick stabs, a rising slash that tosses the victim, and a gulp. */
  private async swordCombo(a: PieceView, v: PieceView): Promise<void> {
    this.stopTremble(v);
    const base = a.root.position.clone();
    const fwd = v.root.position.clone().sub(base).setY(0).normalize();
    for (let i = 0; i < 2; i++) {
      await this.moves.pose(a, { draw: 1, thrust: 0 }, 0.16, ease.outQuad);
      this.sfx.slash();
      await Promise.all([
        this.moves.pose(a, { draw: 0, thrust: 1 }, 0.09, ease.outCubic),
        this.anim.tween(0.09, (t) => a.root.position.copy(base).addScaledVector(fwd, 0.14 * t)),
      ]);
      this.sfx.crack();
      this.hitSparks(a.weaponTip(), v);
      this.stage.addShake(0.2);
      await Promise.all([
        this.stagger(v, a.root.position, 0.06),
        this.anim.tween(0.2, (t) => a.root.position.copy(base).addScaledVector(fwd, 0.14 * (1 - t))),
      ]);
    }
    // Finisher: wind up, rising slash, the victim flies up into the open jaws.
    await this.moves.pose(a, { thrust: 0, draw: 0, strike: 1 }, 0.25, ease.outBack);
    this.sfx.growl(0.4, 120);
    this.sfx.slash();
    void this.fx.slashArc(v.root.position.clone().setY(0.6), a.root.rotation.y, TEAM_GLOW[a.color], true, 0.45);
    const start = v.root.position.clone();
    await Promise.all([
      this.moves.pose(a, { strike: 0, raise: 1 }, 0.14, ease.outCubic),
      this.anim.tween(0.5, (t) => {
        v.root.position.copy(start).add(new THREE.Vector3(0, Math.sin(t * Math.PI * 0.75) * 1.2, 0));
        v.root.rotation.x = t * 4;
      }, ease.outQuad),
      this.anim.tween(0.3, (t) => (a.mouth = t), ease.outBack),
    ]);
    this.hitSparks(v.root.position.clone().setY(v.root.position.y + 0.3), v, 60);
    await this.pullIntoMouth(a, v, 0.3, 0.1, 2);
    await this.moves.restPose(a, 0.1);
    await this.chompLoop(a, v, 2);
    await this.swallow(a, v);
  }

  /** Knight: backs off, lowers the lance, charges, impales and flings the victim. */
  private async joust(a: PieceView, v: PieceView): Promise<void> {
    const mount = a.mount;
    if (!mount) return;
    const V = v.root.position.clone();
    let fwd = V.clone().sub(a.root.position).setY(0);
    if (fwd.lengthSq() < 0.001) fwd = new THREE.Vector3(0, 0, 1);
    fwd.normalize();
    // Make room for the charge.
    const runUp = V.clone().addScaledVector(fwd, -2.1);
    await this.moves.gallop(a, runUp, 2.6);
    await this.moves.turn(a, a.faceTowards(V.x, V.z), 0.45);
    this.sfx.neigh();
    await Promise.all([
      this.anim.tween(0.5, (t) => (a.rear = Math.sin(t * Math.PI) * 0.7), ease.inOutQuad),
      this.anim.tween(0.5, (t) => (mount.couch = t), ease.inOutCubic),
    ]);
    this.stopTremble(v);
    // Charge until the lance tip reaches the victim.
    const hit = V.clone().addScaledVector(fwd, -1.05);
    const from = a.root.position.clone();
    const dist = from.distanceTo(hit);
    let lastBeat = mount.gallopPhase;
    this.sfx.whoosh();
    await this.anim.tween(dist / 4.2, (t) => {
      a.root.position.lerpVectors(from, hit, t);
      mount.gallop = 1;
      mount.gallopPhase += 0.45;
      if (mount.gallopPhase - lastBeat > Math.PI / 2) {
        lastBeat = mount.gallopPhase;
        this.sfx.clop();
      }
    }, ease.inQuad);
    // Impale: the victim rides the lance tip.
    this.sfx.crack();
    this.sfx.impact();
    this.stage.addShake(0.6);
    this.hitSparks(a.weaponTip(), v, 70);
    const tip = new THREE.Vector3();
    const carry = this.anim.every(() => {
      a.weaponTip(tip);
      v.root.position.set(tip.x, tip.y - v.height * 0.45, tip.z);
      return false;
    });
    v.root.rotation.x = -0.5;
    const runOut = a.root.position.clone().addScaledVector(fwd, 0.9);
    const from2 = a.root.position.clone();
    await this.anim.tween(0.45, (t) => {
      a.root.position.lerpVectors(from2, runOut, t);
      mount.gallop = 1 - t;
      mount.gallopPhase += 0.35;
    }, ease.outQuad);
    // Rear and fling the victim skyward, where it bursts.
    this.sfx.neigh();
    await Promise.all([
      this.anim.tween(0.5, (t) => {
        a.rear = t;
        mount.couch = 1 - t * 1.2;
      }, ease.outBack),
    ]);
    carry();
    const flung = v.root.position.clone();
    this.sfx.whoosh();
    await this.anim.tween(0.45, (t) => {
      v.root.position.copy(flung).add(new THREE.Vector3(fwd.x * t * 0.8, t * 0.9, fwd.z * t * 0.8));
      v.root.rotation.x += 0.35;
    }, ease.outQuad);
    this.explode(v, v.root.position.clone().setY(v.root.position.y + v.height * 0.5), 3.2);
    await this.anim.tween(0.5, (t) => {
      a.rear = 1 - t;
      mount.couch = Math.max(0, -0.2 * (1 - t));
      a.mouth = Math.sin(t * Math.PI) * 0.6;
    }, ease.outBounce);
    mount.couch = 0;
  }

  /** Bishop: charges the great sword with light and cleaves the victim in two. */
  private async cleave(a: PieceView, v: PieceView): Promise<void> {
    const glow = TEAM_GLOW[a.color];
    this.sfx.magic();
    await this.moves.pose(a, { raise: 1, guard: 0.6 }, 0.55, ease.outBack);
    const charge = this.anim.every(() => {
      this.particles.sparksAt(a.weaponTip(), { count: 3, color: glow, speed: 0.6, life: 0.4, gravity: -1 });
      return false;
    });
    this.sfx.growl(0.6, 100);
    await this.anim.wait(0.5);
    charge();
    this.stopTremble(v);
    // Hop in and bring the blade down.
    this.sfx.slash();
    await Promise.all([
      this.moves.pose(a, { raise: 0, strike: 1 }, 0.14, ease.inCubic),
      this.anim.tween(0.14, (t) => (a.hop = Math.sin(t * Math.PI) * 0.15)),
    ]);
    a.hop = 0;
    this.sfx.impact();
    this.sfx.crack();
    this.stage.addShake(0.7);
    void this.stage.pulseBloom(2, 0.5);
    void this.fx.slashArc(v.root.position.clone().setY(v.height * 0.55), a.root.rotation.y, glow, true, v.height * 0.6);
    // Cut along the vertical plane facing the bishop.
    v.borrowLight(null);
    this.stage.scene.add(this.lights[1]);
    v.root.rotation.y = a.root.rotation.y;
    v.body.rotation.set(0, 0, 0);
    const cut = this.fx.split(v.root);
    v.root.visible = false;
    const [right, left] = cut.halves;
    const r0 = right.position.clone();
    const l0 = left.position.clone();
    const sideways = new THREE.Vector3(Math.cos(a.root.rotation.y), 0, -Math.sin(a.root.rotation.y));
    this.particles.sparksAt(r0.clone().setY(v.height * 0.5), { count: 40, color: glow, speed: 1.2, life: 0.6, gravity: 2, spread: new THREE.Vector3(0, v.height * 0.5, 0) });
    await this.anim.wait(0.25);
    await this.anim.tween(0.9, (t) => {
      const apart = t * 0.32;
      right.position.copy(r0).addScaledVector(sideways, apart);
      left.position.copy(l0).addScaledVector(sideways, -apart);
      right.rotation.z = -t * 1.2;
      left.rotation.z = t * 1.2;
    }, ease.inQuad);
    this.sfx.crack();
    this.stage.addShake(0.3);
    for (const h of cut.halves) this.particles.shatter(h.position, v.mats.body.color, 16, 1.4, 0.2);
    this.particles.sparksAt(r0.clone().setY(0.2), { count: 60, color: TEAM_GLOW[v.color], speed: 2, life: 0.8 });
    await this.anim.wait(0.15);
    cut.dispose();
    await this.moves.restPose(a, 0.4);
  }

  /** Rook: grabs the victim, lifts it overhead, slams it flat and eats the pancake. */
  private async grabAndSlam(a: PieceView, v: PieceView): Promise<void> {
    this.stopTremble(v);
    this.sfx.growl(0.6, 70);
    await this.moves.pose(a, { grab: 1 }, 0.3, ease.outBack);
    // Hold the victim between both fists.
    const hand = new THREE.Vector3();
    const hold = this.anim.every(() => {
      a.weaponTip(hand);
      const yaw = a.root.rotation.y;
      const offset = (a.gear?.spec.shoulderX ?? 0.25) * a.body.scale.x;
      hand.x += Math.cos(yaw) * offset;
      hand.z -= Math.sin(yaw) * offset;
      v.root.position.set(hand.x, hand.y - v.height * 0.45, hand.z);
      return false;
    });
    this.sfx.clang();
    // Lift overhead.
    this.sfx.roar();
    await this.moves.pose(a, { grab: 0, lift: 1 }, 0.55, ease.inOutCubic);
    await this.anim.tween(0.3, (t) => (v.root.rotation.z = Math.sin(t * Math.PI * 3) * 0.4));
    // Slam.
    this.sfx.whoosh();
    await this.moves.pose(a, { lift: 0, strike: 1 }, 0.16, ease.inCubic);
    hold();
    const fwd = new THREE.Vector3(Math.sin(a.root.rotation.y), 0, Math.cos(a.root.rotation.y));
    const ground = a.root.position.clone().addScaledVector(fwd, 0.62);
    v.root.position.copy(ground);
    v.root.rotation.set(0, v.root.rotation.y, 0);
    this.sfx.splat();
    this.sfx.impact();
    this.stage.addShake(0.9);
    void this.fx.shockwave(ground, 0xb59a7a, 1.8, 0.5);
    this.particles.sparksAt(ground.clone().setY(0.05), { count: 90, color: 0xb59a7a, speed: 3.2, life: 0.8, gravity: 4, spread: new THREE.Vector3(0.6, 0, 0.6) });
    this.particles.sparksAt(ground.clone().setY(0.1), { count: 50, color: TEAM_GLOW[v.color], speed: 2.4, life: 0.7, gravity: 3 });
    await this.anim.tween(0.18, (t) => v.root.scale.set(1 + t * 0.7, Math.max(0.08, 1 - t * 0.92), 1 + t * 0.7), ease.outQuad);
    await this.anim.wait(0.35);
    // Peel it off the floor and eat it like a pizza.
    await this.moves.restPose(a, 0.25);
    await this.anim.tween(0.3, (t) => (a.mouth = t), ease.outBack);
    const start = v.root.position.clone();
    await this.anim.tween(0.5, (t) => {
      const m = a.mouthWorld();
      v.root.position.lerpVectors(start, m.setY(m.y - 0.1), t);
      v.root.rotation.x = t * 1.3;
    }, ease.inOutCubic);
    await this.chompLoop(a, v, 3);
    await this.swallow(a, v);
  }

  /** Queen: three bolts from her great staff, then a pillar of light crystallises the victim and it shatters. */
  private async sorcery(a: PieceView, v: PieceView): Promise<void> {
    const glow = TEAM_GLOW[a.color];
    this.sfx.magic();
    // She rises a little, her gown and the crystal shining.
    await Promise.all([
      this.anim.tween(0.5, (t) => (a.hop = t * 0.18), ease.outBack),
      this.moves.pose(a, { thrust: 1 }, 0.5, ease.outBack),
    ]);
    const hover = this.anim.every(() => {
      a.hop = 0.18 + Math.sin(this.anim.now * 3) * 0.03;
      return false;
    });
    this.stopTremble(v);
    for (let i = 0; i < 3; i++) {
      this.sfx.zap();
      const target = this.centerOf(v).add(new THREE.Vector3(0, (Math.random() - 0.5) * 0.3, 0));
      void this.fx.lightning(a.weaponTip(), target, glow, 0.25);
      void this.stage.pulseBloom(1.5, 0.25);
      this.stage.addShake(0.25);
      this.hitSparks(target, v, 30);
      await Promise.all([this.stagger(v, a.root.position, 0.05), this.anim.wait(0.3)]);
    }
    // Staff to the sky: a pillar of light turns the victim to crystal.
    await this.moves.pose(a, { thrust: 0, raise: 1 }, 0.4, ease.outBack);
    this.sfx.magic();
    const top = v.root.position.clone().setY(4);
    const centre = this.centerOf(v);
    for (let i = 0; i < 3; i++) void this.fx.lightning(top.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3)), centre, glow, 0.5);
    this.sfx.zap();
    void this.stage.pulseBloom(2.2, 0.7);
    this.stage.addShake(0.5);
    const crystal = new THREE.Color(glow).lerp(new THREE.Color(0xffffff), 0.5);
    const startColor = v.mats.body.color.clone();
    await this.anim.tween(0.7, (t) => {
      v.mats.body.color.copy(startColor).lerp(crystal, t);
      v.setGlow(t * 1.6);
      v.mats.body.roughness = 0.3 * (1 - t);
      v.root.scale.setScalar(1 + t * 0.06);
    }, ease.inOutQuad);
    // A tap of the staff and it shatters.
    await this.moves.pose(a, { raise: 0, strike: 1 }, 0.18, ease.inCubic);
    hover();
    this.sfx.clang();
    const at = this.centerOf(v);
    this.particles.shatter(at, crystal, 50, 2.6, v.height * 0.6);
    this.particles.sparksAt(at, { count: 160, color: glow, speed: 3.5, life: 1.1, drag: 1.2 });
    this.particles.sparksAt(at, { count: 60, color: 0xffffff, speed: 2, life: 0.8 });
    this.sfx.crack();
    this.stage.addShake(0.4);
    v.root.visible = false;
    await Promise.all([
      this.anim.tween(0.45, (t) => (a.hop = 0.18 * (1 - t)), ease.inOutQuad),
      this.moves.restPose(a, 0.45),
    ]);
    a.hop = 0;
  }

  /** King: draws his sword, cuts straight through the victim, sheathes it — and the victim falls in two. */
  private async execute(a: PieceView, v: PieceView): Promise<void> {
    const glow = TEAM_GLOW[a.color];
    await this.moves.drawSword(a);
    this.sfx.growl(0.5, 90);
    await this.anim.wait(0.35);
    this.stopTremble(v);
    // The dash: through and past the victim in one stroke.
    const V = v.root.position.clone();
    const start = a.root.position.clone();
    const fwd = V.clone().sub(start).setY(0).normalize();
    const beyond = V.clone().addScaledVector(fwd, 0.75);
    this.sfx.whoosh();
    this.sfx.slash();
    const cutHeight = this.centerOf(v).y;
    void this.fx.slashArc(V.clone().setY(cutHeight), a.root.rotation.y, glow, false, 0.45);
    await Promise.all([
      this.moves.pose(a, { guard: 0, thrust: 1 }, 0.12, ease.outCubic),
      this.anim.tween(0.28, (t) => {
        a.root.position.lerpVectors(start, beyond, t);
        a.gait = 1;
        a.gaitPhase += 0.6;
      }, ease.outCubic),
    ]);
    a.gait = 0;
    this.particles.sparksAt(V.clone().setY(cutHeight), { count: 50, color: glow, speed: 2.5, life: 0.5, spread: new THREE.Vector3(0.3, 0, 0.3) });
    // Stillness... then the sword slides home.
    await this.anim.wait(0.5);
    await this.moves.sheatheSword(a);
    // The cut lets go: the top half slides off.
    v.borrowLight(null);
    this.stage.scene.add(this.lights[1]);
    v.body.rotation.set(0, 0, 0);
    v.root.updateMatrixWorld(true);
    const localCut = v.root.worldToLocal(new THREE.Vector3(V.x, cutHeight, V.z)).y;
    const cut = this.fx.split(v.root, new THREE.Vector3(0, 1, 0), localCut);
    v.root.visible = false;
    const [upper] = cut.halves;
    const u0 = upper.position.clone();
    const u0rot = upper.rotation.clone();
    this.sfx.crack();
    this.particles.sparksAt(V.clone().setY(cutHeight), { count: 60, color: TEAM_GLOW[v.color], speed: 1.5, life: 0.7, spread: new THREE.Vector3(0.4, 0, 0.4) });
    await this.anim.tween(0.8, (t) => {
      upper.position.copy(u0).addScaledVector(fwd, t * 0.35);
      upper.position.y = u0.y - t * t * 0.25;
      upper.rotation.set(u0rot.x + t * 0.5 * fwd.z, u0rot.y, u0rot.z - t * 0.5 * fwd.x);
    }, ease.inQuad);
    this.stage.addShake(0.4);
    this.sfx.impact();
    for (const h of cut.halves) this.particles.shatter(h.position.clone().setY(0.2), v.mats.body.color, 18, 1.5, 0.3);
    await this.anim.wait(0.1);
    cut.dispose();
    await this.moves.turn(a, a.faceTowards(V.x, V.z), 0.4);
  }

  /** World-space centre of a piece's visible shape. */
  private centerOf(piece: PieceView): THREE.Vector3 {
    return new THREE.Box3().setFromObject(piece.root).getCenter(new THREE.Vector3());
  }
}
