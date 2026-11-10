import * as THREE from 'three';
import type { Board } from './board';
import { Meadow } from './meadow';
import type { Stage } from './stage';

/**
 * Where the game is played: the dark ritual arena (braziers, runes, strong
 * glow) or a sunny mountain meadow with soft light and little glow.
 */
export const SCENES = ['arena', 'meadow'] as const;
export type SceneName = (typeof SCENES)[number];

export function readScene(saved: string | null): SceneName {
  return (SCENES as readonly string[]).includes(saved ?? '') ? (saved as SceneName) : 'arena';
}

/** Background, fog, lights, exposure and bloom of each scene. */
export interface Look {
  background: THREE.Color;
  fog: THREE.Fog | THREE.FogExp2;
  environment: number;
  exposure: number;
  hemisphere: { sky: number; ground: number; intensity: number };
  key: { color: number; intensity: number };
  rim: { color: number; intensity: number };
  bloom: number;
}

export const LOOKS: Record<SceneName, Look> = {
  arena: {
    background: new THREE.Color(0x07060c),
    fog: new THREE.FogExp2(0x0a0812, 0.035),
    environment: 0.35,
    exposure: 1.05,
    hemisphere: { sky: 0x8a7cff, ground: 0x1a0c08, intensity: 0.35 },
    key: { color: 0xffe2c4, intensity: 2.1 },
    rim: { color: 0x6a5cff, intensity: 1.4 },
    bloom: 0.75,
  },
  meadow: {
    background: new THREE.Color(0xcfe9ff),
    fog: new THREE.Fog(0xcfe9ff, 60, 150),
    environment: 0.4,
    exposure: 0.8,
    hemisphere: { sky: 0xcfe7ff, ground: 0x6f9a52, intensity: 0.6 },
    key: { color: 0xfff1d6, intensity: 1.8 },
    rim: { color: 0xffe9c8, intensity: 0.3 },
    bloom: 0.12,
  },
};

/** Switches the surroundings and the lighting between scenes. */
export class Scenery {
  private meadow: Meadow | null = null;
  current: SceneName = 'arena';

  constructor(
    private readonly stage: Stage,
    private readonly board: Board,
  ) {
    stage.onFrame((dt) => {
      if (this.current === 'meadow') this.meadow?.update(dt);
    });
  }

  set(name: SceneName): void {
    this.current = name;
    if (name === 'meadow' && !this.meadow) {
      // Built on first use so players who stay in the arena never pay for it.
      this.meadow = new Meadow();
      this.stage.scene.add(this.meadow.group);
    }
    this.board.arena.visible = name === 'arena';
    if (this.meadow) this.meadow.group.visible = name === 'meadow';
    this.stage.applyLook(LOOKS[name]);
  }
}
