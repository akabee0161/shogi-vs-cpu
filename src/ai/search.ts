import { applyMove } from '../core/apply-move';
import type { Move } from '../core/moves';
import type { Position } from '../core/position';
import { legalMoves } from '../core/rules';
import { PIECE_VALUES, evaluate } from './evaluate';

const MATE_SCORE = 100_000;

function pieceValue(pieceType: number): number {
  return PIECE_VALUES[pieceType] ?? 0;
}

function moveOrderScore(pos: Position, move: Move): number {
  const targetPiece = pos.board[move.to] ?? 0;
  if (targetPiece === 0) return 0;
  const victimValue = pieceValue(Math.abs(targetPiece));
  const aggressorType = move.drop ?? (move.from !== null ? Math.abs(pos.board[move.from] ?? 0) : 0);
  return victimValue * 100 - pieceValue(aggressorType);
}

export function orderMoves(pos: Position, moves: Move[]): Move[] {
  return [...moves].sort((a, b) => moveOrderScore(pos, b) - moveOrderScore(pos, a));
}

function negamax(pos: Position, depth: number, alpha: number, beta: number): number {
  const moves = legalMoves(pos);
  if (moves.length === 0) return -MATE_SCORE;
  if (depth === 0) return evaluate(pos);

  let value = Number.NEGATIVE_INFINITY;
  let localAlpha = alpha;
  for (const move of orderMoves(pos, moves)) {
    const score = -negamax(applyMove(pos, move), depth - 1, -beta, -localAlpha);
    if (score > value) value = score;
    if (value > localAlpha) localAlpha = value;
    if (localAlpha >= beta) break;
  }
  return value;
}

export function search(pos: Position, depth: number): { move: Move | null; score: number } {
  const moves = legalMoves(pos);
  if (moves.length === 0) return { move: null, score: -MATE_SCORE };

  let bestMove: Move | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let alpha = Number.NEGATIVE_INFINITY;
  const beta = Number.POSITIVE_INFINITY;

  for (const move of orderMoves(pos, moves)) {
    const score = -negamax(applyMove(pos, move), depth - 1, -beta, -alpha);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (bestScore > alpha) alpha = bestScore;
  }

  return { move: bestMove, score: bestScore };
}
