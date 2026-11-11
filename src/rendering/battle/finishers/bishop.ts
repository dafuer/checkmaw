import * as THREE from 'three';
import { ease } from '../../animation/animator';
import type { Finisher } from '../duelKit';

const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** Charges the great sword with light and cleaves the victim in two from crown to base. */
const cleave: Finisher = {
  reach: 0.95,
  async play(kit, a, v) {
    const glow = kit.glowOf(a);
    kit.sfx.magic();
    await kit.moves.pose(a, { raise: 1, guard: 0.6 }, 0.55, ease.outBack);
    const charge = kit.anim.every(() => {
      kit.particles.sparksAt(a.weaponTip(), { count: 3, color: glow, speed: 0.6, life: 0.4, gravity: -1 });
      return false;
    });
    kit.sfx.growl(0.6, 100);
    await kit.anim.wait(0.5);
    charge();
    kit.stopTremble(v);
    // Hop in and bring the blade down.
    kit.sfx.slash();
    const endTrail = kit.trail(a);
    await Promise.all([
      kit.moves.pose(a, { raise: 0, strike: 1 }, 0.14, ease.inCubic),
      kit.anim.tween(0.14, (t) => (a.hop = Math.sin(t * Math.PI) * 0.15)),
    ]);
    endTrail();
    a.hop = 0;
    kit.sfx.impact();
    kit.sfx.crack();
    kit.impact(1);
    void kit.stage.pulseBloom(2, 0.5);
    void kit.fx.slashArc(v.root.position.clone().setY(v.height * 0.55), a.root.rotation.y, glow, true, v.height * 0.6);
    // Cut along the vertical plane facing the bishop.
    v.root.rotation.y = a.root.rotation.y;
    const cut = kit.cut(v, new THREE.Vector3(1, 0, 0), 0);
    // The halves glow white-hot along the cut so they read against the dark board.
    const hot = kit.hot(a);
    cut.burn(hot, 1.4);
    const [right, left] = cut.halves;
    const r0 = right.position.clone();
    const l0 = left.position.clone();
    const rq = right.quaternion.clone();
    const lq = left.quaternion.clone();
    const roll = new THREE.Quaternion();
    const sideways = new THREE.Vector3(Math.cos(a.root.rotation.y), 0, -Math.sin(a.root.rotation.y));
    kit.particles.sparksAt(r0.clone().setY(v.height * 0.5), { count: 40, color: glow, speed: 1.2, life: 0.6, gravity: 2, spread: new THREE.Vector3(0, v.height * 0.5, 0) });
    await kit.anim.wait(0.25);
    await kit.anim.tween(0.9, (t) => {
      cut.burn(hot, 1.4 * (1 - t) + 0.25);
      const apart = t * 0.32;
      right.position.copy(r0).addScaledVector(sideways, apart);
      left.position.copy(l0).addScaledVector(sideways, -apart);
      // Each half topples outward around its own forward axis.
      right.quaternion.copy(rq).multiply(roll.setFromAxisAngle(Z_AXIS, -t * 1.2));
      left.quaternion.copy(lq).multiply(roll.setFromAxisAngle(Z_AXIS, t * 1.2));
    }, ease.inQuad);
    kit.sfx.crack();
    kit.stage.addShake(0.3);
    for (const h of cut.halves) kit.particles.shatter(h.position, v.mats.body.color, 16, 1.4, 0.2);
    kit.particles.sparksAt(r0.clone().setY(0.2), { count: 60, color: kit.glowOf(v), speed: 2, life: 0.8 });
    await kit.anim.wait(0.15);
    cut.dispose();
    await kit.moves.restPose(a, 0.4);
  },
};

/** The key is wound tight and the toy lets go: a blur of mechanical cuts, then one clean diagonal. */
const clockwork: Finisher = {
  reach: 0.9,
  async play(kit, a, v) {
    const glow = kit.glowOf(a);
    const figure = a.figure;
    // Wind up: the key whirrs, the whole toy rattles.
    if (figure) figure.winding = 26;
    const rattle = kit.anim.every(() => {
      a.roll = Math.sin(kit.anim.now * 90) * 0.03;
      return false;
    });
    void kit.moves.pose(a, { guard: 1 }, 0.3);
    for (let i = 0; i < 6; i++) {
      kit.sfx.select();
      await kit.anim.wait(0.09);
    }
    rattle();
    a.roll = 0;
    kit.stopTremble(v);
    // Release: four cuts, each snapping from one stop to the next like clockwork.
    const endTrail = kit.trail(a);
    const base = a.root.position.clone();
    const fwd = kit.toward(a, v);
    for (let i = 0; i < 4; i++) {
      const high = i % 2 === 0;
      await kit.moves.pose(a, high ? { raise: 1, strike: 0, thrust: 0, guard: 0.3 } : { raise: 0, strike: 0, thrust: 0.2, guard: 0.3 }, 0.07, ease.linear);
      kit.sfx.slash();
      await Promise.all([
        kit.moves.pose(a, high ? { raise: 0, strike: 1 } : { thrust: 1, strike: 0.3 }, 0.06, ease.linear),
        kit.anim.tween(0.06, (t) => {
          a.root.position.copy(base).addScaledVector(fwd, 0.05 * (i + t));
          a.twist = (high ? -1 : 1) * 0.25 * t;
        }, ease.linear),
      ]);
      const at = kit.centerOf(v).add(new THREE.Vector3(0, (i - 1.5) * 0.12, 0));
      void kit.fx.slashArc(at, a.root.rotation.y + (high ? 0 : 0.6), glow, high, 0.4);
      kit.sfx.crack();
      kit.hitSparks(at, v, 30);
      kit.impact(0.25);
      void kit.stagger(v, a.root.position, 0.04);
      await kit.anim.wait(0.07);
    }
    a.twist = 0;
    if (figure) figure.winding = 4;
    // The last one: a diagonal stroke through the whole victim.
    await kit.moves.pose(a, { raise: 1, strike: 0, thrust: 0, guard: 0.6 }, 0.22, ease.outBack);
    kit.sfx.slash();
    kit.sfx.whoosh();
    await kit.moves.pose(a, { raise: 0, strike: 1 }, 0.08, ease.inCubic);
    endTrail();
    kit.sfx.impact();
    kit.impact(1);
    void kit.stage.pulseBloom(2, 0.5);
    v.root.rotation.y = a.root.rotation.y;
    v.root.updateMatrixWorld(true);
    const mid = v.root.worldToLocal(kit.centerOf(v)).y;
    // The plane leans away from the bishop, so the upper part slides off forward and down.
    const normal = new THREE.Vector3(0, Math.SQRT1_2, Math.SQRT1_2);
    const cut = kit.cut(v, normal, mid * Math.SQRT1_2);
    const hot = kit.hot(a);
    cut.burn(hot, 0.9);
    const [upper] = cut.halves;
    const u0 = upper.position.clone();
    const slide = new THREE.Vector3(fwd.x * Math.SQRT1_2, -Math.SQRT1_2, fwd.z * Math.SQRT1_2);
    kit.slowMo(0.3, 0.5);
    await kit.anim.wait(0.3);
    kit.sfx.crack();
    await kit.anim.tween(0.75, (t) => {
      cut.burn(hot, 0.9 * (1 - t) + 0.2);
      upper.position.copy(u0).addScaledVector(slide, t * Math.min(0.75, mid * 1.1));
      if (Math.random() < 0.6) kit.particles.sparksAt(u0.clone().setY(mid).addScaledVector(fwd, t * 0.2), { count: 2, color: glow, speed: 1, life: 0.4, gravity: 3 });
    }, ease.inQuad);
    kit.sfx.impact();
    kit.stage.addShake(0.35);
    for (const h of cut.halves) kit.particles.shatter(h.position.clone().setY(0.15), v.mats.body.color, 18, 1.5, 0.3);
    kit.particles.sparksAt(u0.clone().setY(0.2), { count: 60, color: kit.glowOf(v), speed: 2, life: 0.8 });
    await kit.anim.wait(0.12);
    cut.dispose();
    // Winds down with a heel click.
    if (figure) figure.winding = 0;
    await kit.moves.restPose(a, 0.35);
    kit.sfx.clang();
    await kit.anim.tween(0.18, (t) => (a.hop = Math.sin(t * Math.PI) * 0.07), ease.outQuad);
    a.hop = 0;
  },
};

/** Outline of the spectral sword, point down at the origin. */
function swordShape(): THREE.Shape {
  const half: Array<[number, number]> = [
    [0, 0], [0.12, 0.4], [0.12, 2.1], [0.44, 2.1], [0.44, 2.24], [0.055, 2.24], [0.055, 2.72], [0.11, 2.78], [0, 2.9],
  ];
  const shape = new THREE.Shape();
  shape.moveTo(half[0][0], half[0][1]);
  for (const [x, y] of half.slice(1)) shape.lineTo(x, y);
  for (const [x, y] of half.slice(1, -1).reverse()) shape.lineTo(-x, y);
  shape.closePath();
  return shape;
}

/** The soldier presents arms and a colossal sword of light falls from the sky to pass sentence. */
const judgement: Finisher = {
  reach: 1.35,
  async play(kit, a, v) {
    const glow = kit.glowOf(a);
    const V = v.root.position.clone().setY(0);
    const figure = a.figure;
    kit.sfx.magic();
    if (figure) figure.winding = 10;
    void kit.fx.pillar(a.root.position, glow, 3, 0.3, 0.9);
    await kit.moves.pose(a, { raise: 1, guard: 0.6 }, 0.5, ease.outBack);
    // The blade gathers out of light, high above the victim.
    const geo = new THREE.ExtrudeGeometry(swordShape(), { depth: 0.04, bevelEnabled: false });
    geo.translate(0, 0, -0.02);
    const blade = kit.fx.glow(geo, glow, 1.5);
    const cam = kit.stage.camera.position;
    const hover = kit.topOf(v) + 0.45;
    kit.focusTop = hover + 1.9;
    blade.mesh.position.copy(V).setY(hover);
    const face = kit.anim.every(() => {
      blade.mesh.rotation.y = Math.atan2(cam.x - blade.mesh.position.x, cam.z - blade.mesh.position.z);
      return false;
    });
    kit.implode(V.clone().setY(hover + 1.4), glow, 90, 1.6, 0.4);
    kit.sfx.shimmer();
    await kit.anim.tween(0.45, (t) => {
      blade.mesh.scale.setScalar(Math.max(0.001, t * 0.8));
      blade.material.opacity = Math.min(1, t * 1.5);
      v.pitch = -0.35 * t;
    }, ease.outBack);
    void kit.stage.pulseBloom(1.6, 0.6);
    await kit.anim.tween(0.45, (t) => {
      blade.mesh.position.y = hover + Math.sin(t * Math.PI) * 0.12;
      v.squash = 1 - t * 0.1;
    }, ease.inOutQuad);
    kit.stopTremble(v);
    // Sentence.
    kit.sfx.whoosh();
    await Promise.all([
      kit.moves.pose(a, { raise: 0, strike: 1 }, 0.14, ease.inCubic),
      kit.anim.tween(0.17, (t) => (blade.mesh.position.y = hover * (1 - t)), ease.inCubic),
    ]);
    kit.focusTop = 0;
    kit.sfx.clang();
    kit.sfx.crack();
    kit.groundSlam(V, 1.6, glow);
    void kit.fx.pillar(V, glow, 6, 0.55, 0.7);
    void kit.stage.pulseBloom(1.5, 0.7);
    kit.particles.sparksAt(V.clone().setY(0.4), { count: 80, color: glow, speed: 4.5, life: 0.9, drag: 1.5 });
    v.pitch = 0;
    v.squash = 0.86;
    v.setGlow(1);
    await kit.anim.wait(0.4);
    // The victim crumbles away from the top down as the blade fades.
    const top = kit.topOf(v);
    let level = top + 0.05;
    const restore = kit.fx.dissolve(v.root, () => level);
    kit.sfx.crack();
    await kit.anim.tween(0.8, (t) => {
      level = (top + 0.05) * (1 - t);
      v.setGlow(1);
      blade.material.opacity = 1 - t;
      blade.mesh.position.y = t * 0.6;
      kit.particles.sparksAt(V.clone().setY(level), { count: 5, color: glow, speed: 1.2, life: 0.7, gravity: -1.5, spread: new THREE.Vector3(0.35, 0, 0.35) });
      if (Math.random() < 0.5) kit.particles.shatter(V.clone().setY(level), v.mats.body.color, 1, 0.8, 0.05);
    }, ease.inOutQuad);
    v.root.visible = false;
    restore();
    face();
    blade.dispose();
    if (figure) figure.winding = 0;
    await kit.moves.restPose(a, 0.4);
  },
};

export const BISHOP_FINISHERS: Record<string, Finisher> = { cleave, clockwork, judgement };
