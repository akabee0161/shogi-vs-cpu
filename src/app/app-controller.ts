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
  // 初期状態がCPU番(後手選択での新規対局、CPU番のまま保存されたデータの再開)の場合に
  // 自動的に指させるための初期化Promise(CodeRabbit review, app-controller.ts:48-56)。
  ready: Promise<void>;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// CPU番でなくなるまで(=プレイヤーの手番に戻るまで)1手ずつ戻す。
// CPUの手だけを戻すと「プレイヤーは指せず、CPUの思考も再開しない」という
// 手詰まり状態になる(CodeRabbit review, app-controller.ts:67)ため。
function undoToPlayerTurn(state: GameState): GameState {
  let next = undoMove(state);
  while (
    next.history.length > 1 &&
    next.status === 'playing' &&
    currentPosition(next).sideToMove !== next.playerSide
  ) {
    next = undoMove(next);
  }
  return next;
}

export function createAppController(
  initialState: GameState,
  aiClient: AiClient,
  onStateChange: (state: GameState) => void,
): AppController {
  let state = initialState;
  // undo/resign/restart で状態が変わった後に古いCPU応答が届いても上書きしないためのバージョン番号。
  // (CodeRabbit review, app-controller.ts:56 / main.ts:30)
  let stateVersion = 0;

  function setState(newState: GameState): void {
    state = newState;
    stateVersion++;
    onStateChange(state);
    saveGame(state);
  }

  async function runCpuTurnIfNeeded(): Promise<void> {
    if (state.status === 'ended') return;
    if (currentPosition(state).sideToMove === state.playerSide) return;

    const requestedVersion = stateVersion;
    const sfen = toSfen(currentPosition(state));
    const [usiMove] = await Promise.all([
      aiClient.requestMove(sfen, state.difficulty),
      delay(MIN_THINKING_TIME_MS),
    ]);
    if (stateVersion !== requestedVersion) return;
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
    undo: () => setState(undoToPlayerTurn(state)),
    resign: () => setState(resignState(state)),
    restart: async (playerSide, difficulty) => {
      setState(createGameState(playerSide, difficulty));
      await runCpuTurnIfNeeded();
    },
    ready: runCpuTurnIfNeeded(),
  };
}
