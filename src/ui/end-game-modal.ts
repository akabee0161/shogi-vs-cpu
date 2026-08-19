export function createEndGameModalElement(message: string, onRestart: () => void): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'end-game-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'end-game-modal';

  const text = document.createElement('p');
  text.textContent = message;

  const restartButton = document.createElement('button');
  restartButton.type = 'button';
  restartButton.dataset.action = 'restart';
  restartButton.textContent = 'さいしょから';
  restartButton.addEventListener('click', onRestart);

  modal.append(text, restartButton);
  overlay.appendChild(modal);
  return overlay;
}
