import { applyMove } from './apply-move';
import type { Position } from './position';
import { legalMoves } from './rules';

// CodeRabbit review: depth が整数かつ0以上であることを検証していない、との指摘を把握した
// 上で見送っている(src/ai/search.ts の searchAllMoves と同一の指摘)。呼び出し元は
// perft.test.ts のみで、常に非負の整数リテラルを渡すため実行時バリデーションは追加していない。
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
