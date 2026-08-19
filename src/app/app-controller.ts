import type { Difficulty } from '../ai/difficulty';
import type { Move } from '../core/moves';
import { parseUsiMove } from '../core/record';
import { toSfen } from '../core/sfen';
import {
  applyMoveToState,
  createGameState,
  currentPosition,
  resign as resignState,
  undoMove,
} from './game-state';
import type { GameState } from './game-state';
import { saveGame } from './save';

const MIN_THINKING_TIME_MS = 300;

export type AiClient = {
  requestMove: (sfen: string, difficulty: Difficulty) => Promise<string>;
};

export type AppController = {
  getState: () => GameState;
  handlePlayerMove: (move: Move) => Promise<void>;
  undo: () => void;
  resign: () => void;
  restart: (playerSide: 'b' | 'w', difficulty: Difficulty) => Promise<void>;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createAppController(
  initialState: GameState,
  aiClient: AiClient,
  onStateChange: (state: GameState) => void,
): AppController {
  let state = initialState;

  function setState(newState: GameState): void {
    state = newState;
    onStateChange(state);
    saveGame(state);
  }

  async function runCpuTurnIfNeeded(): Promise<void> {
    if (state.status === 'ended') return;
    if (currentPosition(state).sideToMove === state.playerSide) return;

    const sfen = toSfen(currentPosition(state));
    const [usiMove] = await Promise.all([
      aiClient.requestMove(sfen, state.difficulty),
      delay(MIN_THINKING_TIME_MS),
    ]);
    const move = parseUsiMove(usiMove);
    setState(applyMoveToState(state, move));
  }

  async function handlePlayerMove(move: Move): Promise<void> {
    setState(applyMoveToState(state, move));
    await runCpuTurnIfNeeded();
  }

  return {
    getState: () => state,
    handlePlayerMove,
    undo: () => setState(undoMove(state)),
    resign: () => setState(resignState(state)),
    restart: async (playerSide, difficulty) => {
      setState(createGameState(playerSide, difficulty));
      await runCpuTurnIfNeeded();
    },
  };
}
