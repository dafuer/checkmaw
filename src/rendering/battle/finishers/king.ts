import * as THREE from 'three';
import { ease } from '../../animation/animator';
import type { Finisher } from '../duelKit';

/** Draws his sword, cuts straight through the victim, sheathes it — and the victim falls in two. */
const iaido: Finisher = {
  reach: 0.8,
  async play(kit, a, v) {
    const glow = kit.glowOf(a);
    await kit.moves.drawSword(a);
    kit.sfx.growl(0.5, 90);
    await kit.anim.wait(0.35);
    kit.stopTremble(v);
    // The dash: through and past the victim in one stroke.
    const V = v.root.position.clone();
    const start = a.root.position.clone();
    const fwd = kit.toward(a, v);
    const beyond = V.clone().addScaledVector(fwd, 0.75);
    kit.sfx.whoosh();
    kit.sfx.slash();
    const cutHeight = kit.centerOf(v).y;
    void kit.fx.slashArc(V.clone().setY(cutHeight), a.root.rotation.y, glow, false, 0.45);
    const endTrail = kit.trail(a);
    let ghosts = 0;
    await Promise.all([
      kit.moves.pose(a, { guard: 0, thrust: 1 }, 0.12, ease.outCubic),
      kit.anim.tween(0.28, (t) => {
        a.root.position.lerpVectors(start, beyond, t);
        a.gait = 1;
        a.gaitPhase += 0.6;
        if (t * 4 > ghosts && ghosts < 4) {
          ghosts++;
          void kit.fx.afterimage(a.root, glow, 0.4);
        }
      }, ease.outCubic),
    ]);
    endTrail();
    a.gait = 0;
    kit.impact(0.5);
    kit.particles.sparksAt(V.clone().setY(cutHeight), { count: 50, color: glow, speed: 2.5, life: 0.5, spread: new THREE.Vector3(0.3, 0, 0.3) });
    // Stillness... then the sword slides home.
    await kit.anim.wait(0.5);
    await kit.moves.sheatheSword(a);
    // The cut lets go: the top half slides off.
    v.root.updateMatrixWorld(true);
    const localCut = v.root.worldToLocal(new THREE.Vector3(V.x, cutHeight, V.z)).y;
    const cut = kit.cut(v, new THREE.Vector3(0, 1, 0), localCut);
    const hot = kit.hot(a);
    const [upper] = cut.halves;
    const u0 = upper.position.clone();
    const uq = upper.quaternion.clone();
    // Tip forward, around the horizontal axis across the cut direction.
    const tipAxis = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const tip = new THREE.Quaternion();
    kit.sfx.crack();
    kit.particles.sparksAt(V.clone().setY(cutHeight), { count: 60, color: kit.glowOf(v), speed: 1.5, life: 0.7, spread: new THREE.Vector3(0.4, 0, 0.4) });
    await kit.anim.tween(0.8, (t) => {
      cut.burn(hot, 1.2 * (1 - t) + 0.2);
      upper.position.copy(u0).addScaledVector(fwd, t * 0.35);
      upper.position.y = u0.y - t * t * 0.25;
      upper.quaternion.copy(uq).premultiply(tip.setFromAxisAngle(tipAxis, t * 0.5));
    }, ease.inQuad);
    kit.stage.addShake(0.4);
    kit.sfx.impact();
    for (const h of cut.halves) kit.particles.shatter(h.position.clone().setY(0.2), v.mats.body.color, 18, 1.5, 0.3);
    await kit.anim.wait(0.1);
    cut.dispose();
    await kit.moves.turn(a, a.faceTowards(V.x, V.z), 0.4);
  },
};

/** He lets the victim strike first, steps aside, runs it through — and it crumbles as the sword goes home. */
const riposte: Finisher = {
  reach: 1.05,
  async play(kit, a, v) {
    const glow = kit.glowOf(a);
    await kit.moves.drawSword(a);
    await kit.anim.wait(0.25);
    kit.stopTremble(v);
    const base = a.root.position.clone();
    const V = v.root.position.clone();
    const fwd = kit.toward(a, v);
    const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
    // A desperate lunge...
    kit.sfx.growl(0.35, 190);
    const lunge = kit.anim.tween(0.26, (t) => {
      v.root.position.copy(V).addScaledVector(fwd, -0.6 * t);
      v.pitch = 0.4 * t;
    }, ease.inQuad);
    // ...met with one step to the side and a turn of the wrist.
    await kit.anim.wait(0.12);
    void kit.fx.afterimage(a.root, glow, 0.35);
    await Promise.all([
      lunge,
      kit.moves.pose(a, { guard: 0.4, raise: 0.5 }, 0.14, ease.outQuad),
      kit.anim.tween(0.14, (t) => {
        a.root.position.copy(base).addScaledVector(side, 0.36 * t);
        a.twist = -0.6 * t;
        a.gait = 1 - t;
        a.gaitPhase += 0.4;
      }, ease.outCubic),
    ]);
    a.gait = 0;
    kit.sfx.clang();
    kit.impact(0.4);
    kit.particles.sparksAt(base.clone().addScaledVector(fwd, 0.3).setY(0.9), { count: 60, color: 0xffd27a, speed: 3.5, life: 0.4, gravity: 4 });
    // The victim stumbles past, off balance.
    const stumbleFrom = v.root.position.clone();
    const stumble = kit.anim.tween(0.35, (t) => {
      v.root.position.copy(stumbleFrom).addScaledVector(fwd, -0.45 * t);
      v.pitch = 0.4 + 0.3 * Math.sin(t * Math.PI * 0.5);
      v.roll = Math.sin(t * 14) * 0.1;
    }, ease.outQuad);
    await kit.anim.wait(0.16);
    // Riposte.
    const at = v.root.position.clone().addScaledVector(fwd, -0.2);
    const endTrail = kit.trail(a);
    await Promise.all([
      kit.moves.turn(a, a.faceTowards(at.x, at.z), 0.1),
      kit.moves.pose(a, { guard: 0, raise: 0, draw: 1 }, 0.1, ease.outQuad),
      kit.anim.tween(0.1, (t) => (a.twist = -0.6 * (1 - t))),
    ]);
    kit.sfx.slash();
    const lungeFrom = a.root.position.clone();
    const reach = Math.max(0, lungeFrom.distanceTo(at) - 0.75);
    await Promise.all([
      stumble,
      kit.moves.pose(a, { draw: 0, thrust: 1 }, 0.08, ease.outCubic),
      kit.anim.tween(0.08, (t) => a.root.position.copy(lungeFrom).addScaledVector(kit.forward(a), reach * t)),
    ]);
    endTrail();
    kit.sfx.crack();
    kit.impact(1);
    const wound = kit.centerOf(v);
    kit.hitSparks(wound, v, 80);
    void kit.stage.pulseBloom(1.7, 0.4);
    v.roll = 0;
    // Run through: both hold still.
    kit.slowMo(0.3, 0.4);
    await kit.anim.tween(0.5, (t) => v.setGlow(1.5 * Math.abs(Math.sin(t * 20))), ease.linear);
    // The sword comes out with a flick...
    kit.sfx.slash();
    await kit.moves.pose(a, { thrust: 0, strike: 0.7 }, 0.12, ease.outQuad);
    void kit.fx.slashArc(a.weaponTip(), a.root.rotation.y, glow, true, 0.25);
    kit.particles.sparksAt(a.weaponTip(), { count: 25, color: kit.glowOf(v), speed: 2.5, life: 0.4, gravity: 5 });
    await kit.anim.wait(0.2);
    // ...and as it clicks home the victim crumbles to dust.
    await kit.moves.sheatheSword(a);
    const top = kit.topOf(v);
    const spot = v.root.position.clone().setY(0);
    let level = top + 0.05;
    const restore = kit.fx.dissolve(v.root, () => level);
    kit.sfx.crack();
    await kit.anim.tween(0.7, (t) => {
      level = (top + 0.05) * (1 - t);
      kit.particles.sparksAt(wound.clone().setY(level), { count: 4, color: kit.glowOf(v), speed: 0.8, life: 0.6, gravity: 3, spread: new THREE.Vector3(0.35, 0, 0.35) });
      if (Math.random() < 0.7) kit.particles.shatter(new THREE.Vector3(wound.x, level, wound.z), v.mats.body.color, 1, 0.7, 0.05);
    }, ease.inQuad);
    v.root.visible = false;
    restore();
    kit.dust(spot, 40, 0.5, 1.4);
    await kit.anim.wait(0.15);
  },
};

/** A rising cut throws the victim skyward; the lord leaps after it and strikes it back down into the board. */
const skyfall: Finisher = {
  reach: 0.85,
  async play(kit, a, v) {
    const glow = kit.glowOf(a);
    await kit.moves.drawSword(a);
    kit.sfx.growl(0.5, 90);
    kit.stopTremble(v);
    const V = v.root.position.clone().setY(0);
    const fwd = kit.toward(a, v);
    // Launcher.
    await Promise.all([
      kit.moves.pose(a, { guard: 0, strike: 1 }, 0.2, ease.outQuad),
      kit.anim.tween(0.2, (t) => (a.squash = 1 - t * 0.16), ease.outQuad),
    ]);
    kit.sfx.slash();
    const endTrail = kit.trail(a);
    await Promise.all([
      kit.moves.pose(a, { strike: 0, raise: 1 }, 0.1, ease.outCubic),
      kit.anim.tween(0.1, (t) => (a.squash = 0.84 + t * 0.2), ease.outCubic),
    ]);
    void kit.fx.slashArc(V.clone().setY(0.7), a.root.rotation.y, glow, true, 0.6);
    kit.sfx.crack();
    kit.impact(0.6);
    kit.hitSparks(kit.centerOf(v), v, 60);
    const apex = 2.3;
    const rise = kit.anim.tween(0.6, (t) => {
      v.root.position.copy(V).setY(apex * t);
      v.roll = t * 5;
    }, ease.outCubic);
    // He goes up after it, cape streaming.
    await kit.anim.wait(0.14);
    kit.sfx.whoosh();
    void kit.fx.afterimage(a.root, glow, 0.4);
    const jump = 1.7;
    await Promise.all([
      rise,
      kit.anim.tween(0.46, (t) => {
        a.hop = jump * t;
        a.squash = 1.04 - t * 0.04;
        a.gait = 1;
        a.gaitPhase += 0.25;
        a.pitch = -0.25 * t;
      }, ease.outCubic),
    ]);
    kit.slowMo(0.22, 0.5);
    await kit.anim.wait(0.1);
    // The strike back down.
    kit.sfx.slash();
    await Promise.all([
      kit.moves.pose(a, { raise: 0, strike: 1 }, 0.09, ease.inCubic),
      kit.anim.tween(0.09, (t) => (a.pitch = -0.25 + 0.75 * t), ease.inCubic),
    ]);
    endTrail();
    const struck = v.root.position.clone();
    void kit.fx.slashArc(struck.clone().setY(struck.y + 0.4), a.root.rotation.y, glow, true, 0.55);
    kit.sfx.crack();
    kit.impact(0.8);
    kit.hitSparks(struck.clone().setY(struck.y + 0.4), v, 70);
    const crater = V.clone().addScaledVector(fwd, 0.4);
    void kit.fx.beam(struck.clone().setY(struck.y + 0.4), crater, glow, 0.07, 0.35);
    await kit.anim.tween(0.13, (t) => {
      v.root.position.lerpVectors(struck, crater, t);
      v.roll += 0.5;
    }, ease.inQuad);
    kit.explode(v, crater.clone().setY(0.25), 3.6);
    kit.groundSlam(crater, 1.5, glow);
    void kit.fx.pillar(crater, glow, 3, 0.4, 0.5);
    // He comes down after it.
    await kit.anim.tween(0.34, (t) => {
      a.hop = jump * (1 - t);
      a.pitch = 0.5 * (1 - t);
      a.gaitPhase += 0.25;
    }, ease.inQuad);
    a.hop = 0;
    a.pitch = 0;
    a.gait = 0;
    kit.sfx.impact();
    kit.stage.addShake(0.4);
    kit.dust(a.root.position, 45, 0.5);
    void kit.fx.shockwave(a.root.position, 0xb59a7a, 1.2, 0.4);
    await Promise.all([kit.land(a, 0.22, 0.45), kit.moves.pose(a, { strike: 0, guard: 1 }, 0.3)]);
    // A turn of the cape, and the sword goes home.
    await kit.anim.tween(0.45, (t) => {
      a.twist = t * Math.PI * 2;
      a.gait = Math.sin(t * Math.PI) * 0.8;
      a.gaitPhase += 0.3;
    }, ease.inOutCubic);
    a.twist = 0;
    a.gait = 0;
    await kit.moves.sheatheSword(a);
  },
};

export const KING_FINISHERS: Record<string, Finisher> = { iaido, riposte, skyfall };
