export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PromotionType = 'q' | 'r' | 'b' | 'n';
export type Square = string;

export interface Piece {
  readonly id: string;
  readonly type: PieceType;
  readonly color: Color;
  readonly square: Square;
}

export interface MoveRequest {
  from: Square;
  to: Square;
  promotion?: PromotionType;
}

export interface LegalTarget {
  to: Square;
  isCapture: boolean;
  isPromotion: boolean;
}

export type DrawReason =
  | 'stalemate'
  | 'threefold'
  | 'insufficient'
  | 'fifty-moves'
  | 'draw';

export interface GameResult {
  winner: Color | null;
  reason: 'checkmate' | DrawReason;
}

export type GameEvent =
  | { kind: 'captured'; attackerId: string; victimId: string; square: Square }
  | { kind: 'moved'; pieceId: string; from: Square; to: Square }
  | { kind: 'promoted'; pieceId: string; to: PromotionType; square: Square }
  | { kind: 'check'; color: Color }
  | { kind: 'gameOver'; result: GameResult };

export type MoveResult =
  | { ok: true; san: string; events: GameEvent[] }
  | { ok: false; reason: string };

/** One position of a finished (or ongoing) game, for reviewing it move by move. */
export interface ReviewFrame {
  /** Half-moves played to reach this position (0 = the start). */
  ply: number;
  pieces: Piece[];
  captured: Piece[];
  /** The move that led here, or null for the starting position. */
  move: { from: Square; to: Square; san: string } | null;
  /** Whether the side to move is in check here. */
  check: boolean;
  turn: Color;
}
