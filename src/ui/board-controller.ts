import type { Move } from '../core/moves';
import type { Position } from '../core/position';
import { legalMoves } from '../core/rules';
import { createBoardElement, updateBoardElement } from './board';
import { showPromotionDialog } from './promotion-dialog';

export type BoardController = {
  element: HTMLElement;
  setPosition: (pos: Position) => void;
  setInputEnabled: (enabled: boolean) => void;
  handlePieceTypeClick: (side: 'b' | 'w', pieceType: number) => void;
};

type Selection = { kind: 'board'; square: number } | { kind: 'hand'; pieceType: number };

export function createBoardController(
  initialPos: Position,
  onMove: (move: Move) => void,
): BoardController {
  let pos = initialPos;
  let selected: Selection | null = null;
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

  function selectBoardSquare(square: number, moves: Move[]): void {
    selected = { kind: 'board', square };
    clearHighlights();
    highlightSquares(moves.map((m) => m.to));
  }

  function deselect(): void {
    selected = null;
    clearHighlights();
  }

  async function resolveCandidate(candidates: Move[]): Promise<void> {
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

  async function handleSquareClick(square: number): Promise<void> {
    if (!inputEnabled) return;

    if (selected?.kind === 'board' && selected.square === square) {
      deselect();
      return;
    }

    const ownMovesFromSquare = legalMoves(pos).filter((m) => m.from === square);

    if (selected === null) {
      if (ownMovesFromSquare.length === 0) return;
      selectBoardSquare(square, ownMovesFromSquare);
      return;
    }

    let candidates: Move[];
    if (selected !== null && selected.kind === 'board') {
      const boardSelection = selected as { kind: 'board'; square: number };
      candidates = legalMoves(pos).filter(
        (m) => m.from === boardSelection.square && m.to === square,
      );
    } else if (selected !== null && selected.kind === 'hand') {
      const handSelection = selected as { kind: 'hand'; pieceType: number };
      candidates = legalMoves(pos).filter(
        (m) => m.drop === handSelection.pieceType && m.to === square,
      );
    } else {
      candidates = [];
    }

    if (candidates.length === 0) {
      if (ownMovesFromSquare.length > 0) {
        selectBoardSquare(square, ownMovesFromSquare);
      } else {
        deselect();
      }
      return;
    }

    deselect();
    await resolveCandidate(candidates);
  }

  function handlePieceTypeClick(side: 'b' | 'w', pieceType: number): void {
    if (!inputEnabled) return;
    if (side !== pos.sideToMove) return;

    if (selected?.kind === 'hand' && selected.pieceType === pieceType) {
      deselect();
      return;
    }

    const moves = legalMoves(pos).filter((m) => m.drop === pieceType);
    if (moves.length === 0) return;

    selected = { kind: 'hand', pieceType };
    clearHighlights();
    highlightSquares(moves.map((m) => m.to));
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
    handlePieceTypeClick,
  };
}
