import * as THREE from 'three';
import type { Sfx } from '../../audio/sfx';
import { ease, type Animator } from '../animation/animator';
import { Fx } from '../effects/fx';
import type { Particles } from '../effects/particles';
import { TEAM_GLOW, type PieceView } from '../pieces/pieceView';
import type { Stage } from '../stage';
import { Locomotion } from './locomotion';
import type { Variety } from './variety';

export const DUST = 0xb59a7a;

/**
 * One way of finishing a capture. `reach` is how far from the victim the
 * attacker stands when it starts (0 = stay where it is and make its own
 * approach). When `play` resolves the victim must be gone and nothing may be
 * left running; the director walks the attacker home and puts it back to sleep.
 */
export interface Finisher {
  reach: number;
  play(kit: DuelKit, attacker: PieceView, victim: PieceView): Promise<void>;
}

/**
 * Everything a duel choreography needs: the stage, effects, sounds, movement
 * and the shared beats (hits, staggers, eating, explosions) that every piece's
 * finishers are built from.
 */
export class DuelKit {
  readonly fx: Fx;
  readonly moves: Locomotion;
  /** Height a finisher wants kept in frame (a blade in the sky, a leap); the camera pulls back for it. */
  focusTop = 0;
  /** Fixed pool so the number of lights (and thus shader programs) never changes. */
  private readonly lights: [THREE.PointLight, THREE.PointLight];

  constructor(
    readonly stage: Stage,
    readonly particles: Particles,
    readonly sfx: Sfx,
    readonly variety: Variety,
  ) {
    this.lights = [new THREE.PointLight(0xff5a1a, 0, 1.6, 2), new THREE.PointLight(0xff5a1a, 0, 1.6, 2)];
    for (const l of this.lights) stage.scene.add(l);
    this.fx = new Fx(stage.scene, stage.animator);
    this.moves = new Locomotion(stage, particles, sfx, this.fx, variety);
  }

  get anim(): Animator {
    return this.stage.animator;
  }

  // ------------------------------------------------------------------ lights

  lendLights(attacker: PieceView, victim?: PieceView): void {
    attacker.borrowLight(this.lights[0]);
    victim?.borrowLight(this.lights[1]);
  }

  /** Takes the pooled lights back from any pieces holding them. */
  returnLights(...pieces: PieceView[]): void {
    for (const p of pieces) p.borrowLight(null);
    for (const l of this.lights) {
      l.intensity = 0;
      this.stage.scene.add(l);
    }
  }

  /** Takes the light out of one piece (before cloning or cutting it) without changing the light count. */
  dropLight(piece: PieceView): void {
    piece.borrowLight(null);
    for (const l of this.lights) if (!l.parent) this.stage.scene.add(l);
  }

  /**
   * Cuts the victim in two along a plane in its own space and hides the
   * original; the caller animates the halves and disposes the cut.
   */
  cut(victim: PieceView, normal: THREE.Vector3, offset: number): ReturnType<Fx['split']> {
    this.stopTremble(victim);
    this.dropLight(victim);
    victim.pitch = 0;
    victim.roll = 0;
    victim.body.rotation.set(0, 0, 0);
    victim.apply();
    const cut = this.fx.split(victim.root, normal, offset);
    victim.root.visible = false;
    return cut;
  }

  /** Brightened team colour for white-hot cut edges and crystal. */
  hot(piece: PieceView, white = 0.35): THREE.Color {
    return new THREE.Color(this.glowOf(piece)).lerp(new THREE.Color(0xffffff), white);
  }

  // ----------------------------------------------------------------- helpers

  glowOf(piece: PieceView): number {
    return TEAM_GLOW[piece.color];
  }

  /** Unit vector the piece is facing. */
  forward(piece: PieceView): THREE.Vector3 {
    const yaw = piece.root.rotation.y;
    return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  }

  /** Unit vector from one piece to another along the floor. */
  toward(from: PieceView, to: PieceView): THREE.Vector3 {
    const d = to.root.position.clone().sub(from.root.position).setY(0);
    return d.lengthSq() < 1e-6 ? this.forward(from) : d.normalize();
  }

  /** World-space centre of a piece's visible shape. */
  centerOf(piece: PieceView): THREE.Vector3 {
    return new THREE.Box3().setFromObject(piece.root).getCenter(new THREE.Vector3());
  }

  /** World-space height of the top of a piece's visible shape. */
  topOf(piece: PieceView): number {
    return new THREE.Box3().setFromObject(piece.root).max.y;
  }

  /** Lifts a piece off the floor; the knight's horse has to be moved as a whole. */
  setAltitude(piece: PieceView, y: number): void {
    if (piece.mount) piece.root.position.y = y;
    else piece.hop = y;
  }

  /** A ribbon of light following the piece's weapon; call the result to let it fade. */
  trail(piece: PieceView, color: THREE.ColorRepresentation = this.glowOf(piece)): () => void {
    return this.fx.trail((o) => piece.weaponTip(o), (o) => piece.weaponGrip(o), color);
  }

  /** Sells a heavy blow: a few frozen frames, a zoom kick and camera shake. */
  impact(power = 1): void {
    this.anim.warpTime(0.04, 0.045 + power * 0.04);
    void this.stage.punch(1.5 + power * 2.5, 0.45);
    this.stage.addShake(0.25 + power * 0.4);
  }

  /** Slow motion for `seconds` of real time. */
  slowMo(factor: number, seconds: number): void {
    this.anim.warpTime(factor, seconds);
  }

  /** Dust kicked up from the floor around a point. */
  dust(at: THREE.Vector3, count = 40, radius = 0.5, speed = 2.2): void {
    this.particles.sparksAt(at.clone().setY(0.05), { count, color: DUST, speed, life: 0.7, gravity: 3, spread: new THREE.Vector3(radius, 0, radius) });
  }

  /** A heavy landing: shockwave, dust, scorch cracks and the impact beat. */
  groundSlam(at: THREE.Vector3, power = 1, color: THREE.ColorRepresentation = DUST): void {
    this.sfx.impact();
    this.impact(power);
    void this.fx.shockwave(at, color, 1.2 + power * 0.8, 0.5);
    void this.fx.groundCrack(at, 0.7 + power * 0.5);
    this.dust(at, 50 + power * 40, 0.6, 2.4 + power);
  }

  /** Squash on touching down, springing back to shape. */
  async land(piece: PieceView, amount = 0.25, duration = 0.45): Promise<void> {
    await this.anim.tween(duration, (t) => (piece.squash = 1 - amount * (1 - t)), ease.outElastic);
    piece.squash = 1;
  }

  /** Jumps along an arc between two floor points. */
  async arc(piece: PieceView, to: THREE.Vector3, height: number, duration: number, during?: (t: number) => void): Promise<void> {
    const from = piece.root.position.clone().setY(0);
    piece.airborne = true;
    await this.anim.tween(duration, (t) => {
      const y = Math.sin(t * Math.PI) * height;
      piece.root.position.set(from.x + (to.x - from.x) * t, piece.mount ? y : 0, from.z + (to.z - from.z) * t);
      if (!piece.mount) piece.hop = y;
      during?.(t);
    }, ease.linear);
    piece.airborne = false;
    this.setAltitude(piece, 0);
    piece.root.position.y = 0;
  }

  // ------------------------------------------------------- victim reactions

  async flinch(piece: PieceView): Promise<void> {
    await this.anim.tween(0.3, (t) => (piece.pitch = -Math.sin(t * Math.PI) * 0.25), ease.outQuad);
    piece.pitch = 0;
  }

  /** The victim shakes with fear until `stopTremble`. */
  tremble(victim: PieceView): void {
    this.stopTremble(victim);
    victim.root.userData.stopTremble = this.anim.every(() => {
      victim.roll = Math.sin(this.anim.now * 70) * 0.025;
      return false;
    });
  }

  stopTremble(victim: PieceView): void {
    const stop = victim.root.userData.stopTremble as (() => void) | undefined;
    stop?.();
    victim.root.userData.stopTremble = undefined;
    victim.roll = 0;
  }

  /** The victim reels from a hit. */
  async stagger(victim: PieceView, from: THREE.Vector3, amount: number): Promise<void> {
    const start = victim.root.position.clone();
    const away = start.clone().sub(from).setY(0).normalize();
    await this.anim.tween(0.25, (t) => {
      victim.root.position.copy(start).addScaledVector(away, amount * t);
      victim.pitch = -Math.sin(t * Math.PI) * 0.35;
    }, ease.outQuad);
    victim.pitch = 0;
  }

  hitSparks(at: THREE.Vector3, victim: PieceView, count = 40): void {
    this.particles.sparksAt(at, { count, color: this.glowOf(victim), speed: 3.2, life: 0.6, gravity: 5 });
    this.particles.shatter(at, victim.mats.body.color, 5, 1.3, 0.1);
  }

  /** Finishes a victim with a big shatter (no eating). */
  explode(victim: PieceView, at: THREE.Vector3, power = 3): void {
    this.particles.shatter(at, victim.mats.body.color, 40, power, victim.height * 0.6);
    this.particles.sparksAt(at, { count: 140, color: this.glowOf(victim), speed: 4.5, life: 1, drag: 1.5 });
    this.sfx.crack();
    this.sfx.impact();
    this.stage.addShake(0.6);
    void this.stage.pulseBloom(1.8, 0.5);
    victim.root.visible = false;
  }

  /** Sparks that rush inward to a point (implosions, things being absorbed). */
  implode(centre: THREE.Vector3, color: THREE.ColorRepresentation, count: number, radius: number, life = 0.35): void {
    const from = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      from.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(radius);
      this.particles.sparksAt(centre.clone().add(from), {
        count: 1,
        color,
        speed: (radius / life) * 1.6,
        life,
        drag: 0,
        direction: from.clone().negate(),
        cone: 0.05,
      });
    }
  }

  // ---------------------------------------------------------- devour helpers

  /** Moves the victim into the attacker's mouth along a curve. */
  async pullIntoMouth(attacker: PieceView, victim: PieceView, duration: number, lift = 0.6, spin = 0): Promise<void> {
    const start = victim.root.position.clone();
    const startScale = victim.root.scale.clone();
    const pitch0 = victim.pitch;
    await this.anim.tween(duration, (t) => {
      const mouth = attacker.mouthWorld();
      const p = start.clone().lerp(mouth.setY(mouth.y - victim.height * 0.35 * (1 - t)), t);
      p.y += Math.sin(t * Math.PI) * lift;
      victim.root.position.copy(p);
      victim.twist += spin * 0.05;
      victim.pitch = pitch0 + (0.6 - pitch0) * t;
      victim.root.scale.copy(startScale).multiplyScalar(1 - t * 0.45);
    }, ease.inOutCubic);
  }

  async chompLoop(attacker: PieceView, victim: PieceView, chomps: number): Promise<void> {
    for (let i = 0; i < chomps; i++) {
      await this.anim.tween(0.12, (t) => (attacker.mouth = 1 - t * 0.85), ease.inQuad);
      this.sfx.chomp();
      this.stage.addShake(0.25);
      const at = attacker.mouthWorld();
      this.particles.sparksAt(at, { count: 45, color: this.glowOf(victim), speed: 3.2, life: 0.8, gravity: 6, drag: 1 });
      this.particles.shatter(at.clone().setY(at.y - 0.2), victim.mats.body.color, 6, 1.4, 0.2);
      victim.root.scale.multiplyScalar(0.78);
      victim.roll = (Math.random() - 0.5) * 0.8;
      await this.anim.tween(0.16, (t) => (attacker.mouth = 0.15 + t * 0.85), ease.outQuad);
    }
  }

  /** Chews on a victim that is already inside the mouth. */
  async chew(attacker: PieceView, victim: PieceView, chomps: number): Promise<void> {
    for (let i = 0; i < chomps; i++) {
      await this.anim.tween(0.14, (t) => (attacker.mouth = t * 0.6), ease.outQuad);
      await this.anim.tween(0.1, (t) => (attacker.mouth = 0.6 * (1 - t)), ease.inQuad);
      this.sfx.chomp();
      this.stage.addShake(0.18);
      this.particles.sparksAt(attacker.mouthWorld(), { count: 25, color: this.glowOf(victim), speed: 2.4, life: 0.6, gravity: 6 });
    }
  }

  async swallow(attacker: PieceView, victim: PieceView): Promise<void> {
    this.sfx.swallow();
    const s0 = victim.root.scale.clone();
    await this.anim.tween(0.3, (t) => {
      attacker.mouth = 1 - t;
      victim.root.scale.copy(s0).multiplyScalar(Math.max(0.001, 1 - t));
    }, ease.inQuad);
    victim.root.visible = false;
    await this.gulp(attacker);
  }

  /** The bulge going down, then a satisfied burp. */
  async gulp(attacker: PieceView): Promise<void> {
    await this.anim.tween(0.35, (t) => (attacker.squash = 1 - Math.sin(t * Math.PI) * 0.16), ease.outQuad);
    attacker.squash = 1;
    await this.burp(attacker);
  }

  async burp(attacker: PieceView): Promise<void> {
    await this.anim.wait(0.1);
    this.sfx.growl(0.5, 60);
    await this.anim.tween(0.2, (t) => (attacker.mouth = t * 0.5), ease.outQuad);
    const facing = this.forward(attacker);
    this.particles.sparksAt(attacker.mouthWorld(), {
      count: 60,
      color: 0xff9a3a,
      speed: 1.6,
      life: 1.2,
      gravity: -1.2,
      direction: new THREE.Vector3(facing.x, 1, facing.z),
      cone: 0.5,
    });
    await this.anim.tween(0.3, (t) => (attacker.mouth = 0.5 * (1 - t)), ease.inQuad);
  }
}
