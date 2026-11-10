import type { PieceType } from '../../../domain/types';
import type { Finisher } from '../duelKit';
import type { FinisherName } from '../finisherNames';
import { BISHOP_FINISHERS } from './bishop';
import { KING_FINISHERS } from './king';
import { KNIGHT_FINISHERS } from './knight';
import { PAWN_FINISHERS } from './pawn';
import { QUEEN_FINISHERS } from './queen';
import { ROOK_FINISHERS } from './rook';

/** The finishing moves each attacker type can choose from. */
export const FINISHERS: Record<PieceType, Record<string, Finisher>> = {
  p: PAWN_FINISHERS,
  n: KNIGHT_FINISHERS,
  b: BISHOP_FINISHERS,
  r: ROOK_FINISHERS,
  q: QUEEN_FINISHERS,
  k: KING_FINISHERS,
};

export function finisher(type: PieceType, name: FinisherName): Finisher {
  const found = FINISHERS[type][name];
  if (!found) throw new Error(`Piece ${type} has no finisher called ${name}`);
  return found;
}
