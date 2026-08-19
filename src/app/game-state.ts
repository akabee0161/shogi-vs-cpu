import type { Difficulty } from '../ai/difficulty';
import { applyMove } from '../core/apply-move';
import { checkGameEnd } from '../core/game-end';
import type { Move } from '../core/moves';
import type { Position } from '../core/position';
import { checkRepetition } from '../core/repetition';
import { initialPosition } from '../core/sfen';

export type GameEndInfo = { type: string; winner: 'b' | 'w' | null };

export type GameState = {
  history: Position[];
  moveHistory: Move[];
  difficulty: Difficulty;
  playerSide: 'b' | 'w';
  status: 'playing' | 'ended';
  endResult: GameEndInfo | null;
};

export function createGameState(playerSide: 'b' | 'w', difficulty: Difficulty): GameState {
  return {
    history: [initialPosition()],
    moveHistory: [],
    difficulty,
    playerSide,
    status: 'playing',
    endResult: null,
  };
}

export function currentPosition(state: GameState): Position {
  const pos = state.history[state.history.length - 1];
  if (pos === undefined) throw new Error('game state history must not be empty');
  return pos;
}

export function applyMoveToState(state: GameState, move: Move): GameState {
  if (state.status === 'ended') throw new Error('game already ended');

  const next = applyMove(currentPosition(state), move);
  const history = [...state.history, next];
  const moveHistory = [...state.moveHistory, move];

  const gameEnd = checkGameEnd(next);
  const repetition = gameEnd === null ? checkRepetition(history) : null;

  let endResult: GameEndInfo | null = null;
  if (gameEnd !== null) {
    endResult = gameEnd;
  } else if (repetition !== null) {
    endResult = repetition;
  }

  return {
    ...state,
    history,
    moveHistory,
    status: endResult !== null ? 'ended' : 'playing',
    endResult,
  };
}

export function undoMove(state: GameState): GameState {
  if (state.history.length <= 1) return state;
  return {
    ...state,
    history: state.history.slice(0, -1),
    moveHistory: state.moveHistory.slice(0, -1),
    status: 'playing',
    endResult: null,
  };
}

export function resign(state: GameState): GameState {
  const winner: 'b' | 'w' = state.playerSide === 'b' ? 'w' : 'b';
  return { ...state, status: 'ended', endResult: { type: 'resign', winner } };
}
