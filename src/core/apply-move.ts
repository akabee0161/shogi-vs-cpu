import type { Move } from './moves';
import { demote, promote } from './piece';
import type { Position } from './position';

export function applyMove(pos: Position, move: Move): Position {
  const board = new Int8Array(pos.board);
  const hands: [Int8Array, Int8Array] = [new Int8Array(pos.hands[0]), new Int8Array(pos.hands[1])];
  const side = pos.sideToMove;
  const sign = side === 'b' ? 1 : -1;
  const handIdx = side === 'b' ? 0 : 1;

  if (move.drop !== undefined) {
    board[move.to] = sign * move.drop;
    hands[handIdx][move.drop - 1] = (hands[handIdx][move.drop - 1] ?? 0) - 1;
  } else {
    if (move.from === null) throw new Error('move.from is null but drop is undefined');
    const piece = board[move.from] ?? 0;
    const pieceType = Math.abs(piece);
    const captured = board[move.to] ?? 0;
    if (captured !== 0) {
      const capturedType = demote(Math.abs(captured));
      hands[handIdx][capturedType - 1] = (hands[handIdx][capturedType - 1] ?? 0) + 1;
    }
    board[move.from] = 0;
    board[move.to] = sign * (move.promote ? promote(pieceType) : pieceType);
  }

  return {
    board,
    hands,
    sideToMove: side === 'b' ? 'w' : 'b',
    ply: pos.ply + 1,
  };
}
