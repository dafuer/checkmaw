import { ease } from '../animation/animator';
import type { PieceView } from '../pieces/pieceView';
import type { DuelKit } from './duelKit';
import type { ReactionName } from './finisherNames';

/** Pieces with a shield block the victim's counter-attack; the others flinch. */
const HAS_SHIELD = new Set(['p', 'b']);

type Reaction = (kit: DuelKit, victim: PieceView, attacker: PieceView) => Promise<void>;

/** Wakes the victim into its fighting form. */
async function rouse(kit: DuelKit, victim: PieceView, level = 0.75): Promise<void> {
  if (victim.type === 'n') return kit.moves.mountUp(victim, 0.45);
  if (victim.figure) return kit.moves.comeAlive(victim, 0.45);
  await kit.anim.tween(0.45, (t) => {
    victim.monster = t * level;
    victim.armed = t;
    victim.roll = Math.sin(t * 50) * 0.05;
  }, ease.outBack);
  victim.roll = 0;
}

/** The victim awakens and strikes back with its own weapon before losing. */
const counter: Reaction = async (kit, victim, attacker) => {
  kit.sfx.growl(0.7, 140);
  const toward = kit.toward(victim, attacker);
  if (victim.type === 'n') {
    await rouse(kit, victim);
    await Promise.all([
      kit.anim.tween(0.6, (t) => (victim.rear = Math.sin(t * Math.PI)), ease.inOutQuad),
      kit.anim.wait(0.3).then(() => kit.flinch(attacker)),
    ]);
    return;
  }
  if (victim.type === 'q') {
    // The lady answers with a bolt from her staff.
    await rouse(kit, victim);
    await kit.moves.pose(victim, { thrust: 1 }, 0.25, ease.outBack);
    kit.sfx.zap();
    const blocked = HAS_SHIELD.has(attacker.type);
    if (blocked) void kit.moves.pose(attacker, { guard: 1 }, 0.1, ease.outQuad);
    const hit = attacker.root.position.clone().setY(attacker.body.position.y + attacker.height * 0.5);
    await kit.fx.lightning(victim.weaponTip(), hit, kit.glowOf(victim), 0.2);
    kit.particles.sparksAt(hit, { count: 40, color: blocked ? 0xffd27a : kit.glowOf(victim), speed: 3, life: 0.5 });
    if (!blocked) void kit.flinch(attacker);
    await Promise.all([kit.moves.restPose(victim, 0.3), blocked ? kit.moves.pose(attacker, { guard: 0 }, 0.3) : Promise.resolve()]);
    return;
  }
  await rouse(kit, victim);
  if (victim.figure) await kit.moves.drawSword(victim);
  const start = victim.root.position.clone();
  await kit.moves.pose(victim, { raise: 0.8, guard: 0 }, 0.22, ease.outQuad);
  kit.sfx.slash();
  const blocked = HAS_SHIELD.has(attacker.type);
  const endTrail = kit.trail(victim);
  await Promise.all([
    kit.moves.pose(victim, { raise: 0, strike: 1 }, 0.14, ease.inCubic),
    kit.anim.tween(0.14, (t) => {
      victim.root.position.copy(start).addScaledVector(toward, t * 0.2);
      victim.mouth = t;
    }),
    blocked ? kit.moves.pose(attacker, { guard: 1 }, 0.12, ease.outQuad) : Promise.resolve(),
  ]);
  endTrail();
  if (blocked) {
    kit.sfx.clang();
    const at = attacker.root.position.clone().addScaledVector(toward, -0.3).setY(attacker.body.position.y + attacker.height * 0.5);
    kit.particles.sparksAt(at, { count: 50, color: 0xffd27a, speed: 3.5, life: 0.4, gravity: 4 });
    kit.impact(0.2);
  } else {
    kit.sfx.chomp();
    void kit.flinch(attacker);
  }
  await Promise.all([
    kit.moves.pose(victim, { strike: 0 }, 0.3),
    blocked ? kit.moves.pose(attacker, { guard: 0 }, 0.3) : Promise.resolve(),
    kit.anim.tween(0.3, (t) => {
      victim.root.position.copy(start).addScaledVector(toward, 0.2 * (1 - t));
      victim.mouth = 1 - t;
    }, ease.inOutQuad),
  ]);
};

/** No fight in this one: it shrinks, backs away and hides behind whatever it holds. */
const cower: Reaction = async (kit, victim, attacker) => {
  const away = kit.toward(attacker, victim);
  const start = victim.root.position.clone();
  kit.sfx.growl(0.35, 260);
  await rouse(kit, victim, 0.55);
  if (victim.type === 'n') {
    // The horse shies.
    kit.sfx.neigh();
    await kit.anim.tween(0.55, (t) => {
      victim.rear = Math.sin(t * Math.PI) * 0.45;
      victim.root.position.copy(start).addScaledVector(away, Math.sin(t * Math.PI) * 0.12);
    }, ease.inOutQuad);
    victim.rear = 0;
    return;
  }
  void kit.moves.pose(victim, { guard: 1 }, 0.25, ease.outQuad);
  // Two nervous shuffles backward, flattening itself against the floor.
  for (let i = 0; i < 2; i++) {
    kit.sfx.skitter();
    await kit.anim.tween(0.16, (t) => {
      victim.root.position.copy(start).addScaledVector(away, 0.07 * (i + t));
      victim.hop = Math.sin(t * Math.PI) * 0.04;
      victim.squash = 1 - 0.09 * (i + t);
      victim.pitch = -0.1 * (i + t);
    }, ease.outQuad);
  }
  victim.hop = 0;
  // A peek over the top... and back down.
  await kit.anim.wait(0.2);
  await kit.anim.tween(0.45, (t) => {
    const peek = Math.sin(t * Math.PI);
    victim.squash = 0.82 + peek * 0.2;
    victim.pitch = -0.2 + peek * 0.25;
  }, ease.inOutQuad);
  await kit.anim.tween(0.25, (t) => {
    victim.root.position.copy(start).addScaledVector(away, 0.14 * (1 - t));
    victim.squash = 0.82 + 0.1 * t;
    victim.pitch = -0.2 * (1 - t);
  }, ease.inOutQuad);
};

/** All bravado: it puffs itself up, hops on the spot and bellows at its attacker. */
const taunt: Reaction = async (kit, victim, attacker) => {
  await rouse(kit, victim, 0.9);
  if (victim.figure) await kit.moves.drawSword(victim);
  if (victim.type === 'n') {
    kit.sfx.neigh();
    await kit.anim.tween(0.8, (t) => {
      victim.rear = Math.abs(Math.sin(t * Math.PI * 2)) * 0.6;
      victim.mouth = Math.abs(Math.sin(t * Math.PI * 2)) * 0.8;
    }, ease.linear);
    victim.rear = 0;
    victim.mouth = 0;
    return;
  }
  void kit.moves.pose(victim, { raise: 1 }, 0.25, ease.outBack);
  for (let i = 0; i < 2; i++) {
    await kit.anim.tween(0.24, (t) => {
      victim.hop = Math.sin(t * Math.PI) * 0.16;
      victim.squash = 1 + Math.sin(t * Math.PI) * 0.1 - (t > 0.85 ? (t - 0.85) * 1.2 : 0);
    }, ease.linear);
    victim.hop = 0;
    victim.squash = 1;
    kit.sfx.step();
    kit.dust(victim.root.position, 10, 0.25, 1);
  }
  // The bellow: chest out, leaning in.
  kit.sfx.growl(0.6, 110);
  await kit.anim.tween(0.2, (t) => {
    victim.pitch = 0.22 * t;
    victim.squash = 1 + 0.08 * t;
    victim.mouth = t;
  }, ease.outBack);
  const facing = kit.forward(victim);
  const bellow = kit.anim.every(() => {
    kit.particles.sparksAt(victim.mouthWorld(), { count: 2, color: kit.glowOf(victim), speed: 2.2, life: 0.4, direction: facing.clone().setY(0.3), cone: 0.5 });
    victim.roll = Math.sin(kit.anim.now * 45) * 0.03;
    return false;
  });
  // The attacker is not impressed: it merely leans back a little.
  await Promise.all([kit.anim.wait(0.5), kit.anim.tween(0.5, (t) => (attacker.pitch = -Math.sin(t * Math.PI) * 0.1))]);
  bellow();
  attacker.pitch = 0;
  await Promise.all([
    kit.moves.restPose(victim, 0.25),
    kit.anim.tween(0.25, (t) => {
      victim.pitch = 0.22 * (1 - t);
      victim.squash = 1.08 - 0.08 * t;
      victim.mouth = 1 - t;
      victim.roll = 0;
    }),
  ]);
};

export const REACTIONS: Record<ReactionName, Reaction> = { counter, cower, taunt };
