import type { Position } from '../core/position';
import { fileOf, rankOf, squareIndex } from '../core/square';

const RANK_KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const PIECE_NAMES: Record<number, string> = {
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

function squareLabel(square: number): string {
  const rankKanji = RANK_KANJI[rankOf(square) - 1];
  if (rankKanji === undefined) throw new Error(`invalid square: ${square}`);
  return `${fileOf(square)}${rankKanji}`;
}

export function squareAriaLabel(square: number, piece: number): string {
  const label = squareLabel(square);
  if (piece === 0) return label;
  const name = PIECE_NAMES[Math.abs(piece)];
  return name === undefined ? label : `${label} ${name}`;
}

function renderSquareContent(button: HTMLButtonElement, piece: number): void {
  button.textContent = '';
  if (piece === 0) return;
  const name = PIECE_NAMES[Math.abs(piece)];
  if (name === undefined) return;

  const span = document.createElement('span');
  span.className = 'piece';
  span.textContent = name;
  if (name.length >= 2) span.classList.add('piece-compact');
  if (piece < 0) span.classList.add('piece-gote');
  button.appendChild(span);
}

function updateSquareButton(button: HTMLButtonElement, square: number, piece: number): void {
  button.setAttribute('aria-label', squareAriaLabel(square, piece));
  renderSquareContent(button, piece);
}

export function createBoardElement(
  pos: Position,
  onSquareClick: (square: number) => void,
): HTMLElement {
  const boardEl = document.createElement('div');
  boardEl.className = 'board';

  for (let rank = 1; rank <= 9; rank++) {
    for (let file = 9; file >= 1; file--) {
      const square = squareIndex(file, rank);
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.square = String(square);
      updateSquareButton(button, square, pos.board[square] ?? 0);
      button.addEventListener('click', () => onSquareClick(square));
      boardEl.appendChild(button);
    }
  }

  return boardEl;
}

export function updateBoardElement(boardEl: HTMLElement, pos: Position): void {
  const buttons = boardEl.querySelectorAll<HTMLButtonElement>('button[data-square]');
  for (const button of buttons) {
    const square = Number(button.dataset.square);
    updateSquareButton(button, square, pos.board[square] ?? 0);
  }
}
