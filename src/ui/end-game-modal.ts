export function createEndGameModalElement(message: string, onRestart: () => void): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'end-game-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'end-game-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  const text = document.createElement('p');
  text.textContent = message;

  const restartButton = document.createElement('button');
  restartButton.type = 'button';
  restartButton.dataset.action = 'restart';
  restartButton.textContent = 'さいしょから';
  restartButton.addEventListener('click', onRestart);

  modal.append(text, restartButton);
  overlay.appendChild(modal);

  // フォーカスをこのモーダル内に留める(キーボード操作で背景の盤面・操作ボタンへ
  // Tab移動できてしまう問題への対応。CodeRabbit review, end-game-modal.ts:19)。
  // 現状フォーカス可能な要素は restartButton のみなので、Tab/Shift+Tab を
  // 常にそこへ戻すだけで足りる。
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      restartButton.focus();
    }
  });
  queueMicrotask(() => restartButton.focus());

  return overlay;
}
