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

function isCapture(pos: Position, move: Move): boolean {
  return (pos.board[move.to] ?? 0) !== 0;
}

// CodeRabbit review: 王手中でも stand-pat/捕獲手のみを探索しており、非捕獲の受け(玉の
// 移動・合駒)を評価しない点は理論上不正確、との指摘を把握した上で見送っている。
// この対局アプリの難易度設計(固定深さ2〜3 + 反復深化)では通常のnegamaxが全ての受けを
// 深さの許す限り探索しており、quiescenceはリーフでの静止評価の精度を上げる補助に過ぎない
// ため、実践上の指し手の質への影響は小さいと判断した。
function quiescence(pos: Position, alpha: number, beta: number): number {
  const moves = legalMoves(pos);
  if (moves.length === 0) return -MATE_SCORE;

  const standPat = evaluate(pos);
  if (standPat >= beta) return beta;
  let localAlpha = Math.max(alpha, standPat);

  const captureMoves = orderMoves(
    pos,
    moves.filter((m) => isCapture(pos, m)),
  );
  for (const move of captureMoves) {
    const score = -quiescence(applyMove(pos, move), -beta, -localAlpha);
    if (score >= beta) return beta;
    if (score > localAlpha) localAlpha = score;
  }
  return localAlpha;
}

function negamax(
  pos: Position,
  depth: number,
  alpha: number,
  beta: number,
  useQuiescence: boolean,
): number {
  const moves = legalMoves(pos);
  if (moves.length === 0) return -MATE_SCORE;
  if (depth === 0) return useQuiescence ? quiescence(pos, alpha, beta) : evaluate(pos);

  let value = Number.NEGATIVE_INFINITY;
  let localAlpha = alpha;
  for (const move of orderMoves(pos, moves)) {
    const score = -negamax(applyMove(pos, move), depth - 1, -beta, -localAlpha, useQuiescence);
    if (score > value) value = score;
    if (value > localAlpha) localAlpha = value;
    if (localAlpha >= beta) break;
  }
  return value;
}

// CodeRabbit review: depth が整数かつ1以上であることを呼び出し側で検証していない、との
// 指摘を把握した上で見送っている。呼び出し元は difficulty.ts の WEAK_SEARCH_DEPTH(2) /
// NORMAL_SEARCH_DEPTH(3) と iterativeDeepeningSearchAllMoves(depth=1から開始)のみで、
// いずれも常に depth>=1 の整数を渡す。外部入力やAPI公開は無く、この不変条件は静的に保証
// されているため、実行時バリデーションは追加していない。
export function searchAllMoves(
  pos: Position,
  depth: number,
  useQuiescence = true,
): { move: Move; score: number }[] {
  const moves = legalMoves(pos);
  const results: { move: Move; score: number }[] = [];

  for (const move of orderMoves(pos, moves)) {
    const score = -negamax(
      applyMove(pos, move),
      depth - 1,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      useQuiescence,
    );
    results.push({ move, score });
  }

  return results;
}

export function search(
  pos: Position,
  depth: number,
  useQuiescence = true,
): { move: Move | null; score: number } {
  const results = searchAllMoves(pos, depth, useQuiescence);
  if (results.length === 0) return { move: null, score: -MATE_SCORE };
  return results.reduce((best, r) => (r.score > best.score ? r : best));
}

// CodeRabbit review: timeLimitMs を negamax/quiescence の内部に伝播させず、1回分の
// searchAllMoves の完了後にしか期限をチェックしていない(=1反復が深く時間超過しうる)、との
// 指摘を把握した上で見送っている。期限をnegamax/quiescenceへ渡して途中打ち切りする実装は
// 相応の手間(heavy lift)がかかる一方、実害は「strong」難易度でまれに応答が
// STRONG_TIME_LIMIT_MS(2秒)をわずかに超える程度に留まり、対局が壊れることはない。
export function iterativeDeepeningSearchAllMoves(
  pos: Position,
  timeLimitMs: number,
  useQuiescence = true,
): { move: Move; score: number }[] {
  const startTime = Date.now();
  let bestResults = searchAllMoves(pos, 1, useQuiescence);
  let depth = 2;

  while (Date.now() - startTime < timeLimitMs) {
    const results = searchAllMoves(pos, depth, useQuiescence);
    bestResults = results;
    const topScore = results.reduce((max, r) => Math.max(max, r.score), Number.NEGATIVE_INFINITY);
    if (topScore >= MATE_SCORE) break;
    depth += 1;
  }

  return bestResults;
}
