import { describe, expect, it } from 'vitest';
import { ChessGame } from '../../src/domain/game';
import type { GameEvent } from '../../src/domain/types';

function play(game: ChessGame, moves: Array<[string, string, string?]>): void {
  for (const [from, to, promotion] of moves) {
    const result = game.move({ from, to, promotion: promotion as never });
    if (!result.ok) throw new Error(`illegal ${from}${to}: ${result.reason}`);
  }
}

describe('ChessGame', () => {
  it('starts with 32 pieces, white to move, and stable ids', () => {
    const game = new ChessGame();
    const pieces = game.pieces();
    expect(pieces).toHaveLength(32);
    expect(game.turn()).toBe('w');
    expect(new Set(pieces.map((p) => p.id)).size).toBe(32);
    expect(game.pieceAt('e1')).toMatchObject({ type: 'k', color: 'w' });
  });

  it('lists legal targets for a square', () => {
    const game = new ChessGame();
    expect(game.legalTargets('e2').map((t) => t.to).sort()).toEqual(['e3', 'e4']);
    expect(game.legalTargets('e7')).toEqual([]);
  });

  it('rejects illegal moves without changing state', () => {
    const game = new ChessGame();
    const fen = game.fen();
    const result = game.move({ from: 'e2', to: 'e5' });
    expect(result.ok).toBe(false);
    expect(game.fen()).toBe(fen);
  });

  it('emits a moved event keeping the piece id', () => {
    const game = new ChessGame();
    const id = game.pieceAt('g1')!.id;
    const result = game.move({ from: 'g1', to: 'f3' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toEqual<GameEvent[]>([
      { kind: 'moved', pieceId: id, from: 'g1', to: 'f3' },
    ]);
    expect(game.pieceAt('f3')!.id).toBe(id);
    expect(game.turn()).toBe('b');
  });

  it('emits captured before moved with attacker and victim ids', () => {
    const game = new ChessGame();
    play(game, [['e2', 'e4'], ['d7', 'd5']]);
    const attacker = game.pieceAt('e4')!.id;
    const victim = game.pieceAt('d5')!.id;
    const result = game.move({ from: 'e4', to: 'd5' });
    if (!result.ok) throw new Error('expected legal');
    expect(result.events).toEqual<GameEvent[]>([
      { kind: 'captured', attackerId: attacker, victimId: victim, square: 'd5' },
      { kind: 'moved', pieceId: attacker, from: 'e4', to: 'd5' },
    ]);
    expect(game.pieces()).toHaveLength(31);
    expect(game.captured().map((p) => p.id)).toEqual([victim]);
  });

  it('handles en passant capturing on a different square', () => {
    const game = new ChessGame();
    play(game, [['e2', 'e4'], ['a7', 'a6'], ['e4', 'e5'], ['d7', 'd5']]);
    const victim = game.pieceAt('d5')!.id;
    const result = game.move({ from: 'e5', to: 'd6' });
    if (!result.ok) throw new Error('expected legal');
    expect(result.events[0]).toMatchObject({ kind: 'captured', victimId: victim, square: 'd5' });
    expect(game.pieceAt('d5')).toBeUndefined();
  });

  it('moves the rook when castling', () => {
    const game = new ChessGame();
    play(game, [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6'], ['f1', 'c4'], ['g8', 'f6']]);
    const rook = game.pieceAt('h1')!.id;
    const result = game.move({ from: 'e1', to: 'g1' });
    if (!result.ok) throw new Error('expected legal');
    expect(result.events).toContainEqual({ kind: 'moved', pieceId: rook, from: 'h1', to: 'f1' });
    expect(game.pieceAt('f1')!.id).toBe(rook);
  });

  it('promotes keeping the id and changing the type', () => {
    const game = new ChessGame('8/P7/8/8/8/8/k7/7K w - - 0 1');
    const pawn = game.pieceAt('a7')!.id;
    expect(game.needsPromotion('a7', 'a8')).toBe(true);
    const result = game.move({ from: 'a7', to: 'a8', promotion: 'q' });
    if (!result.ok) throw new Error('expected legal');
    expect(result.events).toContainEqual({ kind: 'promoted', pieceId: pawn, to: 'q', square: 'a8' });
    expect(game.pieceAt('a8')).toMatchObject({ id: pawn, type: 'q' });
  });

  it('reports check and checkmate', () => {
    const game = new ChessGame();
    play(game, [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4']]);
    const result = game.move({ from: 'd8', to: 'h4' });
    if (!result.ok) throw new Error('expected legal');
    expect(result.events).toContainEqual({ kind: 'check', color: 'w' });
    expect(result.events).toContainEqual({ kind: 'gameOver', result: { winner: 'b', reason: 'checkmate' } });
    expect(game.status()).toEqual({ winner: 'b', reason: 'checkmate' });
  });

  it('reports stalemate as a draw', () => {
    const game = new ChessGame('7k/8/6Q1/8/8/8/8/K7 w - - 0 1');
    const result = game.move({ from: 'g6', to: 'f7' });
    if (!result.ok) throw new Error('expected legal');
    expect(result.events).toContainEqual({ kind: 'gameOver', result: { winner: null, reason: 'stalemate' } });
  });

  it('undoes moves restoring captured pieces with the same ids', () => {
    const game = new ChessGame();
    play(game, [['e2', 'e4'], ['d7', 'd5']]);
    const before = game.pieces().map((p) => `${p.id}@${p.square}`).sort();
    play(game, [['e4', 'd5']]);
    expect(game.undo()).toBe(true);
    expect(game.pieces().map((p) => `${p.id}@${p.square}`).sort()).toEqual(before);
    expect(game.captured()).toEqual([]);
    expect(game.turn()).toBe('w');
  });

  it('returns false when there is nothing to undo', () => {
    expect(new ChessGame().undo()).toBe(false);
  });
});
