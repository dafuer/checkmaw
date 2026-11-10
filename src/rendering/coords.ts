import type { Square } from '../domain/types';

export const FILES = 'abcdefgh';
export const BOARD_TOP = 0.0;

/** World X/Z centre of a square. White sits on +Z, files run along +X. */
export function squareToXZ(square: Square): { x: number; z: number } {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  if (file < 0 || !(rank >= 1 && rank <= 8)) throw new Error(`Invalid square ${square}`);
  return { x: file - 3.5, z: 4.5 - rank };
}

export function xzToSquare(x: number, z: number): Square | null {
  const file = Math.floor(x + 4);
  const rank = Math.floor(4 - z) + 1;
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return null;
  return `${FILES[file]}${rank}`;
}

export function isLightSquare(square: Square): boolean {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  return (file + rank) % 2 === 0;
}

export const ALL_SQUARES: Square[] = [...FILES].flatMap((f) =>
  [1, 2, 3, 4, 5, 6, 7, 8].map((r) => `${f}${r}`),
);
