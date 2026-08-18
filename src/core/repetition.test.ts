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
});
