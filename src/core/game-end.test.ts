import { describe, expect, it } from 'vitest';
import { applyMove } from './apply-move';
import { checkGameEnd } from './game-end';
import { LANCE } from './piece';
import { initialPosition, parseSfen } from './sfen';
import { squareIndex } from './square';

describe('checkGameEnd', () => {
  it('平手初期局面は終局していない', () => {
    expect(checkGameEnd(initialPosition())).toBeNull();
  });

  it('詰みの局面は checkmate と勝者を返す', () => {
    // 後手玉9一、先手金8二(逃げ場を制圧)。先手が香を9二に打つと詰み(打ち歩詰めルールの対象外なので合法)。
    const pos = parseSfen('k8/1S7/1G7/9/9/9/9/9/4K4 b L 1');
    const next = applyMove(pos, { from: null, to: squareIndex(9, 2), promote: false, drop: LANCE });
    expect(checkGameEnd(next)).toEqual({ type: 'checkmate', winner: 'b' });
  });
});
