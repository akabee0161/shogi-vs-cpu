import { applyMove } from './apply-move';
import { type Move, pseudoLegalBoardMoves, pseudoLegalMoves } from './moves';
import { KING, PAWN } from './piece';
import type { Position } from './position';

function findKing(pos: Position, side: 'b' | 'w'): number {
  const target = side === 'b' ? KING : -KING;
  for (let i = 0; i < 81; i++) {
    if (pos.board[i] === target) return i;
  }
  throw new Error(`king not found for side ${side}`);
}

export function isInCheck(pos: Position, side: 'b' | 'w'): boolean {
  const kingSquare = findKing(pos, side);
  const opponentSide = side === 'b' ? 'w' : 'b';
  const opponentView: Position = { ...pos, sideToMove: opponentSide };
  return pseudoLegalBoardMoves(opponentView).some((m) => m.to === kingSquare);
}

function isDisallowedPawnDrop(pos: Position, move: Move): boolean {
  if (move.drop !== PAWN) return false;
  const next = applyMove(pos, move);
  if (!isInCheck(next, next.sideToMove)) return false;
  return hasNoLegalMoves(next);
}

export function legalMoves(pos: Position): Move[] {
  const side = pos.sideToMove;
  return pseudoLegalMoves(pos)
    .filter((move) => !isInCheck(applyMove(pos, move), side))
    .filter((move) => !isDisallowedPawnDrop(pos, move));
}

/** 手番側の合法手がゼロかどうか。詰み判定と「王手でない合法手ゼロも負け」の両方に使う（Task 8）。 */
export function hasNoLegalMoves(pos: Position): boolean {
  return legalMoves(pos).length === 0;
}
