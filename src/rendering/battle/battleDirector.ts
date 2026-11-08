import * as THREE from 'three';
import type { Sfx } from '../../audio/sfx';
import type { Stage } from '../stage';
import type { Particles } from '../effects/particles';
import { ease, lerp } from '../animation/animator';
import { TEAM_GLOW, type PieceView } from '../pieces/pieceView';

export interface BattleHooks {
  letterbox(on: boolean): void;
  caption(text: string | null): void;
}

type DevourStyle = 'bite' | 'tongue' | 'tentacles' | 'siege' | 'vortex' | 'pounce';

const STYLE_BY_TYPE: Record<string, DevourStyle> = {
  p: 'bite',
  n: 'pounce',
  b: 'tongue',
  r: 'siege',
  q: 'tentacles',
  k: 'vortex',
};

const PIECE_NAMES: Record<string, string> = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };

function angleLerp(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/**
 * Choreographs a capture as a short monster fight: transformation, threat
 * display, approach, devour and return. Every beat is an awaited tween, so the
 * whole battle reads top-to-bottom and respects the animator speed.
 */
export class BattleDirector {
  /** Fixed pool so the number of lights (and thus shader programs) never changes. */
  private readonly lights: [THREE.PointLight, THREE.PointLight];

  constructor(
    private readonly stage: Stage,
    private readonly particles: Particles,
    private readonly sfx: Sfx,
    private readonly hooks: BattleHooks,
  ) {
    this.lights = [new THREE.PointLight(0xff5a1a, 0, 1.6, 2), new THREE.PointLight(0xff5a1a, 0, 1.6, 2)];
    for (const l of this.lights) stage.scene.add(l);
  }

  private get anim() {
    return this.stage.animator;
  }

  async battle(attacker: PieceView, victim: PieceView, destination: THREE.Vector3): Promise<void> {
    const style = STYLE_BY_TYPE[attacker.type];
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
    await this.transform(attacker, true);
    this.hooks.caption(null);
    await this.victimDefies(victim, attacker);

    const stopDistance = style === 'tongue' || style === 'tentacles' ? 1.35 : style === 'vortex' ? 1.15 : 0.62;
    const stop = V.clone().addScaledVector(dir, -Math.min(stopDistance, A.distanceTo(V) - 0.1));
    if (A.distanceTo(stop) > 0.05) {
      if (style === 'pounce') await this.leap(attacker, stop, 0.9);
      else await this.walk(attacker, stop, 2.1);
    }

    switch (style) {
      case 'tongue':
        await this.devourWithTongue(attacker, victim);
        break;
      case 'tentacles':
        await this.devourWithTentacles(attacker, victim);
        break;
      case 'siege':
        await this.devourSiege(attacker, victim);
        break;
      case 'vortex':
        await this.devourVortex(attacker, victim);
        break;
      default:
        await this.devourBite(attacker, victim, style === 'pounce' ? 2 : 3);
    }

    await this.burp(attacker);
    if (attacker.root.position.distanceTo(destination) > 0.05) {
      if (style === 'pounce') await this.leap(attacker, destination, 0.7);
      else await this.walk(attacker, destination, 2.4);
    }
    stopTracking();
    const back = this.stage.flyTo(savedPose, 1.0);
    await Promise.all([this.transform(attacker, false), this.turn(attacker, attacker.restFacing, 0.6)]);
    await back;
    this.returnLights(attacker, victim);
    this.hooks.letterbox(false);
    this.stage.controls.enabled = true;
  }

  private returnLights(...pieces: PieceView[]): void {
    for (const p of pieces) p.borrowLight(null);
    for (const l of this.lights) {
      l.intensity = 0;
      this.stage.scene.add(l);
    }
  }

  /** Short version used when cinematics are disabled. */
  async quickCapture(attacker: PieceView, victim: PieceView, destination: THREE.Vector3): Promise<void> {
    const vpos = victim.root.position.clone();
    this.particles.shatter(vpos, victim.mats.body.color, 26, 2.2, victim.height);
    this.particles.sparksAt(vpos.clone().setY(0.5), { count: 40, color: TEAM_GLOW[victim.color], speed: 3, life: 0.8 });
    this.sfx.crack();
    victim.root.visible = false;
    await this.glide(attacker, destination, 0.45);
  }

  // ------------------------------------------------------------------ beats

  private async frameFight(A: THREE.Vector3, V: THREE.Vector3, current: THREE.Vector3, duration: number): Promise<void> {
    const mid = A.clone().add(V).multiplyScalar(0.5);
    const d = V.clone().sub(A).setY(0);
    const len = Math.max(0.8, d.length());
    d.normalize();
    let side = new THREE.Vector3(-d.z, 0, d.x);
    // Stay on the same side of the fight as the current camera.
    if (side.dot(current.clone().sub(mid)) < 0) side = side.negate();
    // High three-quarter view: close enough to read the monsters, high enough
    // that bystander pieces in the foreground do not hide the fight.
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
      const dist = 2.6 + separation * 0.55 + top * 0.6;
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
      this.turn(a, a.faceTowards(pb.x, pb.z), duration),
      this.turn(b, b.faceTowards(pa.x, pa.z), duration),
    ]);
  }

  private async turn(piece: PieceView, angle: number, duration: number): Promise<void> {
    const from = piece.root.rotation.y;
    await this.anim.tween(duration, (t) => (piece.root.rotation.y = angleLerp(from, angle, t)), ease.inOutCubic);
  }

  /** Shell cracks, legs burst out, the jaw splits open with a roar. */
  private async transform(piece: PieceView, toMonster: boolean): Promise<void> {
    if (!toMonster) {
      const m0 = piece.monster;
      const mouth0 = piece.mouth;
      this.sfx.skitter();
      await this.anim.tween(0.8, (t) => {
        piece.monster = lerp(m0, 0, t);
        piece.mouth = lerp(mouth0, 0, t);
        piece.tongueOut = lerp(piece.tongueOut, 0, t);
        piece.tentacleReach = lerp(piece.tentacleReach, 0, t);
      }, ease.inOutCubic);
      piece.body.rotation.set(0, 0, 0);
      return;
    }
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

    // 2. Burst: shards fly off, legs and teeth erupt.
    this.particles.shatter(center, piece.mats.body.color, 22, 1.8, piece.height * 0.6);
    this.particles.sparksAt(center, { count: 90, color: glow, speed: 4.5, life: 0.9, drag: 2.5 });
    this.stage.addShake(0.5);
    void this.stage.pulseBloom(1.8, 0.6);
    this.sfx.impact();
    await this.anim.tween(0.7, (t) => {
      piece.monster = t;
    }, ease.outElastic);

    // 3. Roar.
    this.sfx.roar();
    this.stage.addShake(0.35);
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
    await this.anim.tween(0.3, (t) => {
      piece.mouth = 1 - t * 0.7;
      piece.body.rotation.x = -0.15 * (1 - t);
    });
  }

  /** The victim grows fangs too and snaps back before losing. */
  private async victimDefies(victim: PieceView, attacker: PieceView): Promise<void> {
    this.sfx.growl(0.7, 140);
    await this.anim.tween(0.45, (t) => {
      victim.monster = t * 0.75;
      victim.body.rotation.z = Math.sin(t * 50) * 0.05;
    }, ease.outBack);
    // Snap!
    const start = victim.root.position.clone();
    const toward = attacker.root.position.clone().sub(start).setY(0).normalize();
    await this.anim.tween(0.18, (t) => {
      victim.mouth = t;
      victim.root.position.copy(start).addScaledVector(toward, t * 0.18);
    }, ease.outQuad);
    this.sfx.chomp();
    await this.anim.tween(0.12, (t) => (victim.mouth = 1 - t), ease.inQuad);
    await Promise.all([
      this.anim.tween(0.3, (t) => victim.root.position.copy(start).addScaledVector(toward, 0.18 * (1 - t)), ease.inOutQuad),
      this.flinch(attacker),
    ]);
    victim.body.rotation.z = 0;
    // Fear: trembling.
    const stopTremble = this.anim.every(() => {
      victim.body.rotation.z = Math.sin(this.anim.now * 70) * 0.025;
      return false;
    });
    victim.root.userData.stopTremble = stopTremble;
  }

  private async flinch(piece: PieceView): Promise<void> {
    await this.anim.tween(0.3, (t) => {
      piece.body.rotation.x = -Math.sin(t * Math.PI) * 0.25;
    }, ease.outQuad);
    piece.body.rotation.x = 0;
  }

  private async walk(piece: PieceView, to: THREE.Vector3, speed: number): Promise<void> {
    const from = piece.root.position.clone();
    const dist = from.distanceTo(to);
    if (dist < 0.01) return;
    await this.turn(piece, piece.faceTowards(to.x, to.z), 0.25);
    const stepTimer = this.anim.every(() => false);
    let lastStep = 0;
    await this.anim.tween(dist / speed, (t) => {
      piece.root.position.lerpVectors(from, to, t);
      piece.gait = Math.min(1, Math.sin(t * Math.PI) * 3);
      piece.gaitPhase = t * dist * 11;
      if (piece.gaitPhase - lastStep > Math.PI) {
        lastStep = piece.gaitPhase;
        this.sfx.skitter();
      }
    }, ease.inOutQuad);
    stepTimer();
    piece.gait = 0;
  }

  private async leap(piece: PieceView, to: THREE.Vector3, duration: number): Promise<void> {
    const from = piece.root.position.clone();
    await this.turn(piece, piece.faceTowards(to.x, to.z), 0.2);
    // Crouch.
    await this.anim.tween(0.2, (t) => (piece.hop = -0.12 * t), ease.outQuad);
    this.sfx.whoosh();
    piece.airborne = true;
    const height = 1.2 + from.distanceTo(to) * 0.3;
    await this.anim.tween(duration, (t) => {
      piece.root.position.lerpVectors(from, to, t);
      piece.hop = Math.sin(t * Math.PI) * height - 0.12 * (1 - t);
      piece.body.rotation.x = Math.sin(t * Math.PI * 2) * 0.25;
    }, ease.linear);
    piece.airborne = false;
    piece.hop = 0;
    piece.body.rotation.x = 0;
    this.sfx.impact();
    this.stage.addShake(0.45);
    this.particles.sparksAt(to.clone().setY(0.05), { count: 50, color: 0xb59a7a, speed: 2.4, life: 0.7, gravity: 3, spread: new THREE.Vector3(0.6, 0, 0.6) });
  }

  /** Plain move along the board with a small bob (used for quick captures). */
  async glide(piece: PieceView, to: THREE.Vector3, duration: number, arc = 0.25): Promise<void> {
    const from = piece.root.position.clone();
    await this.anim.tween(duration, (t) => {
      piece.root.position.lerpVectors(from, to, t);
      piece.hop = Math.sin(t * Math.PI) * arc;
    }, ease.inOutCubic);
    piece.hop = 0;
    this.sfx.step();
  }

  private stopTremble(victim: PieceView): void {
    const stop = victim.root.userData.stopTremble as (() => void) | undefined;
    stop?.();
    victim.body.rotation.z = 0;
  }

  /** Moves the victim into the attacker's mouth along a curve. */
  private async pullIntoMouth(attacker: PieceView, victim: PieceView, duration: number, lift = 0.6, spin = 0): Promise<void> {
    const start = victim.root.position.clone();
    const startScale = victim.root.scale.x;
    await this.anim.tween(duration, (t) => {
      const mouth = attacker.mouthWorld();
      const p = start.clone().lerp(mouth.setY(mouth.y - victim.height * 0.35 * (1 - t)), t);
      p.y += Math.sin(t * Math.PI) * lift;
      victim.root.position.copy(p);
      victim.root.rotation.y += spin * 0.05;
      victim.root.rotation.x = t * 0.6;
      victim.root.scale.setScalar(startScale * (1 - t * 0.45));
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
    const s0 = victim.root.scale.x;
    await this.anim.tween(0.3, (t) => {
      attacker.mouth = 1 - t;
      victim.root.scale.setScalar(s0 * (1 - t));
    }, ease.inQuad);
    victim.root.visible = false;
    // Gulp bulge.
    await this.anim.tween(0.35, (t) => {
      const bump = Math.sin(t * Math.PI) * 0.18;
      attacker.root.scale.set(1 + bump, 1 - bump * 0.5, 1 + bump);
    }, ease.outQuad);
    attacker.root.scale.setScalar(1);
  }

  private async devourBite(attacker: PieceView, victim: PieceView, chomps: number): Promise<void> {
    this.stopTremble(victim);
    const base = attacker.root.position.clone();
    const fwd = victim.root.position.clone().sub(base).setY(0).normalize();
    this.sfx.growl(0.6, 90);
    await this.anim.tween(0.25, (t) => {
      attacker.mouth = 0.3 + t * 0.7;
      attacker.root.position.copy(base).addScaledVector(fwd, -0.12 * t);
    }, ease.outQuad);
    this.sfx.whoosh();
    await Promise.all([
      this.anim.tween(0.22, (t) => attacker.root.position.copy(base).addScaledVector(fwd, -0.12 + 0.3 * t), ease.inCubic),
      this.pullIntoMouth(attacker, victim, 0.3, 0.25),
    ]);
    await this.chompLoop(attacker, victim, chomps);
    await this.swallow(attacker, victim);
    await this.anim.tween(0.25, (t) => attacker.root.position.copy(base).addScaledVector(fwd, 0.18 * (1 - t)), ease.inOutQuad);
  }

  private async devourWithTongue(attacker: PieceView, victim: PieceView): Promise<void> {
    this.stopTremble(victim);
    this.sfx.magic();
    await this.anim.tween(0.25, (t) => (attacker.mouth = 0.4 + t * 0.6), ease.outBack);
    this.sfx.whoosh();
    attacker.aimTongue(victim.root.position.clone().setY(victim.height * 0.6));
    await this.anim.tween(0.25, (t) => (attacker.tongueOut = t), ease.outCubic);
    this.particles.sparksAt(victim.root.position.clone().setY(0.6), { count: 40, color: 0xff3a6a, speed: 2.5, life: 0.6 });
    this.sfx.chomp();
    await Promise.all([
      this.anim.tween(0.55, (t) => (attacker.tongueOut = 1 - t), ease.inOutCubic),
      this.pullIntoMouth(attacker, victim, 0.55, 0.7, 1),
    ]);
    await this.chompLoop(attacker, victim, 2);
    await this.swallow(attacker, victim);
  }

  private async devourWithTentacles(attacker: PieceView, victim: PieceView): Promise<void> {
    this.stopTremble(victim);
    this.sfx.growl(0.9, 110);
    await this.anim.tween(0.45, (t) => {
      attacker.tentacleReach = t;
      attacker.mouth = 0.4 + t * 0.6;
    }, ease.outBack);
    this.sfx.impact();
    this.stage.addShake(0.3);
    // Lift the victim high, shake it.
    const start = victim.root.position.clone();
    await this.anim.tween(0.6, (t) => {
      victim.root.position.copy(start).add(new THREE.Vector3(Math.sin(t * 30) * 0.05 * t, t * 1.1, 0));
      victim.root.rotation.z = Math.sin(t * 22) * 0.4 * t;
    }, ease.outCubic);
    await Promise.all([
      this.anim.tween(0.5, (t) => (attacker.tentacleReach = 1 - t), ease.inOutCubic),
      this.pullIntoMouth(attacker, victim, 0.5, 0.2, 2),
    ]);
    victim.root.rotation.z = 0;
    await this.chompLoop(attacker, victim, 3);
    await this.swallow(attacker, victim);
  }

  private async devourSiege(attacker: PieceView, victim: PieceView): Promise<void> {
    this.stopTremble(victim);
    // Ground slam.
    await this.anim.tween(0.25, (t) => (attacker.hop = t * 0.35), ease.outQuad);
    await this.anim.tween(0.12, (t) => (attacker.hop = 0.35 * (1 - t)), ease.inQuad);
    this.sfx.impact();
    this.stage.addShake(0.8);
    this.particles.sparksAt(attacker.root.position.clone().setY(0.05), { count: 80, color: 0xb59a7a, speed: 3.5, life: 0.8, gravity: 4, spread: new THREE.Vector3(1, 0, 1) });
    // Victim is thrown up by the slam and falls into the gaping maw.
    const start = victim.root.position.clone();
    this.sfx.roar();
    await Promise.all([
      this.anim.tween(0.4, (t) => (attacker.mouth = t), ease.outBack),
      this.anim.tween(0.45, (t) => {
        victim.root.position.copy(start).add(new THREE.Vector3(0, t * 1.6, 0));
        victim.root.rotation.x = t * 2;
      }, ease.outCubic),
    ]);
    await this.pullIntoMouth(attacker, victim, 0.45, 0.5, 3);
    await this.chompLoop(attacker, victim, 2);
    await this.swallow(attacker, victim);
  }

  private async devourVortex(attacker: PieceView, victim: PieceView): Promise<void> {
    this.stopTremble(victim);
    this.sfx.roar();
    await this.anim.tween(0.4, (t) => (attacker.mouth = t), ease.outBack);
    const glow = TEAM_GLOW[attacker.color];
    const start = victim.root.position.clone();
    const stopVortex = this.anim.every(() => {
      const m = attacker.mouthWorld();
      const a = Math.random() * Math.PI * 2;
      const r = 0.8 + Math.random() * 0.8;
      const p = new THREE.Vector3(m.x + Math.cos(a) * r, m.y + (Math.random() - 0.5) * 1, m.z + Math.sin(a) * r);
      this.particles.sparksAt(p, { count: 2, color: glow, speed: 0.1, life: 0.5, direction: m.clone().sub(p), cone: 0 });
      return false;
    });
    this.stage.addShake(0.4);
    await this.anim.tween(1.0, (t) => {
      const m = attacker.mouthWorld();
      const swirl = (1 - t) * 0.5;
      victim.root.position.set(
        lerp(start.x, m.x, t * t) + Math.cos(t * 18) * swirl,
        lerp(start.y, m.y - 0.2, t) + Math.sin(t * Math.PI) * 0.5,
        lerp(start.z, m.z, t * t) + Math.sin(t * 18) * swirl,
      );
      victim.root.rotation.y += 0.4;
      victim.root.scale.setScalar(1 - t * 0.5);
    }, ease.inCubic);
    stopVortex();
    await this.chompLoop(attacker, victim, 2);
    await this.swallow(attacker, victim);
  }

  private async burp(attacker: PieceView): Promise<void> {
    await this.anim.wait(0.15);
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
}
