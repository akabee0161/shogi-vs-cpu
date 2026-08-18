import { describe, expect, it } from 'vitest';
import { initialPosition, parseSfen } from '../core/sfen';
import { evaluate } from './evaluate';

describe('evaluate', () => {
  it('平手初期局面は左右対称なので評価値0', () => {
    expect(evaluate(initialPosition())).toBe(0);
  });

  it('先手が飛車を得している局面は先手番から見てプラス', () => {
    const pos = parseSfen('4k4/9/9/9/9/9/9/9/3RK4 b - 1');
    expect(evaluate(pos)).toBeGreaterThan(0);
  });

  it('同じ駒得局面でも後手番から見るとマイナス(手番側視点)', () => {
    const pos = parseSfen('4k4/9/9/9/9/9/9/9/3RK4 w - 1');
    expect(evaluate(pos)).toBeLessThan(0);
  });

  it('持ち駒は盤上より高く評価される', () => {
    const onBoard = parseSfen('4k4/9/9/9/9/4P4/9/9/4K4 b - 1'); // 歩1枚が盤上
    const inHand = parseSfen('4k4/9/9/9/9/9/9/9/4K4 b P 1'); // 同じ歩1枚が持ち駒
    expect(evaluate(inHand)).toBeGreaterThan(evaluate(onBoard));
  });

  it('玉の周りに守り駒がある方が評価が高い', () => {
    const guarded = parseSfen('4k4/9/9/9/9/9/9/3GKG3/9 b - 1'); // 玉の両隣に金
    const unguarded = parseSfen('4k4/9/9/9/9/3G1G3/9/4K4/9 b - 1'); // 同じ金だが玉から離れている(2段離す)
    expect(evaluate(guarded)).toBeGreaterThan(evaluate(unguarded));
  });
});
