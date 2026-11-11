import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sfx } from '../../src/audio/sfx';
import type { PieceType } from '../../src/domain/types';
import { Animator } from '../../src/rendering/animation/animator';
import { BattleDirector } from '../../src/rendering/battle/battleDirector';
import { FINISHER_NAMES, MARCH_NAMES, REACTION_NAMES, type FinisherName } from '../../src/rendering/battle/finisherNames';
import { FINISHERS } from '../../src/rendering/battle/finishers';
import { mulberry32, Variety } from '../../src/rendering/battle/variety';
import type { Particles } from '../../src/rendering/effects/particles';
import { PieceView } from '../../src/rendering/pieces/pieceView';
import type { Stage } from '../../src/rendering/stage';
import { I18n, LANGS } from '../../src/ui/i18n';

const TYPES: PieceType[] = ['p', 'n', 'b', 'r', 'q', 'k'];
const FRAME = 1 / 30;
// Node's macrotask scheduler; the project does not load Node typings.
declare const setImmediate: (callback: () => void) => void;

/** The parts of the stage a choreography touches, without a renderer. */
class FakeStage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera();
  readonly controls = { enabled: true, target: new THREE.Vector3() };
  readonly animator = new Animator();
  constructor() {
    this.camera.position.set(0, 11, 8);
  }
  addShake(): void {}
  pulseBloom(): Promise<void> {
    return Promise.resolve();
  }
  punch(): Promise<void> {
    return Promise.resolve();
  }
  pose() {
    return { position: this.camera.position.clone(), target: this.controls.target.clone() };
  }
  flyTo(pose: { position: THREE.Vector3; target: THREE.Vector3 }, duration: number): Promise<void> {
    const from = this.pose();
    return this.animator.tween(duration, (t) => {
      this.camera.position.lerpVectors(from.position, pose.position, t);
      this.controls.target.lerpVectors(from.target, pose.target, t);
    });
  }
}

const silentSfx = new Proxy({}, { get: () => () => {} }) as unknown as Sfx;
const noParticles = { sparksAt: () => {}, shatter: () => {} } as unknown as Particles;

function setUp(seed = 1) {
  const stage = new FakeStage();
  const captions: Array<FinisherName | null> = [];
  const variety = new Variety(mulberry32(seed));
  const director = new BattleDirector(stage as unknown as Stage, noParticles, silentSfx, {
    letterbox: () => {},
    announce: () => {},
    announceMove: (name) => captions.push(name),
  }, variety);
  return { stage, director, variety, captions };
}

function piece(id: string, type: PieceType, color: 'w' | 'b', x: number, z: number, scene: THREE.Scene): PieceView {
  const view = new PieceView(id, type, color);
  view.root.position.set(x, 0, z);
  view.root.rotation.y = view.restFacing;
  scene.add(view.root);
  return view;
}

/** Runs the frame loop until the animation resolves; fails if it never does. */
async function run(stage: FakeStage, pieces: PieceView[], animation: Promise<void>, maxSeconds = 60): Promise<number> {
  let done = false;
  let failure: unknown;
  animation.then(() => (done = true), (e) => {
    failure = e;
    done = true;
  });
  let frames = 0;
  while (!done) {
    if (frames * FRAME > maxSeconds) throw new Error(`animation still running after ${maxSeconds}s`);
    stage.animator.update(FRAME);
    for (const p of pieces) p.update(FRAME);
    frames++;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  if (failure) throw failure;
  return frames * FRAME;
}

/** Lets fading effects finish, then checks nothing is left behind. */
async function expectNothingLeft(stage: FakeStage, pieces: PieceView[], sceneChildren: number): Promise<void> {
  await run(stage, pieces, stage.animator.wait(4));
  expect(stage.animator.pending).toEqual({ tweens: 0, tickers: 0 });
  expect(stage.scene.children.length).toBe(sceneChildren);
}

function expectAtRest(view: PieceView, at: THREE.Vector3): void {
  expect(view.root.position.distanceTo(at)).toBeLessThan(1e-6);
  expect(view.root.visible).toBe(true);
  expect(view.root.rotation.x).toBe(0);
  expect(view.root.rotation.z).toBe(0);
  expect(Math.cos(view.root.rotation.y - view.restFacing)).toBeCloseTo(1);
  expect(view.root.scale.toArray()).toEqual([1, 1, 1]);
  expect([view.monster, view.mouth, view.armed, view.avatar, view.mounted, view.hop, view.rear, view.gait]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  expect([view.pitch, view.roll, view.twist, view.squash]).toEqual([0, 0, 0, 1]);
  expect(view.airborne).toBe(false);
  if (view.gear) expect(Object.values(view.gear.pose).every((w) => w === 0)).toBe(true);
  if (view.figure) expect([view.figure.drawn, view.figure.winding]).toEqual([0, 0]);
  if (view.mount) expect([view.mount.gallop, view.mount.couch, view.mount.windup]).toEqual([0, 0, 0]);
}

describe('catalogue', () => {
  it('offers at least three finishers and three move styles for every piece', () => {
    for (const type of TYPES) {
      expect(FINISHER_NAMES[type].length).toBeGreaterThanOrEqual(3);
      expect(MARCH_NAMES[type].length).toBeGreaterThanOrEqual(3);
      expect(Object.keys(FINISHERS[type]).sort()).toEqual([...FINISHER_NAMES[type]].sort());
    }
    const all = TYPES.flatMap((t) => [...FINISHER_NAMES[t]]);
    expect(new Set(all).size).toBe(all.length);
  });

  it('names every finisher in every language', () => {
    for (const lang of LANGS) {
      const titles = new I18n(lang).t.finisher;
      for (const type of TYPES) for (const name of FINISHER_NAMES[type]) expect(titles[name].length).toBeGreaterThan(2);
    }
  });
});

describe('duels', () => {
  let errors: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errors.mockRestore();
  });

  for (const attackerType of TYPES) {
    for (const name of FINISHER_NAMES[attackerType]) {
      it(`${attackerType} plays "${name}" on every kind of victim and leaves the board clean`, async () => {
        const { stage, director, variety, captions } = setUp();
        variety.force(`finisher:${attackerType}`, name);
        const baseline = stage.scene.children.length;
        for (let i = 0; i < TYPES.length; i++) {
          const victimType = TYPES[i];
          variety.force('reaction', REACTION_NAMES[i % REACTION_NAMES.length]);
          // A knight's jump apart for knights, otherwise a diagonal neighbour or a longer line.
          const from = attackerType === 'n' ? [1, 2] : attackerType === 'p' || attackerType === 'k' ? [1, 1] : [3, 0];
          const attacker = piece('a', attackerType, 'w', from[0] * (i % 2 ? -1 : 1), from[1], stage.scene);
          const victim = piece('v', victimType, 'b', 0, 0, stage.scene);
          const destination = new THREE.Vector3(0, 0, 0);
          const seconds = await run(stage, [attacker, victim], director.battle(attacker, victim, destination));
          expect(errors).not.toHaveBeenCalled();
          expect(seconds).toBeGreaterThan(4);
          expect(seconds).toBeLessThan(25);
          expect(victim.root.visible).toBe(false);
          expectAtRest(attacker, destination);
          expect(captions).toContain(name);
          expect(captions.at(-1)).toBeNull();
          expect(stage.controls.enabled).toBe(true);
          stage.scene.remove(victim.root);
          await expectNothingLeft(stage, [attacker], baseline + 1);
          stage.scene.remove(attacker.root);
          attacker.dispose();
          victim.dispose();
        }
      });
    }
  }

  it('deals a different finisher each time until the repertoire is used up', async () => {
    const { stage, director, captions } = setUp(4);
    for (let i = 0; i < FINISHER_NAMES.p.length; i++) {
      const attacker = piece('a', 'p', 'w', 1, 1, stage.scene);
      const victim = piece('v', 'p', 'b', 0, 0, stage.scene);
      await run(stage, [attacker, victim], director.battle(attacker, victim, new THREE.Vector3()));
      stage.scene.remove(attacker.root, victim.root);
    }
    const played = captions.filter((c) => c !== null);
    expect(new Set(played).size).toBe(FINISHER_NAMES.p.length);
  });

  it('recovers when a choreography throws: the attacker still ends on its square', async () => {
    const { stage, director, variety } = setUp();
    variety.force('finisher:r', 'slam');
    const original = FINISHERS.r.slam.play;
    FINISHERS.r.slam.play = async () => {
      throw new Error('boom');
    };
    try {
      const attacker = piece('a', 'r', 'w', 3, 0, stage.scene);
      const victim = piece('v', 'q', 'b', 0, 0, stage.scene);
      const destination = new THREE.Vector3();
      await run(stage, [attacker, victim], director.battle(attacker, victim, destination));
      expect(errors).toHaveBeenCalledTimes(1);
      expect(victim.root.visible).toBe(false);
      expectAtRest(attacker, destination);
      expect(stage.controls.enabled).toBe(true);
    } finally {
      FINISHERS.r.slam.play = original;
    }
  });
});

describe('moves', () => {
  for (const type of TYPES) {
    for (const name of MARCH_NAMES[type]) {
      it(`${type} travels with "${name}" and ends at rest on its square`, async () => {
        const { stage, director, variety } = setUp();
        variety.force(`march:${type}`, name);
        const baseline = stage.scene.children.length;
        const targets = type === 'n' ? [[1, -2], [-2, 1]] : type === 'k' || type === 'p' ? [[0, -1], [0, 1]] : [[3, -3], [-4, 0]];
        const view = piece('m', type, 'w', 0, 0, stage.scene);
        for (const [x, z] of targets) {
          const to = new THREE.Vector3(view.root.position.x + x, 0, view.root.position.z + z);
          const seconds = await run(stage, [view], director.moves.march(view, to));
          expect(seconds).toBeLessThan(8);
          expectAtRest(view, to);
        }
        await expectNothingLeft(stage, [view], baseline + 1);
      });
    }
  }
});

describe('checkmate finale', () => {
  it('plays every finale, cheers with the allies and leaves nothing running', async () => {
    for (let i = 0; i < 3; i++) {
      const { stage, director, variety } = setUp();
      variety.force('finale', ['salute', 'fireworks', 'flourish'][i]);
      const winner = piece('wk', 'k', 'w', 0, 3, stage.scene);
      const loser = piece('bk', 'k', 'b', 0, -3, stage.scene);
      const ally = piece('wq', 'q', 'w', 2, 2, stage.scene);
      const baseline = stage.scene.children.length;
      await run(stage, [winner, loser, ally], director.celebrate(winner, loser, [winner, ally]));
      expect(stage.controls.enabled).toBe(true);
      // The winner keeps its borrowed light until the board is next synced.
      director.returnLights(winner);
      await expectNothingLeft(stage, [winner, loser, ally], baseline);
      expect([ally.hop, ally.squash]).toEqual([0, 1]);
    }
  });
});
