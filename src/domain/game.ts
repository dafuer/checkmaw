import { Chess, type Move } from 'chess.js';
import type {
  Color,
  GameEvent,
  GameResult,
  LegalTarget,
  MoveRequest,
  MoveResult,
  Piece,
  PieceType,
  Square,
} from './types';

interface Snapshot {
  board: Map<Square, Piece>;
  captured: Piece[];
}

/**
 * Chess rules delegated to chess.js; this class adds stable piece identities
 * and translates each move into domain events the presentation layer consumes.
 */
export class ChessGame {
  private readonly chess: Chess;
  private board = new Map<Square, Piece>();
  private capturedPieces: Piece[] = [];
  private readonly history: Snapshot[] = [];

  constructor(fen?: string) {
    this.chess = fen ? new Chess(fen) : new Chess();
    this.indexBoard();
  }

  turn(): Color {
    return this.chess.turn();
  }

  fen(): string {
    return this.chess.fen();
  }

  pieces(): Piece[] {
    return [...this.board.values()];
  }

  captured(): Piece[] {
    return [...this.capturedPieces];
  }

  pieceAt(square: Square): Piece | undefined {
    return this.board.get(square);
  }

  /** Moves played so far in SAN, oldest first. */
  sanHistory(): string[] {
    return this.chess.history();
  }

  isCheck(): boolean {
    return this.chess.isCheck();
  }

  kingSquare(color: Color): Square | undefined {
    return this.pieces().find((p) => p.type === 'k' && p.color === color)?.square;
  }

  legalTargets(square: Square): LegalTarget[] {
    const moves = this.chess.moves({ square: square as never, verbose: true });
    const byTarget = new Map<Square, LegalTarget>();
    for (const m of moves) {
      const existing = byTarget.get(m.to);
      byTarget.set(m.to, {
        to: m.to,
        isCapture: m.isCapture() || m.isEnPassant(),
        isPromotion: (existing?.isPromotion ?? false) || m.isPromotion(),
      });
    }
    return [...byTarget.values()];
  }

  needsPromotion(from: Square, to: Square): boolean {
    return this.legalTargets(from).some((t) => t.to === to && t.isPromotion);
  }

  move(request: MoveRequest): MoveResult {
    let move: Move;
    try {
      move = this.chess.move({ from: request.from, to: request.to, promotion: request.promotion });
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }

    this.history.push({ board: new Map(this.board), captured: [...this.capturedPieces] });
    const events: GameEvent[] = [];
    const mover = this.board.get(move.from);
    if (!mover) throw new Error(`Inconsistent board: no piece on ${move.from}`);

    if (move.isCapture() || move.isEnPassant()) {
      const victimSquare = move.isEnPassant() ? `${move.to[0]}${move.from[1]}` : move.to;
      const victim = this.board.get(victimSquare);
      if (!victim) throw new Error(`Inconsistent board: no victim on ${victimSquare}`);
      events.push({ kind: 'captured', attackerId: mover.id, victimId: victim.id, square: victimSquare });
      this.board.delete(victimSquare);
      this.capturedPieces.push(victim);
    }

    this.relocate(mover, move.from, move.to);
    events.push({ kind: 'moved', pieceId: mover.id, from: move.from, to: move.to });

    if (move.isKingsideCastle() || move.isQueensideCastle()) {
      const rank = move.from[1];
      const [rookFrom, rookTo] = move.isKingsideCastle() ? [`h${rank}`, `f${rank}`] : [`a${rank}`, `d${rank}`];
      const rook = this.board.get(rookFrom);
      if (!rook) throw new Error(`Inconsistent board: no rook on ${rookFrom}`);
      this.relocate(rook, rookFrom, rookTo);
      events.push({ kind: 'moved', pieceId: rook.id, from: rookFrom, to: rookTo });
    }

    if (move.promotion) {
      const promoted = this.board.get(move.to)!;
      this.board.set(move.to, { ...promoted, type: move.promotion as PieceType });
      events.push({ kind: 'promoted', pieceId: mover.id, to: move.promotion as never, square: move.to });
    }

    if (this.chess.isCheck()) events.push({ kind: 'check', color: this.chess.turn() });
    const result = this.status();
    if (result) events.push({ kind: 'gameOver', result });

    return { ok: true, san: move.san, events };
  }

  undo(): boolean {
    const snapshot = this.history.pop();
    if (!snapshot || !this.chess.undo()) return false;
    this.board = snapshot.board;
    this.capturedPieces = snapshot.captured;
    return true;
  }

  status(): GameResult | null {
    const c = this.chess;
    if (c.isCheckmate()) return { winner: c.turn() === 'w' ? 'b' : 'w', reason: 'checkmate' };
    if (c.isStalemate()) return { winner: null, reason: 'stalemate' };
    if (c.isInsufficientMaterial()) return { winner: null, reason: 'insufficient' };
    if (c.isThreefoldRepetition()) return { winner: null, reason: 'threefold' };
    if (c.isDrawByFiftyMoves()) return { winner: null, reason: 'fifty-moves' };
    if (c.isDraw()) return { winner: null, reason: 'draw' };
    return null;
  }

  private relocate(piece: Piece, from: Square, to: Square): void {
    this.board.delete(from);
    this.board.set(to, { ...piece, square: to });
  }

  private indexBoard(): void {
    const counters = new Map<string, number>();
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (!cell) continue;
        const key = `${cell.color}${cell.type}`;
        const n = (counters.get(key) ?? 0) + 1;
        counters.set(key, n);
        const piece: Piece = { id: `${key}${n}`, type: cell.type, color: cell.color, square: cell.square };
        this.board.set(cell.square, piece);
      }
    }
  }
}
