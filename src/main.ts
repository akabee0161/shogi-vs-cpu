import './ui/style.css';
import type { Difficulty } from './ai/difficulty';
import { createAppController } from './app/app-controller';
import type { AiClient } from './app/app-controller';
import { createGameState, currentPosition } from './app/game-state';
import type { GameState } from './app/game-state';
import { loadGame } from './app/save';
import type { Move } from './core/moves';
import { moveToKanji } from './core/record';
import { findKingSquare, isInCheck } from './core/rules';
import { createBoardController } from './ui/board-controller';
import { createControlsElement, setControlsEnabled } from './ui/controls';
import { createEndGameModalElement } from './ui/end-game-modal';
import { createHandsElement, updateHandsElement } from './ui/hands';
import { appendRecordEntry, clearRecordView, createRecordViewElement } from './ui/record-view';
import { createStatusElement, setStatusText } from './ui/status-view';
import { createTitleScreenElement } from './ui/title-screen';

// CodeRabbit review: Worker への複数リクエストが同時進行した場合、応答をrequestIdで
// 相関付けていないため取り違えうる、との指摘を把握した上で見送っている。この取り違えが
// 起こりうるのはCPU思考中に「まった/とうりょう/さいしょから」を押して2件目のリクエストが
// 発生する場合のみで、それらのボタンはCPU思考中は無効化しており(controls.ts の
// setControlsEnabled)、加えて app-controller.ts のバージョン番号チェックが古い応答を破棄
// するため、UI経由では2件目のリクエストが発生しない。requestId 方式のWorkerプロトコル
// 変更は相応の手間がかかる一方、現状は到達不能なため見送った。
function createAiClient(): AiClient {
  const worker = new Worker(new URL('./ai/worker.ts', import.meta.url), { type: 'module' });
  return {
    requestMove: (sfen, difficulty) =>
      new Promise((resolve) => {
        function handleMessage(event: MessageEvent<{ usiMove: string }>): void {
          worker.removeEventListener('message', handleMessage);
          resolve(event.data.usiMove);
        }
        worker.addEventListener('message', handleMessage);
        worker.postMessage({ sfen, difficulty });
      }),
  };
}

function endMessageFor(state: GameState): string {
  if (state.endResult === null) return '';
  if (state.endResult.type === 'repetition') return 'せんにちて（ひきわけ）';
  const playerWon = state.endResult.winner === state.playerSide;
  return playerWon ? 'あなたの かち！' : 'あなたの まけ...';
}

/** 再開可能な(対局中の)保存データがあればそれを、なければ新規対局を返す。終局済みの保存データは再開対象にしない。 */
function resolveInitialState(playerSide: 'b' | 'w', difficulty: Difficulty): GameState {
  const saved = loadGame();
  if (saved !== null && saved.status === 'playing') return saved;
  return createGameState(playerSide, difficulty);
}

function startGame(app: HTMLElement, playerSide: 'b' | 'w', difficulty: Difficulty): void {
  app.replaceChildren();

  const initialState = resolveInitialState(playerSide, difficulty);
  const aiClient = createAiClient();
  const statusEl = createStatusElement();
  const recordEl = createRecordViewElement();
  const senteHandsEl = createHandsElement(currentPosition(initialState), 'b', (pieceType) =>
    boardController.handlePieceTypeClick('b', pieceType),
  );
  const goteHandsEl = createHandsElement(currentPosition(initialState), 'w', (pieceType) =>
    boardController.handlePieceTypeClick('w', pieceType),
  );

  const controller = createAppController(initialState, aiClient, render);

  const boardController = createBoardController(currentPosition(initialState), (move) => {
    void controller.handlePlayerMove(move);
  });

  // 対局中の「さいしょから」も終局モーダルの「さいしょから」も、既存の対局を破棄して新規対局にする
  // controller.restart を使う。startGame を再実行しない理由: (1) 投了は SaveData に理由が残らず
  // 盤面だけからは検出できないため、startGame 経由で loadGame() を再度参照すると投了直後の対局が
  // 誤って再開されてしまう、(2) Worker や DOM を毎回作り直す無駄を避けるため。
  function restartGame(): void {
    void controller.restart(playerSide, difficulty);
  }

  const controlsEl = createControlsElement({
    onUndo: () => controller.undo(),
    onResign: () => controller.resign(),
    onRestart: restartGame,
  });

  let endGameModalEl: HTMLElement | null = null;

  function render(state: GameState): void {
    const pos = currentPosition(state);
    const lastMove = state.moveHistory[state.moveHistory.length - 1];
    const inCheck = isInCheck(pos, pos.sideToMove);
    const checkedKingSquare = inCheck
      ? (findKingSquare(pos, pos.sideToMove) ?? undefined)
      : undefined;

    const isCpuTurn = state.status === 'playing' && pos.sideToMove !== state.playerSide;

    boardController.setPosition(pos, { lastMove, checkedKingSquare });
    updateHandsElement(senteHandsEl, pos, 'b');
    updateHandsElement(goteHandsEl, pos, 'w');
    boardController.setInputEnabled(state.status === 'playing' && !isCpuTurn);
    // CPU思考中は まった/とうりょう/さいしょから を無効化する(理由は controls.ts 参照)。
    setControlsEnabled(controlsEl, !isCpuTurn);

    // 待った(undo)で手数が減ることもあるため、毎回きふ表示全体を組み直す。
    clearRecordView(recordEl);
    let prev: Move | null = null;
    for (let i = 0; i < state.moveHistory.length; i++) {
      const m = state.moveHistory[i];
      const p = state.history[i];
      if (m === undefined || p === undefined) continue;
      appendRecordEntry(recordEl, moveToKanji(m, p, prev));
      prev = m;
    }

    if (state.status === 'playing' && inCheck) {
      setStatusText(statusEl, '王手！');
    } else if (state.status === 'playing' && pos.sideToMove !== state.playerSide) {
      setStatusText(statusEl, 'かんがえちゅう');
    } else {
      setStatusText(statusEl, '');
    }

    endGameModalEl?.remove();
    endGameModalEl = null;
    if (state.status === 'ended') {
      endGameModalEl = createEndGameModalElement(endMessageFor(state), restartGame);
      app.appendChild(endGameModalEl);
    }
  }

  app.append(goteHandsEl, boardController.element, senteHandsEl, controlsEl, statusEl, recordEl);
  render(initialState);
}

function main(): void {
  const app = document.getElementById('app');
  if (app === null) throw new Error('#app element not found');

  const resumed = loadGame();
  if (resumed !== null && resumed.status === 'playing') {
    startGame(app, resumed.playerSide, resumed.difficulty);
    return;
  }

  app.appendChild(
    createTitleScreenElement(({ playerSide, difficulty }) =>
      startGame(app, playerSide, difficulty),
    ),
  );
}

main();
