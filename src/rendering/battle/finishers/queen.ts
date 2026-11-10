import * as THREE from 'three';
import { ease } from '../../animation/animator';
import type { PieceView } from '../../pieces/pieceView';
import type { DuelKit, Finisher } from '../duelKit';

const HOVER = 0.18;

/** She rises off the floor with her staff levelled; returns the function that ends the hover bob. */
async function rise(kit: DuelKit, a: PieceView, pose: 'thrust' | 'raise'): Promise<() => void> {
  kit.sfx.magic();
  await Promise.all([
    kit.anim.tween(0.5, (t) => (a.hop = t * HOVER), ease.outBack),
    kit.moves.pose(a, { [pose]: 1 }, 0.5, ease.outBack),
  ]);
  return kit.anim.every(() => {
    a.hop = HOVER + Math.sin(kit.anim.now * 3) * 0.03;
    return false;
  });
}

async function settle(kit: DuelKit, a: PieceView): Promise<void> {
  const from = a.hop;
  await Promise.all([
    kit.anim.tween(0.45, (t) => (a.hop = from * (1 - t)), ease.inOutQuad),
    kit.moves.restPose(a, 0.45),
  ]);
  a.hop = 0;
}

/** Three bolts from her great staff, then a pillar of light crystallises the victim and it shatters. */
const crystal: Finisher = {
  reach: 1.7,
  async play(kit, a, v) {
    const glow = kit.glowOf(a);
    const hover = await rise(kit, a, 'thrust');
    kit.stopTremble(v);
    for (let i = 0; i < 3; i++) {
      kit.sfx.zap();
      const target = kit.centerOf(v).add(new THREE.Vector3(0, (Math.random() - 0.5) * 0.3, 0));
      void kit.fx.lightning(a.weaponTip(), target, glow, 0.25);
      void kit.stage.pulseBloom(1.5, 0.25);
      kit.impact(0.2);
      kit.hitSparks(target, v, 30);
      await Promise.all([kit.stagger(v, a.root.position, 0.05), kit.anim.wait(0.3)]);
    }
    // Staff to the sky: a pillar of light turns the victim to crystal.
    await kit.moves.pose(a, { thrust: 0, raise: 1 }, 0.4, ease.outBack);
    kit.sfx.magic();
    const top = v.root.position.clone().setY(4);
    const centre = kit.centerOf(v);
    for (let i = 0; i < 3; i++) void kit.fx.lightning(top.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3)), centre, glow, 0.5);
    void kit.fx.pillar(v.root.position, glow, 5, 0.45, 0.8);
    kit.sfx.zap();
    void kit.stage.pulseBloom(2.2, 0.7);
    kit.stage.addShake(0.5);
    const ice = kit.hot(a, 0.5);
    const startColor = v.mats.body.color.clone();
    await kit.anim.tween(0.7, (t) => {
      v.mats.body.color.copy(startColor).lerp(ice, t);
      v.setGlow(t * 1.6);
      v.mats.body.roughness = 0.3 * (1 - t);
      v.root.scale.setScalar(1 + t * 0.06);
    }, ease.inOutQuad);
    // A tap of the staff and it shatters.
    const endTrail = kit.trail(a);
    await kit.moves.pose(a, { raise: 0, strike: 1 }, 0.18, ease.inCubic);
    endTrail();
    hover();
    kit.sfx.clang();
    const at = kit.centerOf(v);
    kit.particles.shatter(at, ice, 50, 2.6, v.height * 0.6);
    kit.particles.sparksAt(at, { count: 160, color: glow, speed: 3.5, life: 1.1, drag: 1.2 });
    kit.particles.sparksAt(at, { count: 60, color: 0xffffff, speed: 2, life: 0.8 });
    kit.sfx.crack();
    kit.impact(0.8);
    v.root.visible = false;
    await settle(kit, a);
  },
};

/** She lifts the victim off the board, spins it and crushes it to a point that bursts as a nova. */
const singularity: Finisher = {
  reach: 1.7,
  async play(kit, a, v) {
    const glow = kit.glowOf(a);
    const hover = await rise(kit, a, 'thrust');
    kit.stopTremble(v);
    const V = v.root.position.clone();
    const centre = new THREE.Vector3();
    const half = Math.max(0.3, kit.topOf(v) * 0.5);
    let spin = 0;
    let nextBolt = 0;
    const hold = kit.anim.every((dt) => {
      centre.copy(v.root.position).setY(v.root.position.y + half * v.root.scale.y);
      v.twist += spin * dt;
      // A tether of light from the staff, and motes orbiting the captive.
      nextBolt -= dt;
      if (nextBolt <= 0) {
        nextBolt = 0.2;
        void kit.fx.lightning(a.weaponTip(), centre, glow, 0.18);
      }
      const angle = kit.anim.now * 9;
      for (const side of [0, Math.PI]) {
        kit.particles.sparksAt(centre.clone().add(new THREE.Vector3(Math.cos(angle + side) * 0.55, Math.sin(angle * 0.5 + side) * 0.2, Math.sin(angle + side) * 0.55)), { count: 1, color: glow, speed: 0.15, life: 0.45 });
      }
      return false;
    });
    kit.sfx.zap();
    await kit.anim.tween(0.85, (t) => {
      v.root.position.copy(V).setY(t * 1.1);
      v.roll = Math.sin(t * 9) * 0.15 * (1 - t);
      spin = 2 + t * 10;
    }, ease.outCubic);
    // Crush.
    kit.sfx.magic();
    kit.sfx.growl(0.8, 50);
    await Promise.all([
      kit.moves.pose(a, { thrust: 1, grab: 1 }, 0.7, ease.inQuad),
      kit.anim.tween(0.75, (t) => {
        v.root.scale.setScalar(Math.max(0.04, 1 - t * 0.96));
        v.root.position.y = 1.1 + half * t * 0.96;
        v.setGlow(t * 2.5);
        spin = 12 + t * 30;
        kit.implode(centre, glow, 5, 1.1 - t * 0.5, 0.3);
        kit.stage.addShake(0.05 * t);
      }, ease.inCubic),
    ]);
    hold();
    v.root.visible = false;
    // One held breath, then the nova.
    kit.particles.sparksAt(centre, { count: 12, color: 0xffffff, speed: 0.2, life: 0.25 });
    kit.anim.warpTime(0.03, 0.22);
    await kit.anim.wait(0.012);
    kit.sfx.zap();
    kit.sfx.crack();
    kit.sfx.impact();
    kit.stage.addShake(0.9);
    void kit.stage.punch(5, 0.6);
    void kit.stage.pulseBloom(2.5, 0.7);
    void kit.fx.shockwave(V, glow, 3, 0.7);
    void kit.fx.pillar(V, glow, 4.5, 0.6, 0.6);
    kit.particles.shatter(centre, kit.hot(a, 0.5), 50, 3.2, 0.1);
    kit.particles.sparksAt(centre, { count: 240, color: glow, speed: 6, life: 1.1, drag: 2.2 });
    kit.particles.sparksAt(centre, { count: 80, color: 0xffffff, speed: 3, life: 0.8, drag: 1.5 });
    hover();
    await kit.anim.wait(0.3);
    await settle(kit, a);
  },
};

const FIREWORK_TINTS = [0xffd27a, 0xffffff];

/** A pirouette, and the victim comes apart into stardust that streams into her staff and leaves as fireworks. */
const stardust: Finisher = {
  reach: 1.6,
  async play(kit, a, v) {
    const glow = kit.glowOf(a);
    kit.sfx.magic();
    // Pirouette with the staff sweeping up.
    await Promise.all([
      kit.anim.tween(0.7, (t) => {
        a.twist = t * Math.PI * 2;
        a.hop = Math.sin(t * Math.PI) * 0.12 + t * HOVER;
        kit.particles.sparksAt(a.weaponTip(), { count: 2, color: glow, speed: 0.4, life: 0.6, gravity: -0.4 });
      }, ease.inOutCubic),
      kit.moves.pose(a, { raise: 1 }, 0.7, ease.inOutCubic),
    ]);
    a.twist = 0;
    const hover = kit.anim.every(() => {
      a.hop = HOVER + Math.sin(kit.anim.now * 3) * 0.03;
      return false;
    });
    kit.stopTremble(v);
    // The victim unravels from the feet up; every mote flies to the crystal.
    const top = kit.topOf(v);
    const V = v.root.position.clone();
    let level = 0;
    const restore = kit.fx.dissolve(v.root, () => level, 'above');
    const tip = new THREE.Vector3();
    const from = new THREE.Vector3();
    kit.sfx.shimmer();
    let chime = 0;
    await kit.anim.tween(1.5, (t) => {
      const rise = t * 0.3;
      v.root.position.copy(V).setY(rise);
      v.twist = t * 1.4;
      v.setGlow(1.2 + t);
      level = rise + (top + 0.05) * t;
      a.weaponTip(tip);
      for (let i = 0; i < 5; i++) {
        const angle = Math.random() * Math.PI * 2;
        from.set(V.x + Math.cos(angle) * 0.22, level, V.z + Math.sin(angle) * 0.22);
        const distance = from.distanceTo(tip);
        kit.particles.sparksAt(from, {
          count: 1,
          color: i % 3 === 0 ? 0xffffff : glow,
          speed: distance / 0.45,
          life: 0.55,
          drag: 0,
          direction: tip.clone().sub(from).add(new THREE.Vector3(0, 0.5, 0)),
          cone: 0.12,
        });
      }
      if (t * 5 > chime) {
        chime++;
        kit.sfx.shimmer();
      }
    }, ease.inOutQuad);
    v.root.visible = false;
    restore();
    void kit.stage.pulseBloom(1.9, 0.5);
    kit.particles.sparksAt(a.weaponTip(), { count: 50, color: 0xffffff, speed: 1.2, life: 0.5 });
    // A tap of the staff lets it all go again, as fireworks.
    await kit.moves.pose(a, { raise: 0.4, strike: 0.6 }, 0.25, ease.inQuad);
    await kit.moves.pose(a, { raise: 1, strike: 0 }, 0.14, ease.outBack);
    for (let i = 0; i < 4; i++) {
      const burst = a.weaponTip().add(new THREE.Vector3((Math.random() - 0.5) * 2.2, 1.1 + Math.random() * 1.1, (Math.random() - 0.5) * 2.2));
      void kit.fx.beam(a.weaponTip(), burst, glow, 0.02, 0.2);
      await kit.anim.wait(0.12);
      kit.sfx.crack();
      kit.particles.sparksAt(burst, { count: 110, color: i % 2 === 0 ? glow : FIREWORK_TINTS[(i >> 1) % 2], speed: 3.4, life: 1.2, gravity: 1.6, drag: 1.6 });
      kit.particles.sparksAt(burst, { count: 25, color: 0xffffff, speed: 1.2, life: 0.5 });
      void kit.stage.pulseBloom(1.5, 0.3);
      await kit.anim.wait(0.1);
    }
    hover();
    await kit.anim.wait(0.25);
    await settle(kit, a);
  },
};

export const QUEEN_FINISHERS: Record<string, Finisher> = { crystal, singularity, stardust };
