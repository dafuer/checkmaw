import * as THREE from 'three';
import type { Sfx } from '../../audio/sfx';
import { ease, lerp } from '../animation/animator';
import type { Particles } from '../effects/particles';
import { TEAM_GLOW, type PieceView } from '../pieces/pieceView';
import type { GearPose } from '../pieces/gear';
import type { Stage } from '../stage';

export function angleLerp(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const DUST = 0xb59a7a;

/** How strongly each piece type transforms just to walk across the board. */
const MARCH_LEVEL: Record<string, number> = { p: 0.8, b: 0.85, r: 1, q: 0.85, k: 0.9 };

/**
 * How pieces get around: walking (spider legs), stomping (the rook brute),
 * floating (the queen), galloping (the mounted knight) and leaping. Also owns
 * the light "march" transformation used for ordinary, non-capturing moves.
 */
export class Locomotion {
  constructor(
    private readonly stage: Stage,
    private readonly particles: Particles,
    private readonly sfx: Sfx,
  ) {}

  private get anim() {
    return this.stage.animator;
  }

  async turn(piece: PieceView, angle: number, duration: number): Promise<void> {
    const from = piece.root.rotation.y;
    await this.anim.tween(duration, (t) => (piece.root.rotation.y = angleLerp(from, angle, t)), ease.inOutCubic);
  }

  /** Tweens gear pose weights to the given values (unlisted weights keep theirs). */
  async pose(piece: PieceView, to: Partial<GearPose>, duration: number, easing = ease.inOutQuad): Promise<void> {
    const gear = piece.gear;
    if (!gear) return this.anim.wait(duration);
    const from = { ...gear.pose };
    const keys = Object.keys(to) as Array<keyof GearPose>;
    await this.anim.tween(duration, (t) => {
      for (const k of keys) gear.pose[k] = lerp(from[k], to[k] ?? 0, t);
    }, easing);
  }

  async restPose(piece: PieceView, duration = 0.3): Promise<void> {
    await this.pose(piece, { raise: 0, strike: 0, draw: 0, thrust: 0, guard: 0, grab: 0, lift: 0 }, duration);
  }

  /** Walks with whatever the piece currently has: hooves, stomping legs, levitation or spider legs. */
  async walk(piece: PieceView, to: THREE.Vector3, speed: number): Promise<void> {
    if (piece.mounted > 0.5) return this.gallop(piece, to, speed * 1.4);
    const from = piece.root.position.clone();
    const dist = from.distanceTo(to);
    if (dist < 0.01) return;
    await this.turn(piece, piece.faceTowards(to.x, to.z), 0.25);
    const heavy = piece.type === 'r';
    const floating = piece.airborne;
    const stride = heavy ? 7 : 11;
    let lastStep = 0;
    const glow = TEAM_GLOW[piece.color];
    await this.anim.tween(dist / (heavy ? speed * 0.7 : speed), (t) => {
      piece.root.position.lerpVectors(from, to, t);
      if (floating) {
        piece.root.position.y = Math.sin(this.anim.now * 5) * 0.04;
        if (Math.random() < 0.5) this.particles.sparksAt(piece.root.position.clone().setY(0.25 + piece.hop), { count: 2, color: glow, speed: 0.4, life: 0.7, gravity: -0.5 });
        return;
      }
      piece.gait = Math.min(1, Math.sin(t * Math.PI) * 3);
      piece.gaitPhase = t * dist * stride;
      if (heavy) piece.body.rotation.z = Math.sin(piece.gaitPhase) * 0.12 * piece.gait;
      if (piece.gaitPhase - lastStep > Math.PI) {
        lastStep = piece.gaitPhase;
        if (heavy) {
          this.sfx.stomp();
          this.stage.addShake(0.18);
          this.particles.sparksAt(piece.root.position.clone().setY(0.03), { count: 14, color: DUST, speed: 1.3, life: 0.5, gravity: 3, spread: new THREE.Vector3(0.4, 0, 0.4) });
        } else {
          this.sfx.skitter();
        }
      }
    }, heavy ? ease.linear : ease.inOutQuad);
    piece.gait = 0;
    piece.body.rotation.z = 0;
    piece.root.position.y = 0;
  }

  /** The mounted knight gallops with hoof beats and dust. */
  async gallop(piece: PieceView, to: THREE.Vector3, speed: number): Promise<void> {
    const mount = piece.mount;
    const from = piece.root.position.clone();
    const dist = from.distanceTo(to);
    if (!mount || dist < 0.01) return;
    await this.turn(piece, piece.faceTowards(to.x, to.z), 0.25);
    let lastBeat = mount.gallopPhase;
    await this.anim.tween(dist / speed, (t) => {
      piece.root.position.lerpVectors(from, to, t);
      mount.gallop = Math.min(1, Math.sin(t * Math.PI) * 2.5 + 0.2);
      mount.gallopPhase += 0.32;
      if (mount.gallopPhase - lastBeat > Math.PI / 2) {
        lastBeat = mount.gallopPhase;
        this.sfx.clop();
        if (Math.random() < 0.6) this.particles.sparksAt(piece.root.position.clone().setY(0.03), { count: 5, color: DUST, speed: 0.9, life: 0.4, gravity: 3, spread: new THREE.Vector3(0.2, 0, 0.2) });
      }
    }, ease.inOutQuad);
    mount.gallop = 0;
  }

  async leap(piece: PieceView, to: THREE.Vector3, duration: number): Promise<void> {
    const from = piece.root.position.clone();
    await this.turn(piece, piece.faceTowards(to.x, to.z), 0.2);
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
    this.particles.sparksAt(to.clone().setY(0.05), { count: 50, color: DUST, speed: 2.4, life: 0.7, gravity: 3, spread: new THREE.Vector3(0.6, 0, 0.6) });
  }

  /** Plain move along the board with a small bob (quick mode). */
  async glide(piece: PieceView, to: THREE.Vector3, duration: number, arc = 0.25): Promise<void> {
    const from = piece.root.position.clone();
    await this.anim.tween(duration, (t) => {
      piece.root.position.lerpVectors(from, to, t);
      piece.hop = Math.sin(t * Math.PI) * arc;
    }, ease.inOutCubic);
    piece.hop = 0;
    this.sfx.step();
  }

  /** Mounts the knight on its war horse. */
  async mountUp(piece: PieceView, duration = 0.45): Promise<void> {
    const glow = TEAM_GLOW[piece.color];
    this.particles.sparksAt(piece.root.position.clone().setY(0.5), { count: 50, color: glow, speed: 2.2, life: 0.6, drag: 2 });
    this.sfx.neigh();
    await this.anim.tween(duration, (t) => (piece.mounted = t), ease.outBack);
  }

  /** Light transformation used to walk: legs, eyes and weapons, mouth closed. */
  async awaken(piece: PieceView): Promise<void> {
    if (piece.type === 'n') return this.mountUp(piece, 0.4);
    const level = MARCH_LEVEL[piece.type] ?? 0.8;
    const glow = TEAM_GLOW[piece.color];
    this.sfx.skitter();
    this.particles.sparksAt(piece.root.position.clone().setY(piece.height * 0.5), { count: 30, color: glow, speed: 1.8, life: 0.5, drag: 2 });
    const floating = piece.type === 'q';
    if (floating) piece.airborne = true;
    await this.anim.tween(0.35, (t) => {
      piece.monster = t * level;
      piece.armed = t;
      if (floating) piece.hop = t * 0.3;
    }, ease.outBack);
  }

  /** Undoes awaken() and any battle transformation, facing the board again. */
  async slumber(piece: PieceView, duration = 0.4): Promise<void> {
    const m0 = piece.monster;
    const mouth0 = piece.mouth;
    const a0 = piece.armed;
    const mt0 = piece.mounted;
    const hop0 = piece.hop;
    const tongue0 = piece.tongueOut;
    const reach0 = piece.tentacleReach;
    const rear0 = piece.rear;
    await Promise.all([
      this.anim.tween(duration, (t) => {
        piece.monster = lerp(m0, 0, t);
        piece.mouth = lerp(mouth0, 0, t);
        piece.armed = lerp(a0, 0, t);
        piece.mounted = lerp(mt0, 0, t);
        piece.hop = lerp(hop0, 0, t);
        piece.tongueOut = lerp(tongue0, 0, t);
        piece.tentacleReach = lerp(reach0, 0, t);
        piece.rear = lerp(rear0, 0, t);
      }, ease.inOutCubic),
      this.restPose(piece, duration),
      this.turn(piece, piece.restFacing, duration),
    ]);
    piece.airborne = false;
    piece.body.rotation.set(0, 0, 0);
    if (hop0 > 0.05) this.sfx.step();
  }

  /** An ordinary move: every type travels in its own way. */
  async march(piece: PieceView, to: THREE.Vector3): Promise<void> {
    await this.awaken(piece);
    if (piece.type === 'n') {
      // Ride the L: the long leg first, then the short one.
      const from = piece.root.position;
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const corner = Math.abs(dx) > Math.abs(dz) ? new THREE.Vector3(to.x, 0, from.z) : new THREE.Vector3(from.x, 0, to.z);
      await this.gallop(piece, corner, 2.6);
      await this.gallop(piece, to, 2.2);
      piece.rear = 0;
      await this.anim.tween(0.35, (t) => (piece.rear = Math.sin(t * Math.PI) * 0.6), ease.outQuad);
    } else {
      if (piece.type === 'b') await this.pose(piece, { guard: 1 }, 0.15);
      if (piece.type === 'k') await this.pose(piece, { lift: 0.25 }, 0.15);
      const speed = piece.type === 'q' ? 2.2 : piece.type === 'k' ? 1.3 : 1.7;
      await this.walk(piece, to, speed);
    }
    await this.slumber(piece, 0.35);
  }
}
