import { describe, expect, it } from 'vitest';
import { checkRepetition } from './repetition';
import { isInCheck } from './rules';
import { parseSfen } from './sfen';

describe('checkRepetition', () => {
  it('同一局面が3回までは判定しない', () => {
    const pos = parseSfen('9/9/9/9/4K4/9/9/9/9 b - 1');
    expect(checkRepetition([pos, pos, pos])).toBeNull();
  });

  it('王手を伴わない同一局面が4回出現したら千日手(引き分け)', () => {
    const pos = parseSfen('9/9/9/9/4K4/9/9/9/9 b - 1');
    const result = checkRepetition([pos, pos, pos, pos]);
    expect(result).toEqual({ type: 'repetition', winner: null });
  });

  it('局面の同一性はplyを無視して判定する(盤面・手番・持ち駒が同じなら同一局面)', () => {
    const posPly1 = parseSfen('9/9/9/9/4K4/9/9/9/9 b - 1');
    const posPly9 = parseSfen('9/9/9/9/4K4/9/9/9/9 b - 9');
    const result = checkRepetition([posPly1, posPly9, posPly1, posPly9]);
    expect(result).toEqual({ type: 'repetition', winner: null });
  });

  it('区間内で常に王手がかかり続けている同一局面4回は連続王手の千日手(王手をかけ続けた側の負け)', () => {
    // 後手玉9一、先手角7三が斜めに9一を睨む(間の8二は空)。isInCheck(pos, 'w') は true になるはず。
    const checkedPos = parseSfen('k8/9/2B6/9/9/9/9/9/9 w - 1');
    expect(isInCheck(checkedPos, 'w')).toBe(true); // このテスト局面自体の前提を確認しておく

    const result = checkRepetition([checkedPos, checkedPos, checkedPos, checkedPos]);
    expect(result).toEqual({ type: 'perpetual-check', winner: 'w' }); // 王手をかけ続けた先手(b)が負け、王手され続けた後手(w)が勝ち
  });

  it('連続王手の千日手: 飛車が交互に筋を変えて王手をかけ続け、玉が毎回逃げるパターン', () => {
    // 実際の手番交代を伴う周期的な局面列（2手サイクル）
    // 注: この実装では lowercase = white pieces, UPPERCASE = black pieces
    // 黒玉を右下隅に配置して、メインの相互作用の影響を受けないようにする
    // Position A (indices 0, 2, 4, 6, 8, 10, 12, 14): 黒飛車a1、白玉a5、白手番、白王手
    const posA = parseSfen('R8/9/9/k8/9/9/9/9/8K w - 0');
    // Position B (indices 1, 3, 5, 7, 9, 11, 13, 15): 黒飛車a1、白玉b5、黒手番（玉逃げ、黒王手ではない）
    const posB = parseSfen('R8/9/9/1k7/9/9/9/9/8K b - 0');

    // 8サイクル分の履歴（A,B,A,B,A,B,A,B,A,B,A,B,A,B,A,B,A = 17局面）
    // A が indices 0, 2, 4, 6, 8, 10, 12, 14, 16 に出現（5回の繰り返し）
    // 最後の位置が posA（白手番、白王手）になるよう奇数個の要素を用意
    const history = [
      posA,
      posB,
      posA,
      posB,
      posA,
      posB,
      posA,
      posB,
      posA,
      posB,
      posA,
      posB,
      posA,
      posB,
      posA,
      posB,
      posA,
    ];

    const result = checkRepetition(history);
    // 王手をかけ続けた側(飛車を動かし続けた黒'R')が負け、王手され続けた側(白'w')が勝ち
    expect(result).toEqual({ type: 'perpetual-check', winner: 'w' });
  });
});
