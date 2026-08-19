export type ControlsHandlers = {
  onUndo: () => void;
  onResign: () => void;
  onRestart: () => void;
};

export function createControlsElement(handlers: ControlsHandlers): HTMLElement {
  const el = document.createElement('div');
  el.className = 'controls';

  const undoButton = document.createElement('button');
  undoButton.type = 'button';
  undoButton.dataset.action = 'undo';
  undoButton.textContent = 'まった';
  undoButton.addEventListener('click', handlers.onUndo);

  const resignButton = document.createElement('button');
  resignButton.type = 'button';
  resignButton.dataset.action = 'resign';
  resignButton.textContent = 'とうりょう';
  resignButton.addEventListener('click', () => {
    if (window.confirm('とうりょうしますか？')) handlers.onResign();
  });

  const restartButton = document.createElement('button');
  restartButton.type = 'button';
  restartButton.dataset.action = 'restart';
  restartButton.textContent = 'さいしょから';
  restartButton.addEventListener('click', handlers.onRestart);

  el.append(undoButton, resignButton, restartButton);
  return el;
}

// CPU思考中はこれらのボタンを無効化する。有効なままだと、CPUの応答が届く前に
// まった/とうりょう/さいしょから を押して局面を変えられてしまい、後から届く
// (すでに古くなった)CPUの手が新しい局面に誤って適用されうる。
// (CodeRabbit review, app-controller.ts:56 / main.ts:30)
export function setControlsEnabled(el: HTMLElement, enabled: boolean): void {
  for (const button of el.querySelectorAll<HTMLButtonElement>('button')) {
    button.disabled = !enabled;
  }
}
