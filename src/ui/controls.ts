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
