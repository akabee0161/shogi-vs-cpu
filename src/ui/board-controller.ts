import type { Move } from '../core/moves';
import type { Position } from '../core/position';
import { legalMoves } from '../core/rules';
import { createBoardElement, updateBoardElement } from './board';
import { showPromotionDialog } from './promotion-dialog';

export type BoardController = {
  element: HTMLElement;
  setPosition: (pos: Position, marks?: { lastMove?: Move; checkedKingSquare?: number }) => void;
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
  // 成りダイアログの表示中に setPosition が呼ばれた(=局面が別物になった)場合、
  // ダイアログ解決後に古い局面の手を onMove へ渡さないためのリビジョン番号。
  // (CodeRabbit review, board-controller.ts:65)
  let positionRevision = 0;

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
    const revisionAtOpen = positionRevision;
    const shouldPromote = await showPromotionDialog(element.parentElement ?? element);
    if (positionRevision !== revisionAtOpen) return;
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

    const current = selected;
    const candidates =
      current.kind === 'board'
        ? legalMoves(pos).filter((m) => m.from === current.square && m.to === square)
        : legalMoves(pos).filter((m) => m.drop === current.pieceType && m.to === square);

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
    setPosition: (newPos, marks) => {
      pos = newPos;
      positionRevision++;
      updateBoardElement(element, pos, marks);
      deselect();
    },
    setInputEnabled: (enabled) => {
      inputEnabled = enabled;
      if (!enabled) deselect();
    },
    handlePieceTypeClick,
  };
}
