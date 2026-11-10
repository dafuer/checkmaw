import type { PieceType } from '../../domain/types';

/**
 * Every finishing move, by the piece that performs it. Kept free of rendering
 * code so the catalogue, the tests and the on-screen captions can share it.
 */
export const FINISHER_NAMES = {
  p: ['gulp', 'pounce', 'whirlwind', 'slurp'],
  n: ['joust', 'trample', 'skyLance'],
  b: ['cleave', 'clockwork', 'judgement'],
  r: ['slam', 'homeRun', 'nail'],
  q: ['crystal', 'singularity', 'stardust'],
  k: ['iaido', 'riposte', 'skyfall'],
} as const satisfies Record<PieceType, readonly string[]>;

export type FinisherName = (typeof FINISHER_NAMES)[PieceType][number];

/** The ways each piece can make an ordinary move. */
export const MARCH_NAMES = {
  p: ['waddle', 'hops', 'scurry'],
  n: ['ride', 'vault', 'canter'],
  b: ['march', 'windup', 'parade'],
  r: ['stomp', 'slide', 'bound'],
  q: ['glide', 'blink', 'waltz'],
  k: ['stride', 'guarded', 'swagger'],
} as const satisfies Record<PieceType, readonly string[]>;

export type MarchName = (typeof MARCH_NAMES)[PieceType][number];

/** How a victim faces its end before the finisher lands. */
export const REACTION_NAMES = ['counter', 'cower', 'taunt'] as const;
export type ReactionName = (typeof REACTION_NAMES)[number];

/** Where the camera sets up to film a duel. */
export const CAMERA_NAMES = ['side', 'low', 'high', 'shoulder'] as const;
export type CameraName = (typeof CAMERA_NAMES)[number];

/** How the winning king celebrates checkmate. */
export const FINALE_NAMES = ['salute', 'fireworks', 'flourish'] as const;
export type FinaleName = (typeof FINALE_NAMES)[number];
