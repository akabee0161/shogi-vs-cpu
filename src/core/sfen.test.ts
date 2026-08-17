import { describe, expect, it } from 'vitest';
import { BISHOP, DRAGON, GOLD, PAWN } from './piece';
import { parseSfen, toSfen } from './sfen';
import { squareIndex } from './square';

const INITIAL_SFEN = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';

describe('sfen', () => {
  it('平手初期局面をラウンドトリップできる', () => {
    const pos = parseSfen(INITIAL_SFEN);
    expect(toSfen(pos)).toBe(INITIAL_SFEN);
  });

  it('9一に後手の香、1一に後手の香が立つ', () => {
    const pos = parseSfen(INITIAL_SFEN);
    expect(pos.board[squareIndex(9, 1)]).toBe(-2); // 香=2, 後手なので負
    expect(pos.board[squareIndex(1, 1)]).toBe(-2);
  });

  it('7七に後手の香(2二寄りの飛車位置ではなく実際の初期配置)ではなく、8八角・2二角が正しい位置に立つ', () => {
    const pos = parseSfen(INITIAL_SFEN);
    // 2段目 "1r5b1": file9=空, file8=飛(後手,負), file2=角(後手,負)
    expect(pos.board[squareIndex(8, 2)]).toBe(-7); // 飛
    expect(pos.board[squareIndex(2, 2)]).toBe(-6); // 角
    // 8段目 "1B5R1": file8=角(先手,正), file2=飛(先手,正)
    expect(pos.board[squareIndex(8, 8)]).toBe(BISHOP);
    expect(pos.board[squareIndex(2, 8)]).toBe(7); // 飛
  });

  it('sideToMove と ply を読み取る', () => {
    const pos = parseSfen(INITIAL_SFEN);
    expect(pos.sideToMove).toBe('b');
    expect(pos.ply).toBe(1);
  });

  it('持ち駒ありの局面をラウンドトリップできる（成駒・複数枚・両陣営）', () => {
    const sfen = '9/9/9/9/4k4/9/9/9/4K4 w 2P3gb 15';
    const pos = parseSfen(sfen);
    expect(pos.hands[0][PAWN - 1]).toBe(2); // 先手が歩を2枚
    expect(pos.hands[1][BISHOP - 1]).toBe(1); // 後手が角を1枚
    expect(pos.hands[1][GOLD - 1]).toBe(3); // 後手が金を3枚
    expect(toSfen(pos)).toBe(sfen);
  });

  it('成駒 (+記法) を含む局面をラウンドトリップできる', () => {
    const sfen = '4k4/9/9/9/9/9/9/9/4K3+R b - 1';
    const pos = parseSfen(sfen);
    expect(pos.board[squareIndex(1, 9)]).toBe(DRAGON);
    expect(toSfen(pos)).toBe(sfen);
  });
});
