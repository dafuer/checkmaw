import * as THREE from 'three';
import { ease } from '../../animation/animator';
import type { PieceView } from '../../pieces/pieceView';
import type { DuelKit, Finisher } from '../duelKit';

/** Charges in a straight line with hoof beats, ending `stopShort` before the target. */
async function charge(kit: DuelKit, a: PieceView, to: THREE.Vector3, speed: number, easing = ease.inQuad): Promise<void> {
  const mount = a.mount!;
  const from = a.root.position.clone();
  let lastBeat = mount.gallopPhase;
  kit.sfx.whoosh();
  await kit.anim.tween(from.distanceTo(to) / speed, (t) => {
    a.root.position.lerpVectors(from, to, t);
    mount.gallop = 1;
    mount.gallopPhase += 0.45;
    if (mount.gallopPhase - lastBeat > Math.PI / 2) {
      lastBeat = mount.gallopPhase;
      kit.sfx.clop();
      kit.dust(a.root.position, 6, 0.2, 1);
    }
  }, easing);
}

/** Backs off to `distance` from the victim (never further than needed) and turns to face it. */
async function takeRunUp(kit: DuelKit, a: PieceView, V: THREE.Vector3, fwd: THREE.Vector3, distance: number): Promise<void> {
  const runUp = V.clone().addScaledVector(fwd, -distance);
  if (a.root.position.distanceTo(runUp) > 0.15) await kit.moves.gallop(a, runUp, 2.6);
  await kit.moves.turn(a, a.faceTowards(V.x, V.z), 0.4);
}

/** Backs off, lowers the lance, charges, impales and flings the victim. */
const joust: Finisher = {
  reach: 0,
  async play(kit, a, v) {
    const mount = a.mount;
    if (!mount) return;
    const V = v.root.position.clone();
    const fwd = kit.toward(a, v);
    await takeRunUp(kit, a, V, fwd, 2.1);
    kit.sfx.neigh();
    await Promise.all([
      kit.anim.tween(0.5, (t) => (a.rear = Math.sin(t * Math.PI) * 0.7), ease.inOutQuad),
      kit.anim.tween(0.5, (t) => (mount.couch = t), ease.inOutCubic),
    ]);
    kit.stopTremble(v);
    // Charge until the lance tip reaches the victim.
    const endTrail = kit.trail(a);
    await charge(kit, a, V.clone().addScaledVector(fwd, -1.05), 4.2);
    // Impale: the victim rides the lance tip.
    kit.sfx.crack();
    kit.sfx.impact();
    kit.impact(1);
    kit.hitSparks(a.weaponTip(), v, 70);
    const tip = new THREE.Vector3();
    const carry = kit.anim.every(() => {
      a.weaponTip(tip);
      v.root.position.set(tip.x, tip.y - v.height * 0.45, tip.z);
      return false;
    });
    v.pitch = 0.5;
    const from = a.root.position.clone();
    const runOut = from.clone().addScaledVector(fwd, 0.9);
    await kit.anim.tween(0.45, (t) => {
      a.root.position.lerpVectors(from, runOut, t);
      mount.gallop = 1 - t;
      mount.gallopPhase += 0.35;
    }, ease.outQuad);
    endTrail();
    // Rear and fling the victim skyward, where it bursts.
    kit.sfx.neigh();
    await kit.anim.tween(0.5, (t) => {
      a.rear = t;
      mount.couch = 1 - t * 1.2;
    }, ease.outBack);
    carry();
    const flung = v.root.position.clone();
    kit.sfx.whoosh();
    kit.slowMo(0.35, 0.3);
    await kit.anim.tween(0.45, (t) => {
      v.root.position.copy(flung).add(new THREE.Vector3(fwd.x * t * 0.8, t * 0.9, fwd.z * t * 0.8));
      v.pitch += 0.35;
    }, ease.outQuad);
    kit.explode(v, v.root.position.clone().setY(v.root.position.y + v.height * 0.5), 3.2);
    await kit.anim.tween(0.5, (t) => {
      a.rear = 1 - t;
      mount.couch = Math.max(0, -0.2 * (1 - t));
      a.mouth = Math.sin(t * Math.PI) * 0.6;
    }, ease.outBounce);
    mount.couch = 0;
  },
};

/** Rides right up, rears, and brings the front hooves down again and again until nothing is left. */
const trample: Finisher = {
  reach: 0,
  async play(kit, a, v) {
    const mount = a.mount;
    if (!mount) return;
    const V = v.root.position.clone().setY(0);
    const fwd = kit.toward(a, v);
    const stand = V.clone().addScaledVector(fwd, -0.72);
    if (a.root.position.distanceTo(stand) > 0.1) await kit.moves.gallop(a, stand, 3);
    await kit.moves.turn(a, a.faceTowards(V.x, V.z), 0.2);
    kit.stopTremble(v);
    const stomps = [
      { rear: 0.85, up: 0.4, flat: 0.5, power: 0.6 },
      { rear: 0.7, up: 0.26, flat: 0.22, power: 0.8 },
      { rear: 1, up: 0.5, flat: 0.08, power: 1.3 },
    ];
    for (let i = 0; i < stomps.length; i++) {
      const s = stomps[i];
      const last = i === stomps.length - 1;
      if (i === 0 || last) kit.sfx.neigh();
      const flat0 = v.squash;
      await kit.anim.tween(s.up, (t) => {
        a.rear = t * s.rear;
        a.mouth = t * 0.7;
        // The victim shrinks away from the hooves above it.
        if (i === 0) v.squash = 1 - t * 0.12;
      }, ease.outBack);
      if (last) {
        kit.slowMo(0.25, 0.35);
        await kit.anim.wait(0.12);
      }
      const from = a.root.position.clone();
      await kit.anim.tween(0.13, (t) => {
        a.rear = s.rear * (1 - t);
        a.root.position.copy(from).addScaledVector(fwd, 0.07 * t);
        v.squash = (i === 0 ? 0.88 : flat0) + (s.flat - (i === 0 ? 0.88 : flat0)) * t * t;
      }, ease.inCubic);
      a.rear = 0;
      a.mouth = 0;
      kit.sfx.splat();
      kit.sfx.clop();
      kit.groundSlam(V, s.power, last ? kit.glowOf(v) : undefined);
      kit.particles.shatter(V.clone().setY(0.1), v.mats.body.color, 8 + i * 6, 1.6 + i * 0.5, 0.15);
      kit.particles.sparksAt(V.clone().setY(0.15), { count: 40 + i * 30, color: kit.glowOf(v), speed: 3 + i, life: 0.7, gravity: 4 });
      if (!last) await kit.anim.wait(0.12);
    }
    v.root.visible = false;
    void kit.stage.pulseBloom(1.7, 0.5);
    // Victory rear over the crater.
    await kit.anim.wait(0.15);
    kit.sfx.neigh();
    await kit.anim.tween(0.7, (t) => {
      a.rear = Math.sin(t * Math.PI) * 0.9;
      a.mouth = Math.sin(t * Math.PI) * 0.8;
    }, ease.inOutQuad);
    a.rear = 0;
  },
};

/** A full-tilt charge that ends in a soaring leap, landing lance-first on top of the victim. */
const skyLance: Finisher = {
  reach: 0,
  async play(kit, a, v) {
    const mount = a.mount;
    if (!mount) return;
    const V = v.root.position.clone().setY(0);
    const fwd = kit.toward(a, v);
    await takeRunUp(kit, a, V, fwd, 2.5);
    kit.sfx.neigh();
    await Promise.all([
      kit.anim.tween(0.45, (t) => (a.rear = Math.sin(t * Math.PI) * 0.6), ease.inOutQuad),
      kit.anim.tween(0.45, (t) => (mount.couch = t * 0.5), ease.inOutCubic),
    ]);
    kit.stopTremble(v);
    await charge(kit, a, V.clone().addScaledVector(fwd, -1.45), 4.6);
    // Take off.
    kit.sfx.whoosh();
    const endTrail = kit.trail(a);
    let slowed = false;
    await kit.arc(a, V, 1.55, 0.62, (t) => {
      mount.gallop = 0.35;
      mount.gallopPhase += 0.05;
      mount.couch = 0.5 + t * 0.5;
      a.pitch = -0.45 + t * 1.05;
      // The victim watches it come down.
      v.pitch = -Math.min(1, t * 2) * 0.3;
      v.squash = 1 - t * 0.15;
      if (!slowed && t > 0.42) {
        slowed = true;
        kit.slowMo(0.22, 0.45);
      }
    });
    endTrail();
    kit.sfx.crack();
    kit.explode(v, V.clone().setY(v.height * 0.4), 3.6);
    kit.groundSlam(V, 1.4, kit.glowOf(a));
    void kit.fx.pillar(V, kit.glowOf(a), 3.5, 0.5, 0.5);
    mount.gallop = 0;
    await Promise.all([
      kit.land(a, 0.28, 0.5),
      kit.anim.tween(0.3, (t) => {
        a.pitch = 0.6 * (1 - t);
        mount.couch = 1 - t;
      }, ease.outQuad),
    ]);
    a.pitch = 0;
    kit.sfx.neigh();
    await kit.anim.tween(0.6, (t) => {
      a.rear = Math.sin(t * Math.PI) * 0.8;
      a.mouth = Math.sin(t * Math.PI) * 0.7;
    }, ease.inOutQuad);
    a.rear = 0;
    mount.couch = 0;
  },
};

export const KNIGHT_FINISHERS: Record<string, Finisher> = { joust, trample, skyLance };
