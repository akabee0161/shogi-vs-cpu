import { HAND_PIECE_TYPES } from '../core/piece';
import type { Position } from '../core/position';

const PIECE_NAMES: Record<number, string> = {
  1: '歩',
  2: '香',
  3: '桂',
  4: '銀',
  5: '金',
  6: '角',
  7: '飛',
};

function handIndex(side: 'b' | 'w'): 0 | 1 {
  return side === 'b' ? 0 : 1;
}

function updateHandButton(button: HTMLButtonElement, pieceType: number, count: number): void {
  button.textContent = '';
  const name = PIECE_NAMES[pieceType] ?? '';

  const pieceSpan = document.createElement('span');
  pieceSpan.className = 'piece';
  pieceSpan.textContent = name;

  const countSpan = document.createElement('span');
  countSpan.className = 'hand-count';
  countSpan.textContent = count > 1 ? String(count) : '';

  button.append(pieceSpan, countSpan);
  button.disabled = count === 0;
  button.setAttribute('aria-label', `持ち駒 ${name} ${count}枚`);
}

export function createHandsElement(
  pos: Position,
  side: 'b' | 'w',
  onPieceClick: (pieceType: number) => void,
): HTMLElement {
  const el = document.createElement('div');
  el.className = 'hands';
  el.dataset.side = side;

  for (const pieceType of HAND_PIECE_TYPES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.pieceType = String(pieceType);
    updateHandButton(button, pieceType, pos.hands[handIndex(side)][pieceType - 1] ?? 0);
    button.addEventListener('click', () => onPieceClick(pieceType));
    el.appendChild(button);
  }

  return el;
}

export function updateHandsElement(handsEl: HTMLElement, pos: Position, side: 'b' | 'w'): void {
  const buttons = handsEl.querySelectorAll<HTMLButtonElement>('button[data-piece-type]');
  for (const button of buttons) {
    const pieceType = Number(button.dataset.pieceType);
    updateHandButton(button, pieceType, pos.hands[handIndex(side)][pieceType - 1] ?? 0);
  }
}
