import { HAND_PIECE_TYPES, promote } from './piece';
import { type Position, emptyPosition } from './position';
import { squareIndex } from './square';

const SFEN_CHARS: Record<number, string> = {
  1: 'P',
  2: 'L',
  3: 'N',
  4: 'S',
  5: 'G',
  6: 'B',
  7: 'R',
  8: 'K',
  9: '+P',
  10: '+L',
  11: '+N',
  12: '+S',
  13: '+B',
  14: '+R',
};
const CHAR_TO_TYPE: Record<string, number> = {
  P: 1,
  L: 2,
  N: 3,
  S: 4,
  G: 5,
  B: 6,
  R: 7,
  K: 8,
};

export function parseSfen(sfen: string): Position {
  const [boardPart, sideToMovePart, handsPart, plyPart] = sfen.split(' ');
  if (!boardPart || !sideToMovePart || !handsPart || !plyPart) {
    throw new Error(`invalid sfen: ${sfen}`);
  }

  const pos = emptyPosition();
  const ranks = boardPart.split('/');
  if (ranks.length !== 9) throw new Error(`invalid sfen board: ${boardPart}`);

  ranks.forEach((rankStr, rankIdx) => {
    const rank = rankIdx + 1;
    let file = 9;
    let i = 0;
    while (i < rankStr.length) {
      const ch = rankStr[i];
      if (ch === undefined) throw new Error(`invalid rank string at index ${i}`);
      if (ch >= '1' && ch <= '9') {
        file -= Number(ch);
        i += 1;
        continue;
      }
      let promoted = false;
      if (ch === '+') {
        promoted = true;
        i += 1;
      }
      const pieceChar = rankStr[i];
      if (pieceChar === undefined) throw new Error(`invalid piece char at index ${i}`);
      const upper = pieceChar.toUpperCase();
      const baseType = CHAR_TO_TYPE[upper];
      if (baseType === undefined) throw new Error(`invalid piece char: ${pieceChar}`);
      const pieceType = promoted ? promote(baseType) : baseType;
      const sign = pieceChar === upper ? 1 : -1;
      pos.board[squareIndex(file, rank)] = sign * pieceType;
      file -= 1;
      i += 1;
    }
  });

  pos.sideToMove = sideToMovePart === 'w' ? 'w' : 'b';

  if (handsPart !== '-') {
    let i = 0;
    while (i < handsPart.length) {
      let countStr = '';
      while (i < handsPart.length) {
        const ch = handsPart[i];
        if (ch === undefined) break;
        if (!(ch >= '0' && ch <= '9')) break;
        countStr += ch;
        i += 1;
      }
      const count = countStr === '' ? 1 : Number(countStr);
      const pieceChar = handsPart[i];
      if (pieceChar === undefined) throw new Error(`invalid hand piece char at index ${i}`);
      i += 1;
      const upper = pieceChar.toUpperCase();
      const baseType = CHAR_TO_TYPE[upper];
      if (baseType === undefined) throw new Error(`invalid hand piece char: ${pieceChar}`);
      const handIdx = pieceChar === upper ? 0 : 1;
      pos.hands[handIdx][baseType - 1] = count;
    }
  }

  pos.ply = Number(plyPart);
  return pos;
}

export function toSfen(pos: Position): string {
  const rankStrs: string[] = [];
  for (let rank = 1; rank <= 9; rank++) {
    let rankStr = '';
    let emptyRun = 0;
    for (let file = 9; file >= 1; file--) {
      const piece = pos.board[squareIndex(file, rank)];
      if (piece === undefined || piece === 0) {
        emptyRun += 1;
        continue;
      }
      if (emptyRun > 0) {
        rankStr += String(emptyRun);
        emptyRun = 0;
      }
      const pieceType = Math.abs(piece);
      const char = SFEN_CHARS[pieceType];
      if (char === undefined) throw new Error(`invalid piece type: ${pieceType}`);
      rankStr += piece > 0 ? char : char.toLowerCase();
    }
    if (emptyRun > 0) rankStr += String(emptyRun);
    rankStrs.push(rankStr);
  }

  let handsStr = '';
  // 先手(大文字)を先に、後手(小文字)を後に、共に歩香桂銀金角飛の順で列挙する
  for (const side of [0, 1] as const) {
    for (const pt of HAND_PIECE_TYPES) {
      const count = pos.hands[side][pt - 1];
      if (count === undefined || count === 0) continue;
      const char = SFEN_CHARS[pt];
      if (char === undefined) throw new Error(`invalid piece type: ${pt}`);
      handsStr += (count > 1 ? String(count) : '') + (side === 0 ? char : char.toLowerCase());
    }
  }
  if (handsStr === '') handsStr = '-';

  return `${rankStrs.join('/')} ${pos.sideToMove} ${handsStr} ${pos.ply}`;
}

export function initialPosition(): Position {
  return parseSfen('lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1');
}
