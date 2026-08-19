import { describe, expect, it, vi } from 'vitest';
import { createEndGameModalElement } from './end-game-modal';

describe('createEndGameModalElement', () => {
  it('メッセージを表示する', () => {
    const el = createEndGameModalElement('あなたの かち！', vi.fn());
    expect(el.textContent).toContain('あなたの かち！');
  });

  it('「さいしょから」クリックで onRestart が呼ばれる', () => {
    const onRestart = vi.fn();
    const el = createEndGameModalElement('あなたの かち！', onRestart);
    el.querySelector<HTMLButtonElement>('button[data-action="restart"]')?.click();
    expect(onRestart).toHaveBeenCalled();
  });
});
