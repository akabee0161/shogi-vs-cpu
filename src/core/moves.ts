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
  canPromote,
} from './piece';
import type { Position } from './position';
import { fileOf, rankOf, squareIndex } from './square';

export type Move = {
  from: number | null; // null = 打ち
  to: number;
  promote: boolean;
  drop?: number; // 打つ駒種（PieceType）
};

type Vector = readonly [number, number]; // [dfile, drank]（先手視点）

const GOLD_LIKE_VECTORS: Vector[] = [
  [0, -1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
];
const SILVER_VECTORS: Vector[] = [
  [0, -1],
  [1, -1],
  [-1, -1],
  [1, 1],
  [-1, 1],
];
const KNIGHT_VECTORS: Vector[] = [
  [1, -2],
  [-1, -2],
];
const PAWN_VECTORS: Vector[] = [[0, -1]];
const KING_VECTORS: Vector[] = [
  [0, -1],
  [0, 1],
  [1, 0],
  [-1, 0],
  [1, -1],
  [-1, -1],
  [1, 1],
  [-1, 1],
];
const BISHOP_DIRS: Vector[] = [
  [1, -1],
  [-1, -1],
  [1, 1],
  [-1, 1],
];
const ROOK_DIRS: Vector[] = [
  [0, -1],
  [0, 1],
  [1, 0],
  [-1, 0],
];

/** 1マスだけ進む駒の方向（馬・龍は「スライドしない側」の1マス方向も含む）。 */
const STEP_VECTORS: Partial<Record<number, Vector[]>> = {
  [PAWN]: PAWN_VECTORS,
  [KNIGHT]: KNIGHT_VECTORS,
  [SILVER]: SILVER_VECTORS,
  [GOLD]: GOLD_LIKE_VECTORS,
  [PROM_PAWN]: GOLD_LIKE_VECTORS,
  [PROM_LANCE]: GOLD_LIKE_VECTORS,
  [PROM_KNIGHT]: GOLD_LIKE_VECTORS,
  [PROM_SILVER]: GOLD_LIKE_VECTORS,
  [KING]: KING_VECTORS,
  [HORSE]: ROOK_DIRS,
  [DRAGON]: BISHOP_DIRS,
};

/** 盤端または駒にぶつかるまで進み続ける駒の方向。 */
const SLIDE_DIRS: Partial<Record<number, Vector[]>> = {
  [LANCE]: [[0, -1]],
  [BISHOP]: BISHOP_DIRS,
  [ROOK]: ROOK_DIRS,
  [HORSE]: BISHOP_DIRS,
  [DRAGON]: ROOK_DIRS,
};

function isInPromotionZone(rank: number, side: 'b' | 'w'): boolean {
  return side === 'b' ? rank <= 3 : rank >= 7;
}

function mustPromote(pieceType: number, toRank: number, side: 'b' | 'w'): boolean {
  const lastRank = side === 'b' ? 1 : 9;
  const secondLastRank = side === 'b' ? 2 : 8;
  if ((pieceType === PAWN || pieceType === LANCE) && toRank === lastRank) return true;
  if (pieceType === KNIGHT && (toRank === lastRank || toRank === secondLastRank)) return true;
  return false;
}

/**
 * 移動先が盤内かつ味方の駒がなければ手を追加する。戻り値 true はスライドをここで止めるべき合図。
 *
 * CodeRabbit review: 相手玉を捕獲する手を legalMoves から明示的に除外していない、との
 * 指摘を把握した上で見送っている。legalMoves の自玉王手フィルタにより、
 * 「相手玉が捕獲可能な局面」は必ず直前の着手側にとっての詰み(hasNoLegalMoves)と一致し、
 * game-state.ts の applyMoveToState が着手のたびに checkGameEnd を呼んで対局を終了させる
 * ため、実際のゲーム進行(および同じ不変条件の上に成り立つ探索の再帰)では到達しない
 * (perft depth4 の既知値一致、Task12 Ruling10 で実証済み)。
 */
function addMoveIfValid(
  pos: Position,
  moves: Move[],
  pieceType: number,
  from: number,
  toFile: number,
  toRank: number,
  sign: number,
): boolean {
  if (toFile < 1 || toFile > 9 || toRank < 1 || toRank > 9) return true;
  const to = squareIndex(toFile, toRank);
  const target = pos.board[to] ?? 0;
  const isOwnTarget = target !== 0 && (sign > 0 ? target > 0 : target < 0);
  if (isOwnTarget) return true;

  const side: 'b' | 'w' = sign > 0 ? 'b' : 'w';
  const forced = mustPromote(pieceType, toRank, side);
  const eligible =
    canPromote(pieceType) &&
    (isInPromotionZone(toRank, side) || isInPromotionZone(rankOf(from), side));

  if (eligible) {
    moves.push({ from, to, promote: true });
    if (!forced) moves.push({ from, to, promote: false });
  } else {
    moves.push({ from, to, promote: false });
  }

  return target !== 0; // 敵駒を取ったらここでスライド終了
}

export function pseudoLegalBoardMoves(pos: Position): Move[] {
  const moves: Move[] = [];
  const sign = pos.sideToMove === 'b' ? 1 : -1;

  for (let from = 0; from < 81; from++) {
    const piece = pos.board[from] ?? 0;
    if (piece === 0) continue;
    const isOwn = sign > 0 ? piece > 0 : piece < 0;
    if (!isOwn) continue;

    const pieceType = Math.abs(piece);
    const fromFile = fileOf(from);
    const fromRank = rankOf(from);

    const steps = STEP_VECTORS[pieceType];
    if (steps) {
      for (const [dfile, drank] of steps) {
        addMoveIfValid(
          pos,
          moves,
          pieceType,
          from,
          fromFile + dfile * sign,
          fromRank + drank * sign,
          sign,
        );
      }
    }

    const slides = SLIDE_DIRS[pieceType];
    if (slides) {
      for (const [dfile, drank] of slides) {
        let toFile = fromFile + dfile * sign;
        let toRank = fromRank + drank * sign;
        while (toFile >= 1 && toFile <= 9 && toRank >= 1 && toRank <= 9) {
          const target = pos.board[squareIndex(toFile, toRank)] ?? 0;
          const stop = addMoveIfValid(pos, moves, pieceType, from, toFile, toRank, sign);
          if (stop || target !== 0) break;
          toFile += dfile * sign;
          toRank += drank * sign;
        }
      }
    }
  }

  return moves;
}

function hasPawnOnFile(pos: Position, file: number, side: 'b' | 'w'): boolean {
  const targetPiece = side === 'b' ? PAWN : -PAWN;
  for (let rank = 1; rank <= 9; rank++) {
    if (pos.board[squareIndex(file, rank)] === targetPiece) return true;
  }
  return false;
}

export function pseudoLegalDropMoves(pos: Position): Move[] {
  const moves: Move[] = [];
  const side = pos.sideToMove;
  const handIdx = side === 'b' ? 0 : 1;
  const hand = pos.hands[handIdx];

  for (const pieceType of HAND_PIECE_TYPES) {
    if (hand[pieceType - 1] === 0) continue;

    for (let to = 0; to < 81; to++) {
      if (pos.board[to] !== 0) continue;
      const toFile = fileOf(to);
      const toRank = rankOf(to);

      if (mustPromote(pieceType, toRank, side)) continue;
      if (pieceType === PAWN && hasPawnOnFile(pos, toFile, side)) continue;

      moves.push({ from: null, to, promote: false, drop: pieceType });
    }
  }

  return moves;
}

export function pseudoLegalMoves(pos: Position): Move[] {
  return [...pseudoLegalBoardMoves(pos), ...pseudoLegalDropMoves(pos)];
}
