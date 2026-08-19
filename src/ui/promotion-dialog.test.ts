import { describe, expect, it } from 'vitest';
import { showPromotionDialog } from './promotion-dialog';

describe('showPromotionDialog', () => {
  it('「なる」をクリックすると true で解決する', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const promise = showPromotionDialog(container);
    container.querySelector<HTMLButtonElement>('button[data-choice="promote"]')?.click();
    await expect(promise).resolves.toBe(true);
  });

  it('「ならない」をクリックすると false で解決する', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const promise = showPromotionDialog(container);
    container.querySelector<HTMLButtonElement>('button[data-choice="decline"]')?.click();
    await expect(promise).resolves.toBe(false);
  });

  it('選択後はダイアログのDOM要素が取り除かれる', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const promise = showPromotionDialog(container);
    container.querySelector<HTMLButtonElement>('button[data-choice="promote"]')?.click();
    await promise;
    expect(container.querySelector('.promotion-dialog-overlay')).toBeNull();
  });
});
