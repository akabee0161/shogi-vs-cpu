import { applyMove } from './apply-move';
import type { Position } from './position';
import { legalMoves } from './rules';

export function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  const moves = legalMoves(pos);
  if (depth === 1) return moves.length;

  let count = 0;
  for (const move of moves) {
    count += perft(applyMove(pos, move), depth - 1);
  }
  return count;
}
