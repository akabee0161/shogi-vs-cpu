import { describe, expect, it } from 'vitest';
import { pseudoLegalBoardMoves } from './moves';
import { parseSfen } from './sfen';
import { squareIndex } from './square';

function toSet(moves: { to: number; promote: boolean }[]) {
  return new Set(moves.map((m) => `${m.to}:${m.promote}`));
}

describe('pseudoLegalBoardMoves', () => {
  it('歩は1マス前にのみ進める', () => {
    const pos = parseSfen('9/9/9/9/4P4/9/9/9/9 b - 1');
    const moves = pseudoLegalBoardMoves(pos);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toEqual({ from: squareIndex(5, 5), to: squareIndex(5, 4), promote: false });
  });

  it('歩が敵陣(1〜3段目)に入るときは成り・不成りの両方を生成する', () => {
    const pos = parseSfen('9/9/9/4P4/9/9/9/9/9 b - 1');
    const moves = pseudoLegalBoardMoves(pos);
    expect(toSet(moves)).toEqual(
      new Set([`${squareIndex(5, 3)}:true`, `${squareIndex(5, 3)}:false`]),
    );
  });

  it('歩が1段目に進むときは強制成りで不成りは生成しない', () => {
    const pos = parseSfen('9/4P4/9/9/9/9/9/9/9 b - 1');
    const moves = pseudoLegalBoardMoves(pos);
    expect(moves).toEqual([{ from: squareIndex(5, 2), to: squareIndex(5, 1), promote: true }]);
  });

  it('桂は2マス前の左右にのみ進める(飛び越え可)', () => {
    const pos = parseSfen('9/9/9/9/4N4/9/9/9/9 b - 1');
    const moves = pseudoLegalBoardMoves(pos);
    expect(toSet(moves)).toEqual(
      new Set([`${squareIndex(6, 3)}:false`, `${squareIndex(4, 3)}:false`]),
    );
  });

  it('桂が1〜2段目に進むときは強制成り', () => {
    const pos = parseSfen('9/9/4N4/9/9/9/9/9/9 b - 1');
    const moves = pseudoLegalBoardMoves(pos);
    expect(toSet(moves)).toEqual(
      new Set([`${squareIndex(6, 1)}:true`, `${squareIndex(4, 1)}:true`]),
    );
  });

  it('銀は前と斜め4方向に進める(横・真後ろは不可)', () => {
    const pos = parseSfen('9/9/9/9/4S4/9/9/9/9 b - 1');
    const moves = pseudoLegalBoardMoves(pos);
    const dests = moves.map((m) => m.to).sort((a, b) => a - b);
    const expected = [
      squareIndex(5, 4),
      squareIndex(6, 4),
      squareIndex(4, 4),
      squareIndex(6, 6),
      squareIndex(4, 6),
    ].sort((a, b) => a - b);
    expect(dests).toEqual(expected);
  });

  it('金は前後左右と斜め前に進める(斜め後ろは不可)', () => {
    const pos = parseSfen('9/9/9/9/4G4/9/9/9/9 b - 1');
    const moves = pseudoLegalBoardMoves(pos);
    const dests = moves.map((m) => m.to).sort((a, b) => a - b);
    const expected = [
      squareIndex(5, 4),
      squareIndex(6, 4),
      squareIndex(4, 4),
      squareIndex(6, 5),
      squareIndex(4, 5),
      squareIndex(5, 6),
    ].sort((a, b) => a - b);
    expect(dests).toEqual(expected);
  });

  it('と金は金と同じ動きをする', () => {
    const posGold = parseSfen('9/9/9/9/4G4/9/9/9/9 b - 1');
    const posTokin = parseSfen('9/9/9/9/4+P4/9/9/9/9 b - 1');
    const goldDests = pseudoLegalBoardMoves(posGold)
      .map((m) => m.to)
      .sort((a, b) => a - b);
    const tokinDests = pseudoLegalBoardMoves(posTokin)
      .map((m) => m.to)
      .sort((a, b) => a - b);
    expect(tokinDests).toEqual(goldDests);
  });

  it('玉は8方向に1マス進める', () => {
    const pos = parseSfen('9/9/9/9/4K4/9/9/9/9 b - 1');
    const moves = pseudoLegalBoardMoves(pos);
    expect(moves).toHaveLength(8);
  });

  it('香は前方に何マスでも進み、味方の駒の手前で止まる', () => {
    const pos = parseSfen('9/9/9/9/4P4/9/9/9/4L4 b - 1'); // 自分の歩が5五、香が5九
    const moves = pseudoLegalBoardMoves(pos).filter((m) => m.from === squareIndex(5, 9));
    const dests = moves.map((m) => m.to).sort((a, b) => a - b);
    expect(dests).toEqual(
      [squareIndex(5, 8), squareIndex(5, 7), squareIndex(5, 6)].sort((a, b) => a - b),
    );
  });

  it('香は敵の駒があればそこまで進んで取り、その先には進めない', () => {
    const pos = parseSfen('9/9/9/9/4p4/9/9/9/4L4 b - 1'); // 敵の歩が5五、香が5九
    const moves = pseudoLegalBoardMoves(pos).filter((m) => m.from === squareIndex(5, 9));
    const dests = moves.map((m) => m.to).sort((a, b) => a - b);
    expect(dests).toEqual(
      [squareIndex(5, 8), squareIndex(5, 7), squareIndex(5, 6), squareIndex(5, 5)].sort(
        (a, b) => a - b,
      ),
    );
  });

  it('角は斜め4方向に何マスでも進む', () => {
    const pos = parseSfen('9/9/9/9/4B4/9/9/9/9 b - 1');
    const moves = pseudoLegalBoardMoves(pos);
    expect(moves).toHaveLength(4 + 4); // 各方向とも盤端まで4マス
  });

  it('飛は縦横4方向に何マスでも進む', () => {
    const pos = parseSfen('9/9/9/9/4R4/9/9/9/9 b - 1');
    const moves = pseudoLegalBoardMoves(pos);
    expect(moves).toHaveLength(8 + 8); // 縦8マス・横8マス
  });

  it('馬(角成)は角の動き+上下左右1マス', () => {
    const pos = parseSfen('9/9/9/9/4+B4/9/9/9/9 b - 1');
    const moves = pseudoLegalBoardMoves(pos);
    const dests = new Set(moves.map((m) => m.to));
    expect(dests.has(squareIndex(5, 4))).toBe(true); // 上
    expect(dests.has(squareIndex(6, 5))).toBe(true); // 横
  });

  it('龍(飛成)は飛の動き+斜め4方向1マス', () => {
    const pos = parseSfen('9/9/9/9/4+R4/9/9/9/9 b - 1');
    const moves = pseudoLegalBoardMoves(pos);
    const dests = new Set(moves.map((m) => m.to));
    expect(dests.has(squareIndex(6, 4))).toBe(true); // 斜め
  });

  it('後手の歩は下方向(段が増える方向)に進む', () => {
    const pos = parseSfen('9/9/9/9/4p4/9/9/9/9 w - 1');
    const moves = pseudoLegalBoardMoves(pos);
    expect(moves).toEqual([{ from: squareIndex(5, 5), to: squareIndex(5, 6), promote: false }]);
  });
});
