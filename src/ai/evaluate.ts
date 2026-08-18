import {
  BISHOP,
  DRAGON,
  GOLD,
  HAND_PIECE_TYPES,
  HORSE,
  KING,
  KNIGHT,
  LANCE,
  PAWN,
  PROM_KNIGHT,
  PROM_LANCE,
  PROM_PAWN,
  PROM_SILVER,
  ROOK,
  SILVER,
} from '../core/piece';
import type { Position } from '../core/position';
import { fileOf, rankOf, squareIndex } from '../core/square';

export const PIECE_VALUES: Record<number, number> = {
  [PAWN]: 100,
  [LANCE]: 300,
  [KNIGHT]: 320,
  [SILVER]: 520,
  [GOLD]: 600,
  [BISHOP]: 800,
  [ROOK]: 950,
  [KING]: 0,
  [PROM_PAWN]: 600,
  [PROM_LANCE]: 600,
  [PROM_KNIGHT]: 600,
  [PROM_SILVER]: 600,
  [HORSE]: 1000,
  [DRAGON]: 1100,
};

const HAND_BONUS_MULTIPLIER = 1.1;
const KING_SHIELD_BONUS = 30;

function pieceValue(pieceType: number): number {
  return PIECE_VALUES[pieceType] ?? 0;
}

function materialScore(pos: Position): number {
  let score = 0;
  for (let i = 0; i < 81; i++) {
    const piece = pos.board[i];
    if (piece === 0) continue;
    const value = pieceValue(Math.abs(piece));
    score += piece > 0 ? value : -value;
  }
  return score;
}

function handScore(pos: Position): number {
  let score = 0;
  for (const pieceType of HAND_PIECE_TYPES) {
    const value = pieceValue(pieceType) * HAND_BONUS_MULTIPLIER;
    score += pos.hands[0][pieceType - 1] * value;
    score -= pos.hands[1][pieceType - 1] * value;
  }
  return score;
}

function findKingSquare(pos: Position, side: 'b' | 'w'): number | null {
  const target = side === 'b' ? KING : -KING;
  for (let i = 0; i < 81; i++) {
    if (pos.board[i] === target) return i;
  }
  return null;
}

function kingShieldScoreForSide(pos: Position, side: 'b' | 'w'): number {
  const kingSquare = findKingSquare(pos, side);
  if (kingSquare === null) return 0;

  const file = fileOf(kingSquare);
  const rank = rankOf(kingSquare);
  let count = 0;
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const f = file + df;
      const r = rank + dr;
      if (f < 1 || f > 9 || r < 1 || r > 9) continue;
      const piece = pos.board[squareIndex(f, r)];
      const isOwn = piece !== 0 && (side === 'b' ? piece > 0 : piece < 0);
      if (isOwn) count += 1;
    }
  }
  return count * KING_SHIELD_BONUS;
}

function kingShieldScore(pos: Position): number {
  return kingShieldScoreForSide(pos, 'b') - kingShieldScoreForSide(pos, 'w');
}

export function evaluate(pos: Position): number {
  const absoluteScore = materialScore(pos) + handScore(pos) + kingShieldScore(pos);
  return pos.sideToMove === 'b' ? absoluteScore : -absoluteScore;
}
