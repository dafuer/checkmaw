import * as THREE from 'three';
import { ease } from '../../animation/animator';
import type { Finisher } from '../duelKit';

/** Grabs the victim, lifts it overhead, slams it flat and eats the pancake. */
const slam: Finisher = {
  reach: 0.62,
  async play(kit, a, v) {
    kit.stopTremble(v);
    kit.sfx.growl(0.6, 70);
    await kit.moves.pose(a, { grab: 1 }, 0.3, ease.outBack);
    // Hold the victim between both fists.
    const hand = new THREE.Vector3();
    const hold = kit.anim.every(() => {
      a.weaponTip(hand);
      const yaw = a.root.rotation.y;
      const offset = (a.gear?.spec.shoulderX ?? 0.25) * a.body.scale.x;
      hand.x += Math.cos(yaw) * offset;
      hand.z -= Math.sin(yaw) * offset;
      v.root.position.set(hand.x, hand.y - v.height * 0.45, hand.z);
      return false;
    });
    kit.sfx.clang();
    // Lift overhead.
    kit.sfx.roar();
    await kit.moves.pose(a, { grab: 0, lift: 1 }, 0.55, ease.inOutCubic);
    await kit.anim.tween(0.3, (t) => (v.roll = Math.sin(t * Math.PI * 3) * 0.4));
    // Slam.
    kit.sfx.whoosh();
    await kit.moves.pose(a, { lift: 0, strike: 1 }, 0.16, ease.inCubic);
    hold();
    const ground = a.root.position.clone().addScaledVector(kit.forward(a), 0.62).setY(0);
    v.root.position.copy(ground);
    v.roll = 0;
    kit.sfx.splat();
    kit.groundSlam(ground, 1.2);
    kit.particles.sparksAt(ground.clone().setY(0.1), { count: 50, color: kit.glowOf(v), speed: 2.4, life: 0.7, gravity: 3 });
    await kit.anim.tween(0.18, (t) => v.root.scale.set(1 + t * 0.7, Math.max(0.08, 1 - t * 0.92), 1 + t * 0.7), ease.outQuad);
    await kit.anim.wait(0.35);
    // Peel it off the floor and eat it like a pizza.
    await kit.moves.restPose(a, 0.25);
    await kit.anim.tween(0.3, (t) => (a.mouth = t), ease.outBack);
    const start = v.root.position.clone();
    await kit.anim.tween(0.5, (t) => {
      const m = a.mouthWorld();
      v.root.position.lerpVectors(start, m.setY(m.y - 0.1), t);
      v.pitch = t * 1.3;
    }, ease.inOutCubic);
    await kit.chompLoop(a, v, 3);
    await kit.swallow(a, v);
  },
};

/** A two-fisted ground pound pops the victim into the air, and one punch sends it out of the arena. */
const homeRun: Finisher = {
  reach: 0.95,
  async play(kit, a, v) {
    kit.stopTremble(v);
    const gear = a.gear;
    const fwd = kit.toward(a, v);
    const base = a.root.position.clone();
    kit.sfx.growl(0.6, 70);
    await Promise.all([
      kit.moves.pose(a, { lift: 1 }, 0.3, ease.outBack),
      kit.anim.tween(0.3, (t) => (a.squash = 1 - t * 0.2), ease.outQuad),
    ]);
    // Jump and come down fists first.
    kit.sfx.whoosh();
    a.airborne = true;
    await kit.anim.tween(0.42, (t) => {
      a.hop = Math.sin(t * Math.PI) * 0.55;
      a.squash = 0.8 + Math.min(1, t * 3) * 0.3;
      const k = Math.max(0, (t - 0.55) / 0.45);
      if (gear) {
        gear.pose.lift = 1 - k;
        gear.pose.strike = k;
      }
      a.pitch = k * 0.3;
    }, ease.linear);
    a.airborne = false;
    a.hop = 0;
    const pound = base.clone().addScaledVector(fwd, 0.45);
    kit.groundSlam(pound, 1.3);
    void kit.land(a, 0.25, 0.4);
    // The shock tosses the victim up, turning slowly in the air.
    const V = v.root.position.clone();
    kit.slowMo(0.45, 0.5);
    await Promise.all([
      kit.anim.tween(0.62, (t) => {
        v.root.position.copy(V).setY(1.25 * Math.sin(t * 0.8 * Math.PI));
        v.roll = t * 2.2;
        v.twist = t * 3;
      }, ease.linear),
      // Meanwhile the brute coils for the punch.
      kit.anim.tween(0.5, (t) => {
        a.pitch = 0.3 * (1 - t);
        a.twist = -0.7 * t;
        if (gear) {
          gear.pose.strike = 1 - t;
          gear.pose.draw = t;
        }
      }, ease.inOutQuad),
    ]);
    // Punch.
    kit.sfx.whoosh();
    await kit.anim.tween(0.07, (t) => {
      a.twist = -0.7 + 1.2 * t;
      a.root.position.copy(base).addScaledVector(fwd, 0.18 * t);
      if (gear) {
        gear.pose.draw = 1 - t;
        gear.pose.thrust = t;
      }
    }, ease.inQuad);
    const hit = kit.centerOf(v);
    kit.sfx.clang();
    kit.sfx.crack();
    kit.sfx.impact();
    kit.hitSparks(hit, v, 110);
    kit.particles.sparksAt(hit, { count: 30, color: 0xffffff, speed: 5, life: 0.4, drag: 3 });
    void kit.stage.pulseBloom(1.5, 0.4);
    kit.anim.warpTime(0.03, 0.2);
    void kit.stage.punch(6, 0.6);
    kit.stage.addShake(0.9);
    // Going, going, gone.
    const from = v.root.position.clone();
    const out = fwd.clone().multiplyScalar(8).setY(5.5);
    await kit.anim.tween(0.75, (t) => {
      v.root.position.copy(from).addScaledVector(out, t);
      v.root.scale.setScalar(Math.max(0.05, 1 - t * 0.85));
      v.roll += 0.6;
      v.twist += 0.4;
      kit.particles.sparksAt(v.root.position.clone().setY(v.root.position.y + 0.3), { count: 3, color: kit.glowOf(v), speed: 0.5, life: 0.5 });
    }, ease.outQuad);
    const far = v.root.position.clone();
    v.root.visible = false;
    kit.sfx.shimmer();
    kit.particles.sparksAt(far, { count: 50, color: 0xffffff, speed: 1.8, life: 0.7, drag: 2 });
    kit.particles.sparksAt(far, { count: 30, color: kit.glowOf(v), speed: 3, life: 0.5, drag: 3 });
    // The brute shades its eyes to watch it go.
    await Promise.all([
      kit.moves.pose(a, { thrust: 0, raise: 0.42 }, 0.35, ease.outBack),
      kit.anim.tween(0.35, (t) => {
        a.twist = 0.5 * (1 - t);
        a.root.position.copy(base).addScaledVector(fwd, 0.18 * (1 - t));
        a.pitch = -0.18 * t;
        a.mouth = t * 0.5;
      }, ease.outQuad),
    ]);
    await kit.anim.wait(0.55);
    await Promise.all([
      kit.moves.restPose(a, 0.3),
      kit.anim.tween(0.3, (t) => {
        a.pitch = -0.18 * (1 - t);
        a.mouth = 0.5 * (1 - t);
      }),
    ]);
  },
};

/** Hammers the victim into the board like a nail, three blows, then dusts off its hands. */
const nail: Finisher = {
  reach: 0.66,
  async play(kit, a, v) {
    kit.stopTremble(v);
    const V = v.root.position.clone().setY(0);
    const tall = Math.max(0.5, kit.topOf(v));
    kit.sfx.growl(0.6, 70);
    // Whatever goes below the board is gone.
    const restore = kit.fx.dissolve(v.root, () => 0.004, 'above');
    const blows = 3;
    for (let i = 0; i < blows; i++) {
      await Promise.all([
        kit.moves.pose(a, { strike: 0, lift: 1 }, 0.26, ease.outBack),
        kit.anim.tween(0.26, (t) => {
          a.squash = 1 + t * 0.07;
          a.pitch = -0.12 * t;
          a.mouth = t * 0.5;
          // The victim sees it coming.
          v.squash = 1 - t * 0.06;
        }, ease.outQuad),
      ]);
      kit.sfx.whoosh();
      await Promise.all([
        kit.moves.pose(a, { lift: 0, strike: 1 }, 0.09, ease.inCubic),
        kit.anim.tween(0.09, (t) => {
          a.squash = 1.07 - t * 0.17;
          a.pitch = -0.12 + t * 0.4;
        }, ease.inCubic),
      ]);
      const from = v.root.position.y;
      const to = -tall * ((i + 1) / blows) * 0.94;
      kit.sfx.stomp();
      kit.sfx.clang();
      kit.groundSlam(V, 0.6 + i * 0.35);
      kit.particles.shatter(V.clone().setY(0.05), 0x6b6258, 6 + i * 4, 1.6, 0.05);
      await kit.anim.tween(0.1, (t) => {
        v.root.position.y = from + (to - from) * t;
        v.squash = 0.8 + 0.2 * t;
        a.mouth = 0.5 * (1 - t);
      }, ease.outQuad);
      await kit.anim.tween(0.14, (t) => {
        a.squash = 0.9 + 0.1 * t;
        a.pitch = 0.28 * (1 - t);
      }, ease.outQuad);
    }
    // A last pat with the flat of the fist to finish the job.
    await kit.moves.pose(a, { strike: 0.45 }, 0.2);
    await kit.moves.pose(a, { strike: 1 }, 0.1, ease.inQuad);
    kit.sfx.step();
    kit.dust(V, 30, 0.3, 1.2);
    const from = v.root.position.y;
    await kit.anim.tween(0.12, (t) => (v.root.position.y = from - tall * 0.12 * t));
    v.root.visible = false;
    restore();
    // Dusts off its hands.
    await kit.moves.pose(a, { strike: 0, grab: 0.8 }, 0.25);
    for (let i = 0; i < 2; i++) {
      await kit.moves.pose(a, { grab: 1, draw: 0.25 }, 0.08, ease.inQuad);
      kit.sfx.clang();
      kit.particles.sparksAt(a.weaponTip(), { count: 14, color: 0xb59a7a, speed: 1, life: 0.5, gravity: 2 });
      await kit.moves.pose(a, { grab: 0.8, draw: 0 }, 0.12, ease.outQuad);
    }
    await kit.moves.restPose(a, 0.3);
  },
};

export const ROOK_FINISHERS: Record<string, Finisher> = { slam, homeRun, nail };
