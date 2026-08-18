import type { Move } from './moves';
import type { Position } from './position';
import { fileOf, rankOf } from './square';

const USI_RANK_LETTERS = 'abcdefghi'; // rank1='a' 〜 rank9='i'
const USI_DROP_CHARS: Record<number, string> = {
  1: 'P',
  2: 'L',
  3: 'N',
  4: 'S',
  5: 'G',
  6: 'B',
  7: 'R',
};
const RANK_KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const PIECE_KANJI: Record<number, string> = {
  1: '歩',
  2: '香',
  3: '桂',
  4: '銀',
  5: '金',
  6: '角',
  7: '飛',
  8: '玉',
  9: 'と',
  10: '成香',
  11: '成桂',
  12: '成銀',
  13: '馬',
  14: '龍',
};

function squareToUsi(square: number): string {
  const letter = USI_RANK_LETTERS[rankOf(square) - 1];
  if (letter === undefined) throw new Error(`invalid square: ${square}`);
  return `${fileOf(square)}${letter}`;
}

export function moveToUsi(move: Move): string {
  if (move.drop !== undefined) {
    const char = USI_DROP_CHARS[move.drop];
    if (char === undefined) throw new Error(`invalid drop piece type: ${move.drop}`);
    return `${char}*${squareToUsi(move.to)}`;
  }
  if (move.from === null) throw new Error('invalid move: from is null but drop is undefined');
  const base = `${squareToUsi(move.from)}${squareToUsi(move.to)}`;
  return move.promote ? `${base}+` : base;
}

export function moveToKanji(move: Move, pos: Position, prevMove: Move | null): string {
  const mark = pos.sideToMove === 'b' ? '▲' : '△';

  let pieceType: number;
  if (move.drop !== undefined) {
    pieceType = move.drop;
  } else {
    if (move.from === null) throw new Error('invalid move: from is null but drop is undefined');
    pieceType = Math.abs(pos.board[move.from] ?? 0);
  }

  const rankKanji = RANK_KANJI[rankOf(move.to) - 1];
  if (rankKanji === undefined) throw new Error(`invalid square: ${move.to}`);
  const pieceName = PIECE_KANJI[pieceType];
  if (pieceName === undefined) throw new Error(`invalid piece type: ${pieceType}`);

  const isSameAsPrev = prevMove !== null && prevMove.to === move.to;
  const destination = isSameAsPrev ? '同' : `${fileOf(move.to)}${rankKanji}`;
  const suffix = move.drop !== undefined ? '打' : move.promote ? '成' : '';

  return `${mark}${destination}${pieceName}${suffix}`;
}
