import type { Position } from './position';
import { hasNoLegalMoves, isInCheck } from './rules';

export type GameEndResult = {
  type: 'checkmate' | 'no-legal-moves';
  winner: 'b' | 'w';
};

export function checkGameEnd(pos: Position): GameEndResult | null {
  if (!hasNoLegalMoves(pos)) return null;
  const loser = pos.sideToMove;
  const winner: 'b' | 'w' = loser === 'b' ? 'w' : 'b';
  const type = isInCheck(pos, loser) ? 'checkmate' : 'no-legal-moves';
  return { type, winner };
}
