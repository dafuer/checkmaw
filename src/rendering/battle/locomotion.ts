import * as THREE from 'three';
import type { Sfx } from '../../audio/sfx';
import { ease, lerp } from '../animation/animator';
import type { Particles } from '../effects/particles';
import { TEAM_GLOW, type PieceView } from '../pieces/pieceView';
import type { GearPose } from '../pieces/gear';
import type { Stage } from '../stage';
import type { Fx } from '../effects/fx';
import type { Variety } from './variety';
import { MARCH_NAMES, type MarchName } from './finisherNames';

export function angleLerp(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const DUST = 0xb59a7a;

/** How strongly each monster type transforms just to walk across the board. */
const MARCH_LEVEL: Record<string, number> = { p: 0.8, r: 1 };

/**
 * How pieces get around: waddling (the pawn gnasher), stomping (the rook
 * brute), marching (the tin soldier), striding (the king), gliding (the
 * queen), galloping (the mounted knight) and leaping. Also owns
 * the light "march" transformation used for ordinary, non-capturing moves.
 */
export class Locomotion {
  constructor(
    private readonly stage: Stage,
    private readonly particles: Particles,
    private readonly sfx: Sfx,
    private readonly fx: Fx,
    private readonly variety: Variety,
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
  async walk(piece: PieceView, to: THREE.Vector3, speed: number, during?: (t: number) => void): Promise<void> {
    if (piece.mounted > 0.5) return this.gallop(piece, to, speed * 1.4);
    const from = piece.root.position.clone();
    const dist = from.distanceTo(to);
    if (dist < 0.01) return;
    await this.turn(piece, piece.faceTowards(to.x, to.z), 0.25);
    const heavy = piece.type === 'r';
    const floating = piece.airborne;
    // The lady glides in her gown, the lord walks with long strides, the tin
    // soldier marches stiff-legged and the pawn gnasher waddles.
    const gliding = piece.avatar > 0.5 && piece.type === 'q';
    const striding = piece.avatar > 0.5 && piece.type === 'k';
    const marching = piece.avatar > 0.5 && piece.type === 'b';
    const waddling = piece.type === 'p' && piece.monster > 0.3;
    const stride = heavy ? 7 : striding ? 8 : marching ? 9 : waddling ? 13 : 11;
    let lastStep = 0;
    const glow = TEAM_GLOW[piece.color];
    await this.anim.tween(dist / (heavy ? speed * 0.7 : speed), (t) => {
      piece.root.position.lerpVectors(from, to, t);
      during?.(t);
      if (floating) {
        piece.root.position.y = Math.sin(this.anim.now * 5) * 0.04;
        if (Math.random() < 0.5) this.particles.sparksAt(piece.root.position.clone().setY(0.25 + piece.hop), { count: 2, color: glow, speed: 0.4, life: 0.7, gravity: -0.5 });
        return;
      }
      piece.gait = Math.min(1, Math.sin(t * Math.PI) * 3);
      piece.gaitPhase = t * dist * stride;
      if (gliding && Math.random() < 0.6) {
        this.particles.sparksAt(piece.root.position.clone().setY(0.05 + Math.random() * 0.4), { count: 2, color: TEAM_GLOW[piece.color], speed: 0.3, life: 0.8, gravity: -0.4 });
      }
      if (heavy) piece.body.rotation.z = Math.sin(piece.gaitPhase) * 0.12 * piece.gait;
      if (waddling) {
        piece.body.rotation.z = Math.sin(piece.gaitPhase) * 0.2 * piece.gait;
        piece.hop = Math.abs(Math.sin(piece.gaitPhase)) * 0.05 * piece.gait;
      }
      if (piece.gaitPhase - lastStep > Math.PI) {
        lastStep = piece.gaitPhase;
        if (gliding) {
          this.sfx.shimmer();
        } else if (striding || marching || waddling) {
          this.sfx.step();
        } else if (heavy) {
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
    if (waddling) piece.hop = 0;
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

  /** The bishop, queen or king rises out of the piece as a tin soldier, a lady or a lord. */
  async comeAlive(piece: PieceView, duration = 0.5): Promise<void> {
    const glow = TEAM_GLOW[piece.color];
    const at = piece.root.position.clone().setY(0.7);
    this.particles.sparksAt(at, { count: 70, color: glow, speed: 1.6, life: 0.9, drag: 1.5, spread: new THREE.Vector3(0.3, 1, 0.3) });
    this.particles.sparksAt(at, { count: 30, color: 0xffe9a8, speed: 1, life: 1.1, gravity: -0.6 });
    this.sfx.magic();
    await this.anim.tween(duration, (t) => (piece.avatar = t), ease.outBack);
  }

  /** The king draws the sword from his belt. */
  async drawSword(piece: PieceView): Promise<void> {
    if (!piece.figure?.sheathable) return;
    this.sfx.unsheathe();
    piece.figure.drawn = 1;
    this.particles.sparksAt(piece.weaponTip(), { count: 30, color: 0xfff1c0, speed: 1.6, life: 0.4 });
    await this.pose(piece, { guard: 1 }, 0.3, ease.outBack);
  }

  /** And puts it back. */
  async sheatheSword(piece: PieceView): Promise<void> {
    if (!piece.figure?.sheathable) return;
    await this.restPose(piece, 0.45);
    piece.figure.drawn = 0;
    this.sfx.sheathe();
  }

  /** Light transformation used to walk: legs, eyes and weapons, mouth closed. */
  async awaken(piece: PieceView): Promise<void> {
    if (piece.type === 'n') return this.mountUp(piece, 0.4);
    if (piece.figure) return this.comeAlive(piece, 0.45);
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
    const av0 = piece.avatar;
    const pitch0 = piece.pitch;
    const roll0 = piece.roll;
    const squash0 = piece.squash;
    // Finish any spin the short way round.
    const twist0 = Math.atan2(Math.sin(piece.twist), Math.cos(piece.twist));
    if (piece.figure) {
      piece.figure.drawn = 0;
      piece.figure.winding = 0;
    }
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
        piece.avatar = lerp(av0, 0, t);
        piece.pitch = lerp(pitch0, 0, t);
        piece.roll = lerp(roll0, 0, t);
        piece.twist = lerp(twist0, 0, t);
        piece.squash = lerp(squash0, 1, t);
      }, ease.inOutCubic),
      this.restPose(piece, duration),
      this.turn(piece, piece.restFacing, duration),
    ]);
    piece.airborne = false;
    piece.body.rotation.set(0, 0, 0);
    piece.root.position.y = 0;
    if (piece.mount) {
      piece.mount.gallop = 0;
      piece.mount.couch = 0;
      piece.mount.windup = 0;
    }
    if (hop0 > 0.05) this.sfx.step();
  }

  /** An ordinary move: every type has a few ways of travelling and takes a different one each time. */
  async march(piece: PieceView, to: THREE.Vector3): Promise<void> {
    const name: MarchName = this.variety.pick(`march:${piece.type}`, MARCH_NAMES[piece.type]);
    await this.styles[name](piece, to);
    await this.slumber(piece, 0.35);
  }

  /** Corner of the knight's L: the long leg first, or the short one. */
  private corner(piece: PieceView, to: THREE.Vector3, longFirst: boolean): THREE.Vector3 {
    const from = piece.root.position;
    const alongX = Math.abs(to.x - from.x) > Math.abs(to.z - from.z);
    return alongX === longFirst ? new THREE.Vector3(to.x, 0, from.z) : new THREE.Vector3(from.x, 0, to.z);
  }

  private dustAt(at: THREE.Vector3, count: number, radius = 0.4, speed = 1.3): void {
    this.particles.sparksAt(at.clone().setY(0.03), { count, color: DUST, speed, life: 0.5, gravity: 3, spread: new THREE.Vector3(radius, 0, radius) });
  }

  /** Squash on touching down, springing back to shape. */
  private async settle(piece: PieceView, amount: number, duration = 0.4): Promise<void> {
    await this.anim.tween(duration, (t) => (piece.squash = 1 - amount * (1 - t)), ease.outElastic);
    piece.squash = 1;
  }

  private readonly styles: Record<MarchName, (piece: PieceView, to: THREE.Vector3) => Promise<void>> = {
    // ------------------------------------------------------------------ pawn
    /** The gnasher waddles over on its two legs. */
    waddle: async (piece, to) => {
      await this.awaken(piece);
      await this.walk(piece, to, 1.7);
    },
    /** A string of springy little hops. */
    hops: async (piece, to) => {
      await this.awaken(piece);
      await this.turn(piece, piece.faceTowards(to.x, to.z), 0.25);
      const from = piece.root.position.clone();
      const count = Math.max(1, Math.round(from.distanceTo(to) / 0.5));
      for (let i = 0; i < count; i++) {
        await this.anim.tween(0.09, (t) => (piece.squash = 1 - t * 0.2), ease.outQuad);
        piece.airborne = true;
        await this.anim.tween(0.26, (t) => {
          piece.root.position.lerpVectors(from, to, (i + t) / count);
          piece.hop = Math.sin(t * Math.PI) * 0.3;
          piece.squash = 0.8 + Math.sin(t * Math.PI) * 0.35 + t * 0.05;
          piece.pitch = Math.cos(t * Math.PI) * 0.18;
        }, ease.linear);
        piece.airborne = false;
        piece.hop = 0;
        piece.pitch = 0;
        this.sfx.step();
        this.dustAt(piece.root.position, 8, 0.25, 1);
      }
      await this.settle(piece, 0.15, 0.3);
    },
    /** Sword up, head down, a flat-out dash that ends in a skid. */
    scurry: async (piece, to) => {
      await this.awaken(piece);
      void this.pose(piece, { raise: 1, guard: 0.5 }, 0.2, ease.outBack);
      this.sfx.growl(0.3, 220);
      await this.anim.tween(0.2, (t) => (piece.pitch = 0.32 * t), ease.outQuad);
      await this.walk(piece, to, 3.6, (t) => {
        if (Math.random() < 0.5) this.dustAt(piece.root.position, 2, 0.15, 0.8);
        piece.pitch = t < 0.85 ? 0.32 : 0.32 - ((t - 0.85) / 0.15) * 0.7;
      });
      this.dustAt(piece.root.position, 26, 0.35, 1.8);
      this.sfx.skitter();
      await Promise.all([
        this.anim.tween(0.4, (t) => (piece.pitch = -0.38 * (1 - t)), ease.outElastic),
        this.restPose(piece, 0.3),
      ]);
      piece.pitch = 0;
    },

    // ---------------------------------------------------------------- knight
    /** Rides the L: the long leg first, then the short one. */
    ride: async (piece, to) => {
      await this.mountUp(piece, 0.4);
      await this.gallop(piece, this.corner(piece, to, true), 2.6);
      await this.gallop(piece, to, 2.2);
      await this.anim.tween(0.35, (t) => (piece.rear = Math.sin(t * Math.PI) * 0.6), ease.outQuad);
      piece.rear = 0;
    },
    /** The knight's own move: one great leap over everything in the way. */
    vault: async (piece, to) => {
      await this.mountUp(piece, 0.4);
      await this.turn(piece, piece.faceTowards(to.x, to.z), 0.25);
      const mount = piece.mount;
      const from = piece.root.position.clone();
      await this.anim.tween(0.3, (t) => {
        piece.rear = t * 0.45;
        piece.squash = 1 - t * 0.12;
      }, ease.outQuad);
      this.sfx.neigh();
      this.sfx.whoosh();
      const height = 0.9 + from.distanceTo(to) * 0.25;
      await this.anim.tween(0.72, (t) => {
        piece.root.position.lerpVectors(from, to, t).setY(Math.sin(t * Math.PI) * height);
        piece.rear = 0.45 * (1 - Math.min(1, t * 3));
        piece.pitch = -0.3 + t * 0.7;
        piece.squash = 0.88 + Math.min(1, t * 4) * 0.17;
        if (mount) {
          mount.gallop = 0.4;
          mount.gallopPhase += 0.06;
        }
      }, ease.linear);
      piece.root.position.copy(to);
      if (mount) mount.gallop = 0;
      this.sfx.impact();
      this.sfx.clop();
      this.stage.addShake(0.4);
      this.dustAt(to, 45, 0.6, 2.2);
      void this.fx.shockwave(to, DUST, 1.1, 0.4);
      await Promise.all([
        this.settle(piece, 0.22, 0.45),
        this.anim.tween(0.3, (t) => (piece.pitch = 0.4 * (1 - t)), ease.outQuad),
      ]);
      piece.pitch = 0;
    },
    /** A proud rear, then a collected canter round the L, short leg first. */
    canter: async (piece, to) => {
      await this.mountUp(piece, 0.4);
      this.sfx.neigh();
      await this.anim.tween(0.55, (t) => {
        piece.rear = Math.sin(t * Math.PI) * 0.85;
        piece.mouth = Math.sin(t * Math.PI) * 0.7;
      }, ease.inOutQuad);
      piece.rear = 0;
      piece.mouth = 0;
      await this.gallop(piece, this.corner(piece, to, false), 1.9);
      await this.gallop(piece, to, 2.4);
    },

    // ---------------------------------------------------------------- bishop
    /** The tin soldier marches stiff-legged behind its shield. */
    march: async (piece, to) => {
      await this.comeAlive(piece, 0.45);
      await this.pose(piece, { guard: 1 }, 0.15);
      await this.walk(piece, to, 1.35);
    },
    /** Wound tight and let go: it shoots across the board on its heels and rocks to a stop. */
    windup: async (piece, to) => {
      await this.comeAlive(piece, 0.45);
      const figure = piece.figure;
      if (figure) figure.winding = 24;
      const rattle = this.anim.every(() => {
        piece.roll = Math.sin(this.anim.now * 90) * 0.03;
        return false;
      });
      for (let i = 0; i < 4; i++) {
        this.sfx.select();
        await this.anim.wait(0.09);
      }
      rattle();
      piece.roll = 0;
      await this.turn(piece, piece.faceTowards(to.x, to.z), 0.15);
      const from = piece.root.position.clone();
      const glow = TEAM_GLOW[piece.color];
      this.sfx.whoosh();
      await this.anim.tween(0.25 + from.distanceTo(to) / 4.2, (t) => {
        piece.root.position.lerpVectors(from, to, t);
        piece.pitch = -0.22 * Math.sin(Math.min(1, t * 1.2) * Math.PI * 0.5) * (1 - Math.max(0, t - 0.8) * 5);
        this.particles.sparksAt(piece.root.position.clone().setY(0.04), { count: 2, color: glow, speed: 0.8, life: 0.35, gravity: 2 });
      }, ease.inOutCubic);
      if (figure) figure.winding = 0;
      this.sfx.clang();
      // Rocks back and forth on its base like a toy that stopped too fast.
      await this.anim.tween(0.6, (t) => (piece.pitch = Math.sin(t * Math.PI * 4) * 0.25 * (1 - t)), ease.linear);
      piece.pitch = 0;
    },
    /** On parade: sword presented, slow and proud, with a heel click on arrival. */
    parade: async (piece, to) => {
      await this.comeAlive(piece, 0.45);
      await this.pose(piece, { raise: 0.55, guard: 0.6 }, 0.25, ease.outBack);
      await this.walk(piece, to, 1.15);
      this.sfx.clang();
      await this.anim.tween(0.18, (t) => (piece.hop = Math.sin(t * Math.PI) * 0.08), ease.outQuad);
      piece.hop = 0;
      await this.pose(piece, { raise: 1, guard: 0 }, 0.15, ease.outBack);
      await this.anim.wait(0.2);
    },

    // ------------------------------------------------------------------ rook
    /** The tower brute stomps over, shaking the board. */
    stomp: async (piece, to) => {
      await this.awaken(piece);
      await this.walk(piece, to, 1.7);
    },
    /** Stays a castle and simply grinds across the board, stone on stone. */
    slide: async (piece, to) => {
      const from = piece.root.position.clone();
      const dist = from.distanceTo(to);
      this.sfx.growl(0.3 + dist / 2.6, 42);
      await this.anim.tween(0.2, (t) => (piece.squash = 1 - t * 0.06), ease.outQuad);
      const dir = to.clone().sub(from).normalize();
      let nextGrind = 0;
      await this.anim.tween(0.25 + dist / 2.6, (t) => {
        piece.root.position.lerpVectors(from, to, t);
        piece.roll = Math.sin(this.anim.now * 55) * 0.012;
        // Dust and grit spray out behind it.
        this.particles.sparksAt(piece.root.position.clone().addScaledVector(dir, -0.3).setY(0.03), { count: 2, color: DUST, speed: 0.9, life: 0.5, gravity: 2, spread: new THREE.Vector3(0.3, 0, 0.3) });
        if (t > nextGrind) {
          nextGrind += 0.18;
          this.sfx.skitter();
          this.stage.addShake(0.06);
        }
      }, ease.inOutCubic);
      piece.roll = 0;
      this.sfx.stomp();
      this.stage.addShake(0.2);
      this.dustAt(to, 22, 0.5, 1.4);
      await this.settle(piece, 0.08, 0.35);
    },
    /** The brute crouches and clears the whole distance in one bound. */
    bound: async (piece, to) => {
      await this.awaken(piece);
      await this.turn(piece, piece.faceTowards(to.x, to.z), 0.25);
      const from = piece.root.position.clone();
      await Promise.all([
        this.pose(piece, { draw: 0.6 }, 0.25),
        this.anim.tween(0.25, (t) => (piece.squash = 1 - t * 0.25), ease.outQuad),
      ]);
      this.sfx.growl(0.4, 80);
      this.sfx.whoosh();
      piece.airborne = true;
      void this.pose(piece, { draw: 0, lift: 1 }, 0.2, ease.outBack);
      const dist = from.distanceTo(to);
      const height = 0.8 + dist * 0.15;
      await this.anim.tween(0.5 + dist * 0.05, (t) => {
        piece.root.position.lerpVectors(from, to, t);
        piece.hop = Math.sin(t * Math.PI) * height;
        piece.squash = 0.75 + Math.min(1, t * 4) * 0.35;
        piece.pitch = -0.2 + t * 0.45;
      }, ease.linear);
      piece.airborne = false;
      piece.hop = 0;
      this.sfx.impact();
      this.sfx.stomp();
      this.stage.addShake(0.6);
      this.dustAt(to, 60, 0.7, 2.6);
      void this.fx.shockwave(to, DUST, 1.5, 0.45);
      void this.fx.groundCrack(to, 0.8, 1.6);
      await Promise.all([
        this.settle(piece, 0.28, 0.45),
        this.pose(piece, { lift: 0, strike: 1 }, 0.08, ease.inQuad),
        this.anim.tween(0.3, (t) => (piece.pitch = 0.25 * (1 - t)), ease.outQuad),
      ]);
      piece.pitch = 0;
    },

    // ----------------------------------------------------------------- queen
    /** The lady glides across in her gown. */
    glide: async (piece, to) => {
      await this.comeAlive(piece, 0.45);
      await this.walk(piece, to, 1.5);
    },
    /** Staff up, and she is simply somewhere else, in a column of light. */
    blink: async (piece, to) => {
      await this.comeAlive(piece, 0.45);
      const glow = TEAM_GLOW[piece.color];
      const from = piece.root.position.clone();
      await this.pose(piece, { raise: 1 }, 0.3, ease.outBack);
      this.sfx.zap();
      void this.fx.pillar(from, glow, 4, 0.4, 0.5);
      void this.fx.afterimage(piece.root, glow, 0.5);
      await this.anim.tween(0.16, (t) => (piece.squash = 1 + t * 1.6), ease.inQuad);
      piece.root.visible = false;
      // A streak of motes crosses to where she will be.
      const path = to.clone().sub(from);
      await this.anim.tween(0.28, (t) => {
        const at = from.clone().addScaledVector(path, t).setY(0.7);
        this.particles.sparksAt(at, { count: 6, color: glow, speed: 0.6, life: 0.5, spread: new THREE.Vector3(0.15, 0.6, 0.15) });
      }, ease.inOutQuad);
      piece.root.position.copy(to);
      piece.root.visible = true;
      this.sfx.shimmer();
      void this.fx.pillar(to, glow, 4, 0.4, 0.5);
      void this.stage.pulseBloom(1.5, 0.4);
      this.particles.sparksAt(to.clone().setY(0.7), { count: 60, color: glow, speed: 2, life: 0.7, drag: 2 });
      await this.anim.tween(0.3, (t) => (piece.squash = 2.6 - 1.6 * t), ease.outBack);
      piece.squash = 1;
    },
    /** She waltzes there, turning as she goes, trailing a spiral of sparks. */
    waltz: async (piece, to) => {
      await this.comeAlive(piece, 0.45);
      await this.turn(piece, piece.faceTowards(to.x, to.z), 0.25);
      void this.pose(piece, { raise: 0.45 }, 0.3);
      const glow = TEAM_GLOW[piece.color];
      const from = piece.root.position.clone();
      const dist = from.distanceTo(to);
      const turns = Math.max(1, Math.round(dist / 2));
      let chimes = 0;
      await this.anim.tween(0.35 + dist / 1.5, (t) => {
        piece.root.position.lerpVectors(from, to, t);
        piece.twist = t * turns * Math.PI * 2;
        piece.gait = Math.sin(t * Math.PI);
        piece.gaitPhase = t * dist * 6;
        piece.hop = Math.abs(Math.sin(t * turns * Math.PI * 2)) * 0.05;
        piece.roll = Math.sin(t * Math.PI) * 0.06;
        this.particles.sparksAt(piece.weaponTip(), { count: 1, color: glow, speed: 0.3, life: 0.8, gravity: -0.3 });
        if (t * turns * 2 > chimes) {
          chimes++;
          this.sfx.shimmer();
        }
      }, ease.inOutQuad);
      piece.twist = 0;
      piece.gait = 0;
      piece.hop = 0;
      piece.roll = 0;
    },

    // ------------------------------------------------------------------ king
    /** The lord walks with long strides, sword sheathed. */
    stride: async (piece, to) => {
      await this.comeAlive(piece, 0.45);
      await this.walk(piece, to, 1.35);
    },
    /** Wary: he advances with his sword drawn and only sheathes it once he is there. */
    guarded: async (piece, to) => {
      await this.comeAlive(piece, 0.45);
      await this.drawSword(piece);
      await this.walk(piece, to, 1.25);
      await this.sheatheSword(piece);
    },
    /** In no hurry at all: a rolling swagger and a wave to his subjects. */
    swagger: async (piece, to) => {
      await this.comeAlive(piece, 0.45);
      await this.walk(piece, to, 1.05, () => {
        piece.roll = Math.sin(piece.gaitPhase * 0.5) * 0.07 * piece.gait;
      });
      piece.roll = 0;
      await this.pose(piece, { lift: 0.85 }, 0.25, ease.outBack);
      await this.anim.tween(0.6, (t) => (piece.roll = Math.sin(t * Math.PI * 4) * 0.06), ease.linear);
      piece.roll = 0;
      await this.restPose(piece, 0.25);
    },
  };
}
