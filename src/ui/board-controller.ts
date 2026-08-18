import type { Move } from '../core/moves';
import type { Position } from '../core/position';
import { legalMoves } from '../core/rules';
import { createBoardElement, updateBoardElement } from './board';
import { showPromotionDialog } from './promotion-dialog';

export type BoardController = {
  element: HTMLElement;
  setPosition: (pos: Position) => void;
  setInputEnabled: (enabled: boolean) => void;
};

export function createBoardController(
  initialPos: Position,
  onMove: (move: Move) => void,
): BoardController {
  let pos = initialPos;
  let selectedSquare: number | null = null;
  let inputEnabled = true;

  const element = createBoardElement(pos, (square) => {
    void handleSquareClick(square);
  });

  function clearHighlights(): void {
    for (const button of element.querySelectorAll('button.highlight')) {
      button.classList.remove('highlight');
    }
  }

  function highlightSquares(squares: number[]): void {
    for (const square of squares) {
      element.querySelector(`button[data-square="${square}"]`)?.classList.add('highlight');
    }
  }

  function selectSquare(square: number, moves: Move[]): void {
    selectedSquare = square;
    clearHighlights();
    highlightSquares(moves.map((m) => m.to));
  }

  function deselect(): void {
    selectedSquare = null;
    clearHighlights();
  }

  async function handleSquareClick(square: number): Promise<void> {
    if (!inputEnabled) return;

    if (selectedSquare === square) {
      deselect();
      return;
    }

    const ownMovesFromSquare = legalMoves(pos).filter((m) => m.from === square);

    if (selectedSquare === null) {
      if (ownMovesFromSquare.length === 0) return;
      selectSquare(square, ownMovesFromSquare);
      return;
    }

    const candidates = legalMoves(pos).filter((m) => m.from === selectedSquare && m.to === square);

    if (candidates.length === 0) {
      if (ownMovesFromSquare.length > 0) {
        selectSquare(square, ownMovesFromSquare);
      } else {
        deselect();
      }
      return;
    }

    deselect();

    if (candidates.length === 1) {
      const only = candidates[0];
      if (only === undefined) throw new Error('unreachable');
      onMove(only);
      return;
    }

    const promoteMove = candidates.find((m) => m.promote);
    const declineMove = candidates.find((m) => !m.promote);
    if (promoteMove === undefined || declineMove === undefined) {
      throw new Error('expected both promote and non-promote candidates');
    }
    const shouldPromote = await showPromotionDialog(element.parentElement ?? element);
    onMove(shouldPromote ? promoteMove : declineMove);
  }

  return {
    element,
    setPosition: (newPos) => {
      pos = newPos;
      updateBoardElement(element, pos);
      deselect();
    },
    setInputEnabled: (enabled) => {
      inputEnabled = enabled;
      if (!enabled) deselect();
    },
  };
}
