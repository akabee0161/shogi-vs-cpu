import { describe, expect, it } from 'vitest';
import { PAWN } from './piece';
import { moveToKanji, moveToUsi } from './record';
import { parseSfen } from './sfen';
import { squareIndex } from './square';

describe('moveToUsi', () => {
  it('通常の移動を USI 形式にする(7七から7六)', () => {
    expect(moveToUsi({ from: squareIndex(7, 7), to: squareIndex(7, 6), promote: false })).toBe(
      '7g7f',
    );
  });

  it('成る手は末尾に + を付ける', () => {
    expect(moveToUsi({ from: squareIndex(2, 3), to: squareIndex(2, 2), promote: true })).toBe(
      '2c2b+',
    );
  });

  it('打つ手は 駒文字*マス 形式にする', () => {
    expect(moveToUsi({ from: null, to: squareIndex(5, 5), promote: false, drop: PAWN })).toBe(
      'P*5e',
    );
  });
});

describe('moveToKanji', () => {
  it('先手の通常の移動に▲を付ける', () => {
    const pos = parseSfen('9/9/9/9/9/9/2P6/9/9 b - 1'); // 先手歩7七
    const move = { from: squareIndex(7, 7), to: squareIndex(7, 6), promote: false };
    expect(moveToKanji(move, pos, null)).toBe('▲7六歩');
  });

  it('後手の通常の移動に△を付ける', () => {
    const pos = parseSfen('9/9/6p2/9/9/9/9/9/9 w - 1'); // 後手歩3三
    const move = { from: squareIndex(3, 3), to: squareIndex(3, 4), promote: false };
    expect(moveToKanji(move, pos, null)).toBe('△3四歩');
  });

  it('直前の指し手と移動先が同じなら「同」と表記する', () => {
    const pos = parseSfen('9/9/9/9/4p4/4P4/9/9/9 b - 1'); // 先手歩5六、後手歩5五
    const prevMove = { from: squareIndex(5, 3), to: squareIndex(5, 5), promote: false }; // 直前に後手が5五に指したと仮定
    const move = { from: squareIndex(5, 6), to: squareIndex(5, 5), promote: false };
    expect(moveToKanji(move, pos, prevMove)).toBe('▲同歩');
  });

  it('成る手には成を付ける', () => {
    const pos = parseSfen('9/1B7/9/9/9/9/9/9/9 b - 1'); // 先手角8二
    const move = { from: squareIndex(8, 2), to: squareIndex(9, 1), promote: true };
    expect(moveToKanji(move, pos, null)).toBe('▲9一角成');
  });

  it('打つ手には打を付ける', () => {
    const pos = parseSfen('9/9/9/9/9/9/9/9/9 b P 1');
    const move = { from: null, to: squareIndex(5, 5), promote: false, drop: PAWN };
    expect(moveToKanji(move, pos, null)).toBe('▲5五歩打');
  });
});
