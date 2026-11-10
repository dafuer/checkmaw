import * as THREE from 'three';
import { ease } from '../../animation/animator';
import type { Finisher } from '../duelKit';

/** Two quick stabs, a rising slash that tosses the victim, and a gulp. */
const gulp: Finisher = {
  reach: 0.6,
  async play(kit, a, v) {
    kit.stopTremble(v);
    const base = a.root.position.clone();
    const fwd = kit.toward(a, v);
    const endTrail = kit.trail(a);
    for (let i = 0; i < 2; i++) {
      await kit.moves.pose(a, { draw: 1, thrust: 0 }, 0.16, ease.outQuad);
      kit.sfx.slash();
      await Promise.all([
        kit.moves.pose(a, { draw: 0, thrust: 1 }, 0.09, ease.outCubic),
        kit.anim.tween(0.09, (t) => a.root.position.copy(base).addScaledVector(fwd, 0.14 * t)),
      ]);
      kit.sfx.crack();
      kit.hitSparks(a.weaponTip(), v);
      kit.impact(0.2);
      await Promise.all([
        kit.stagger(v, a.root.position, 0.06),
        kit.anim.tween(0.2, (t) => a.root.position.copy(base).addScaledVector(fwd, 0.14 * (1 - t))),
      ]);
    }
    // Finisher: wind up, rising slash, the victim flies up into the open jaws.
    await kit.moves.pose(a, { thrust: 0, draw: 0, strike: 1 }, 0.25, ease.outBack);
    kit.sfx.growl(0.4, 120);
    kit.sfx.slash();
    void kit.fx.slashArc(v.root.position.clone().setY(0.6), a.root.rotation.y, kit.glowOf(a), true, 0.45);
    const start = v.root.position.clone();
    kit.slowMo(0.35, 0.3);
    await Promise.all([
      kit.moves.pose(a, { strike: 0, raise: 1 }, 0.14, ease.outCubic),
      kit.anim.tween(0.5, (t) => {
        v.root.position.copy(start).setY(Math.sin(t * Math.PI * 0.75) * 1.2);
        v.pitch = t * 4;
      }, ease.outQuad),
      kit.anim.tween(0.3, (t) => (a.mouth = t), ease.outBack),
    ]);
    endTrail();
    kit.hitSparks(v.root.position.clone().setY(v.root.position.y + 0.3), v, 60);
    await kit.pullIntoMouth(a, v, 0.3, 0.1, 2);
    await kit.moves.restPose(a, 0.1);
    await kit.chompLoop(a, v, 2);
    await kit.swallow(a, v);
  },
};

/** A buckler bash leaves the victim seeing stars; the gnasher leaps and swallows it whole from above. */
const pounce: Finisher = {
  reach: 0.75,
  async play(kit, a, v) {
    kit.stopTremble(v);
    const base = a.root.position.clone();
    const V = v.root.position.clone();
    const fwd = kit.toward(a, v);
    // Shield bash.
    await Promise.all([
      kit.moves.pose(a, { guard: 1 }, 0.16, ease.outQuad),
      kit.anim.tween(0.16, (t) => (a.pitch = -0.2 * t), ease.outQuad),
    ]);
    await kit.anim.tween(0.1, (t) => {
      a.root.position.copy(base).addScaledVector(fwd, 0.3 * t);
      a.pitch = -0.2 + 0.45 * t;
    }, ease.inQuad);
    kit.sfx.clang();
    kit.impact(0.5);
    kit.particles.sparksAt(a.root.position.clone().addScaledVector(fwd, 0.25).setY(0.5), { count: 60, color: 0xffd27a, speed: 3.5, life: 0.45, gravity: 4 });
    void kit.fx.dizzyStars((o) => o.copy(v.root.position).setY(kit.topOf(v) + 0.15), 0xffe27a, 1.5);
    // The victim sways, dazed, while the gnasher hops back and crouches.
    const dazed = kit.anim.every(() => {
      v.roll = Math.sin(kit.anim.now * 6) * 0.12;
      v.pitch = Math.cos(kit.anim.now * 4.3) * 0.08;
      return false;
    });
    await Promise.all([
      kit.stagger(v, a.root.position, 0.08),
      kit.moves.pose(a, { guard: 0 }, 0.3),
      kit.anim.tween(0.3, (t) => {
        a.root.position.copy(base).addScaledVector(fwd, 0.3 * (1 - t));
        a.pitch = 0.25 * (1 - t);
      }, ease.outQuad),
    ]);
    kit.sfx.growl(0.5, 150);
    await kit.anim.tween(0.3, (t) => {
      a.squash = 1 - t * 0.3;
      a.mouth = t * 0.4;
    }, ease.outQuad);
    // Leap, jaws first.
    kit.sfx.whoosh();
    const target = v.root.position.clone().setY(0);
    kit.slowMo(0.3, 0.45);
    await kit.arc(a, target, 1.35, 0.62, (t) => {
      a.squash = 0.7 + Math.min(1, t * 4) * 0.45 - Math.max(0, t - 0.8) * 0.75;
      a.mouth = 0.4 + Math.min(1, t * 2) * 0.6;
      a.pitch = Math.max(0, t - 0.35) * 2.3;
      if (t > 0.72) {
        // The victim is sucked up into the falling jaws.
        const k = (t - 0.72) / 0.28;
        v.root.scale.setScalar(1 - k * 0.7);
        v.root.position.y = k * 0.15;
      }
    });
    dazed();
    v.root.visible = false;
    V.setY(0);
    kit.sfx.chomp();
    kit.sfx.splat();
    kit.groundSlam(V, 0.8);
    kit.particles.sparksAt(V.clone().setY(0.3), { count: 80, color: kit.glowOf(v), speed: 3.5, life: 0.8, gravity: 5 });
    kit.particles.shatter(V.clone().setY(0.1), v.mats.body.color, 14, 2, 0.2);
    await kit.anim.tween(0.35, (t) => {
      a.pitch = 1.5 * (1 - t);
      a.mouth = 1 - t;
      a.squash = 0.7 + 0.3 * t;
    }, ease.outBack);
    a.pitch = 0;
    a.squash = 1;
    await kit.chew(a, v, 2);
    await kit.gulp(a);
  },
};

/** A spinning-top flurry that shreds the victim; the gnasher ends up too dizzy to stand straight. */
const whirlwind: Finisher = {
  reach: 0.62,
  async play(kit, a, v) {
    kit.stopTremble(v);
    const glow = kit.glowOf(a);
    const base = a.root.position.clone();
    const fwd = kit.toward(a, v);
    await kit.moves.pose(a, { draw: 1 }, 0.2, ease.outBack);
    kit.sfx.growl(0.5, 160);
    await kit.moves.pose(a, { draw: 0, thrust: 1, guard: 0.6 }, 0.12, ease.outQuad);
    const endTrail = kit.trail(a);
    const turns = 4;
    let cuts = 0;
    kit.sfx.whoosh();
    await kit.anim.tween(1.25, (t) => {
      a.twist = t * turns * Math.PI * 2;
      a.root.position.copy(base).addScaledVector(fwd, Math.sin(t * Math.PI) * 0.16);
      a.roll = Math.sin(t * Math.PI) * 0.12;
      a.hop = Math.sin(t * Math.PI) * 0.06;
      // The blade crosses the victim once per turn.
      const passed = Math.floor(t * turns + 0.5);
      if (passed > cuts && cuts < turns) {
        cuts = passed;
        kit.sfx.slash();
        kit.sfx.crack();
        const at = kit.centerOf(v).setY(0.25 + cuts * 0.12);
        void kit.fx.slashArc(at, a.root.rotation.y + cuts * 0.7, glow, false, 0.42);
        kit.hitSparks(at, v, 35);
        kit.stage.addShake(0.2);
        v.twist += 1.3;
        v.root.scale.multiplyScalar(0.93);
      }
      v.pitch = -Math.sin(t * Math.PI * turns) * 0.12;
    }, ease.inOutQuad);
    endTrail();
    a.twist = 0;
    a.roll = 0;
    a.hop = 0;
    // The last cut sends what is left spinning away in pieces.
    kit.impact(0.7);
    const start = v.root.position.clone();
    kit.slowMo(0.3, 0.3);
    await kit.anim.tween(0.38, (t) => {
      v.root.position.copy(start).addScaledVector(fwd, t * 0.9).setY(Math.sin(t * Math.PI * 0.8) * 0.9);
      v.twist += 0.5;
      v.roll = t * 2.4;
    }, ease.outQuad);
    kit.explode(v, kit.centerOf(v), 3);
    // Too many turns.
    void kit.fx.dizzyStars((o) => o.copy(a.root.position).setY(kit.topOf(a) + 0.12), 0xffe27a, 1.1);
    await Promise.all([
      kit.moves.restPose(a, 0.5),
      kit.anim.tween(1.1, (t) => {
        const fade = 1 - t;
        a.roll = Math.sin(t * 13) * 0.22 * fade;
        a.pitch = Math.cos(t * 9) * 0.12 * fade;
        a.mouth = Math.sin(t * Math.PI) * 0.35;
      }, ease.linear),
    ]);
    a.roll = 0;
    a.pitch = 0;
  },
};

/** A low sweep fells the victim like a tree and the gnasher slurps it down lengthwise. */
const slurp: Finisher = {
  reach: 0.7,
  async play(kit, a, v) {
    kit.stopTremble(v);
    const fwd = kit.toward(a, v);
    const base = a.root.position.clone();
    // Low sweep at the base.
    await Promise.all([
      kit.moves.pose(a, { draw: 1 }, 0.2, ease.outBack),
      kit.anim.tween(0.2, (t) => (a.squash = 1 - t * 0.22), ease.outQuad),
    ]);
    kit.sfx.slash();
    const endTrail = kit.trail(a);
    await Promise.all([
      kit.moves.pose(a, { draw: 0, strike: 1 }, 0.1, ease.outCubic),
      kit.anim.tween(0.1, (t) => {
        a.root.position.copy(base).addScaledVector(fwd, 0.12 * t);
        a.twist = -0.5 + t;
      }),
    ]);
    endTrail();
    void kit.fx.slashArc(v.root.position.clone().setY(0.12), a.root.rotation.y, kit.glowOf(a), false, 0.4);
    kit.sfx.crack();
    kit.hitSparks(v.root.position.clone().setY(0.1), v, 45);
    kit.impact(0.4);
    // Timber! The victim, facing its attacker, topples forward at its feet.
    const tall = Math.max(0.6, kit.topOf(v));
    void kit.anim.tween(0.3, (t) => {
      a.root.position.copy(base).addScaledVector(fwd, 0.12 * (1 - t));
      a.twist = 0.5 * (1 - t);
      a.squash = 0.78 + 0.22 * t;
    });
    await kit.anim.tween(0.2, (t) => (v.pitch = -0.12 * Math.sin(t * Math.PI)), ease.inOutQuad);
    kit.sfx.whoosh();
    await kit.anim.tween(0.5, (t) => (v.pitch = t * (Math.PI / 2)), ease.outBounce);
    const head = v.root.position.clone().addScaledVector(fwd, -tall * 0.9);
    kit.sfx.impact();
    kit.stage.addShake(0.45);
    kit.dust(head, 40, 0.4);
    await Promise.all([kit.moves.restPose(a, 0.25), kit.anim.tween(0.3, (t) => (a.mouth = t), ease.outBack)]);
    // Slurp: bite by bite the fallen victim is reeled in, shrinking along its length.
    const far = v.root.position.clone();
    const bites = 4;
    for (let i = 0; i < bites; i++) {
      const from = v.root.position.clone();
      const scale0 = v.root.scale.z;
      const left = 1 - (i + 1) / bites;
      const mouth = a.mouthWorld();
      // The far end (the base) travels toward the mouth as the near end is eaten.
      const to = far.clone().lerp(new THREE.Vector3(mouth.x, 0, mouth.z).addScaledVector(fwd, 0.12), 1 - left);
      await kit.anim.tween(0.13, (t) => (a.mouth = 1 - t * 0.85), ease.inQuad);
      kit.sfx.chomp();
      kit.stage.addShake(0.22);
      kit.particles.sparksAt(a.mouthWorld(), { count: 40, color: kit.glowOf(v), speed: 3, life: 0.7, gravity: 6 });
      kit.particles.shatter(a.mouthWorld().setY(0.25), v.mats.body.color, 5, 1.3, 0.15);
      await kit.anim.tween(0.2, (t) => {
        a.mouth = 0.15 + t * 0.85;
        v.root.position.lerpVectors(from, to, t);
        v.root.position.y = 0.12 * (1 - left) * t + from.y * (1 - t);
        // It lies along its own forward axis, so that is the one that shortens.
        v.root.scale.z = scale0 + (Math.max(0.05, left) - scale0) * t;
      }, ease.outQuad);
    }
    await kit.swallow(a, v);
  },
};

export const PAWN_FINISHERS: Record<string, Finisher> = { gulp, pounce, whirlwind, slurp };
