import { describe, expect, it } from 'vitest';
import { applyMove } from './apply-move';
import { PAWN, PROM_PAWN } from './piece';
import { parseSfen } from './sfen';
import { squareIndex } from './square';

describe('applyMove', () => {
  it('通常の移動で駒が動き、手番が反転しplyが進む', () => {
    const pos = parseSfen('9/9/9/9/4P4/9/9/9/9 b - 1');
    const next = applyMove(pos, { from: squareIndex(5, 5), to: squareIndex(5, 4), promote: false });
    expect(next.board[squareIndex(5, 5)]).toBe(0);
    expect(next.board[squareIndex(5, 4)]).toBe(PAWN);
    expect(next.sideToMove).toBe('w');
    expect(next.ply).toBe(2);
    expect(pos.board[squareIndex(5, 5)]).toBe(PAWN); // 元の局面は変更されない
  });

  it('駒を取ると持ち駒に加算される', () => {
    const pos = parseSfen('9/9/9/9/4p4/4P4/9/9/9 b - 1'); // 先手歩5六、後手歩5五
    const next = applyMove(pos, { from: squareIndex(5, 6), to: squareIndex(5, 5), promote: false });
    expect(next.hands[0][PAWN - 1]).toBe(1);
    expect(next.board[squareIndex(5, 5)]).toBe(PAWN);
  });

  it('成駒を取ると非成駒に戻って持ち駒に加算される', () => {
    const pos = parseSfen('9/9/9/9/4+p4/4P4/9/9/9 b - 1'); // 後手と金5五、先手歩5六
    const next = applyMove(pos, { from: squareIndex(5, 6), to: squareIndex(5, 5), promote: false });
    expect(next.hands[0][PAWN - 1]).toBe(1);
  });

  it('打つ手で持ち駒が減り盤上に駒が置かれる', () => {
    const pos = parseSfen('9/9/9/9/9/9/9/9/9 b P 1');
    const next = applyMove(pos, { from: null, to: squareIndex(5, 5), promote: false, drop: PAWN });
    expect(next.hands[0][PAWN - 1]).toBe(0);
    expect(next.board[squareIndex(5, 5)]).toBe(PAWN);
  });

  it('成る手で成駒になる', () => {
    const pos = parseSfen('9/9/9/4P4/9/9/9/9/9 b - 1'); // 歩5四
    const next = applyMove(pos, { from: squareIndex(5, 4), to: squareIndex(5, 3), promote: true });
    expect(next.board[squareIndex(5, 3)]).toBe(PROM_PAWN);
  });
});
