import { applyMove } from './apply-move';
import { pseudoLegalBoardMoves, pseudoLegalMoves } from './moves';
import { KING } from './piece';
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

/** 疑似合法手から、指した結果自玉が王手になる手を除去する。ピン・開き王手・合駒はすべてこの力任せな判定で自動的に処理される。 */
export function legalMoves(pos: Position): import('./moves').Move[] {
  const side = pos.sideToMove;
  return pseudoLegalMoves(pos).filter((move) => !isInCheck(applyMove(pos, move), side));
}
