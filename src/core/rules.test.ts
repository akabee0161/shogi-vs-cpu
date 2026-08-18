import { describe, expect, it } from 'vitest';
import { GOLD } from './piece';
import { isInCheck, legalMoves } from './rules';
import { parseSfen } from './sfen';
import { squareIndex } from './square';

describe('isInCheck', () => {
  it('敵の飛車に同じ筋を睨まれていれば王手', () => {
    const pos = parseSfen('4r4/9/9/9/9/9/9/9/4K4 b - 1');
    expect(isInCheck(pos, 'b')).toBe(true);
  });

  it('筋がずれていれば王手ではない', () => {
    const pos = parseSfen('3r5/9/9/9/9/9/9/9/4K4 b - 1');
    expect(isInCheck(pos, 'b')).toBe(false);
  });
});

describe('legalMoves', () => {
  it('王手放置になる手(無関係な駒を動かす手)は除外される', () => {
    const pos = parseSfen('4r4/9/9/1G7/9/9/9/9/4K4 b - 1'); // 後手飛車5一、先手金8四(無関係)、先手玉5九
    const moves = legalMoves(pos);
    const kingMoves = moves.filter((m) => m.from === squareIndex(5, 9));
    const goldMoves = moves.filter((m) => m.from === squareIndex(8, 4));
    expect(kingMoves.length).toBeGreaterThan(0);
    expect(goldMoves).toHaveLength(0);
  });

  it('ピンされた駒は開き王手になる方向へ動けない(縦方向のみ許可)', () => {
    const pos = parseSfen('4r4/9/9/9/4G4/9/9/9/4K4 b - 1'); // 後手飛車5一、先手金5五(ピン)、先手玉5九
    const moves = legalMoves(pos);
    const dests = moves
      .filter((m) => m.from === squareIndex(5, 5))
      .map((m) => m.to)
      .sort((a, b) => a - b);
    expect(dests).toEqual([squareIndex(5, 4), squareIndex(5, 6)].sort((a, b) => a - b));
  });

  it('王手時は玉を動かす・王手駒との間に合駒するいずれかのみ合法', () => {
    const pos = parseSfen('4r4/9/9/9/9/9/9/9/4K4 b G 1'); // 後手飛車5一、先手玉5九、持ち駒に金
    const moves = legalMoves(pos);
    const kingMoves = moves.filter((m) => m.from === squareIndex(5, 9));
    const blockDrops = moves.filter((m) => m.drop === GOLD);
    expect(kingMoves.length).toBeGreaterThan(0);
    const blockDests = blockDrops.map((m) => m.to).sort((a, b) => a - b);
    const expectedBlocks = [2, 3, 4, 5, 6, 7, 8]
      .map((rank) => squareIndex(5, rank))
      .sort((a, b) => a - b);
    expect(blockDests).toEqual(expectedBlocks);
  });
});

import { applyMove } from './apply-move';
import { LANCE, PAWN } from './piece';
import { hasNoLegalMoves } from './rules';

describe('打ち歩詰め', () => {
  it('歩を打つと詰みになる場合、その歩打ちは非合法', () => {
    // 後手玉9一、先手は9二に歩を打つことで詰ます。詰みになるので禁止。
    const pos = parseSfen('k8/1S7/1G7/9/9/9/9/9/4K4 b P 1');
    const moves = legalMoves(pos);
    const pawnDropAt92 = moves.find((m) => m.drop === PAWN && m.to === squareIndex(9, 2));
    expect(pawnDropAt92).toBeUndefined();
  });

  it('打ち歩詰めになる手を実際に指すと相手はhasNoLegalMovesになる(判定の整合性確認)', () => {
    const pos = parseSfen('k8/1S7/1G7/9/9/9/9/9/4K4 b P 1');
    const next = applyMove(pos, { from: null, to: squareIndex(9, 2), promote: false, drop: PAWN });
    expect(hasNoLegalMoves(next)).toBe(true);
  });

  it('香を打って詰ます手は打ち歩詰めルールの対象外で合法', () => {
    const pos = parseSfen('k8/1S7/1G7/9/9/9/9/9/4K4 b L 1');
    const moves = legalMoves(pos);
    const lanceDropAt92 = moves.find((m) => m.drop === LANCE && m.to === squareIndex(9, 2));
    expect(lanceDropAt92).toBeDefined();
  });

  it('歩を打っても玉が逃げられるなら詰みではないので合法', () => {
    const pos = parseSfen('k8/9/9/9/9/9/9/9/4K4 b P 1'); // 玉の逃げ場を塞ぐ駒がない
    const moves = legalMoves(pos);
    const pawnDropAt92 = moves.find((m) => m.drop === PAWN && m.to === squareIndex(9, 2));
    expect(pawnDropAt92).toBeDefined();
  });
});
