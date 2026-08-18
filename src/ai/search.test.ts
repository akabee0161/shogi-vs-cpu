import { describe, expect, it } from 'vitest';
import { legalMoves } from '../core/rules';
import { ROOK } from '../core/piece';
import { parseSfen } from '../core/sfen';
import { squareIndex } from '../core/square';
import { orderMoves, search } from './search';

describe('search', () => {
  it('1手詰めを発見できる', () => {
    // 後手玉9一、先手金8二(逃げ場を制圧)、先手持ち駒に飛車。飛車を9二に打てば詰み。
    const pos = parseSfen('k8/1G7/9/9/9/9/9/9/4K4 b R 1');
    const result = search(pos, 1);
    expect(result.move).toEqual({ from: null, to: squareIndex(9, 2), promote: false, drop: ROOK });
  });

  it('タダで駒を取れる手があれば選ぶ', () => {
    // 後手玉5一、後手歩5三、先手金5二(歩を取れる)、先手玉5九
    // Note: The original brief SFEN has pieces at ranks 7-8, but the expected move targets ranks 2-3,
    // suggesting the SFEN should have pieces at ranks 2-3. Using corrected SFEN.
    const pos = parseSfen('4k4/4G4/4p4/9/9/9/9/9/4K4 b - 1');
    const result = search(pos, 2);
    expect(result.move).toEqual({ from: squareIndex(5, 2), to: squareIndex(5, 3), promote: false });
  });
});

describe('orderMoves', () => {
  it('価値の高い駒を取る手を先頭にする(MVV-LVA)', () => {
    // 先手銀5五、後手飛車6四(価値950)、後手歩4四(価値100)。どちらも銀で取れる。先手玉9九(遠方、無関係)
    const pos = parseSfen('9/9/9/3r1p3/4S4/9/9/9/K8 b - 1');
    const moves = legalMoves(pos).filter((m) => m.from === squareIndex(5, 5));
    const ordered = orderMoves(pos, moves);
    expect(ordered[0]).toEqual({ from: squareIndex(5, 5), to: squareIndex(6, 4), promote: false });
  });
});
