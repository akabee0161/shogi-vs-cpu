export function showPromotionDialog(container: HTMLElement): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'promotion-dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'promotion-dialog';

    const promoteButton = document.createElement('button');
    promoteButton.type = 'button';
    promoteButton.dataset.choice = 'promote';
    promoteButton.textContent = 'なる';
    promoteButton.addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });

    const declineButton = document.createElement('button');
    declineButton.type = 'button';
    declineButton.dataset.choice = 'decline';
    declineButton.textContent = 'ならない';
    declineButton.addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });

    dialog.append(promoteButton, declineButton);
    overlay.appendChild(dialog);
    container.appendChild(overlay);
  });
}
