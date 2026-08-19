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

  it('role=dialog / aria-modal=true を持つ', () => {
    const el = createEndGameModalElement('あなたの かち！', vi.fn());
    const modal = el.querySelector('.end-game-modal');
    expect(modal?.getAttribute('role')).toBe('dialog');
    expect(modal?.getAttribute('aria-modal')).toBe('true');
  });

  it('表示すると「さいしょから」ボタンへ初期フォーカスする', async () => {
    document.body.replaceChildren();
    const el = createEndGameModalElement('あなたの かち！', vi.fn());
    document.body.appendChild(el);
    await Promise.resolve();
    expect(document.activeElement).toBe(
      el.querySelector<HTMLButtonElement>('button[data-action="restart"]'),
    );
  });

  it('Tab キーは背景へ移動させず「さいしょから」ボタンへフォーカスを留める', () => {
    document.body.replaceChildren();
    const el = createEndGameModalElement('あなたの かち！', vi.fn());
    document.body.appendChild(el);
    const restartButton = el.querySelector<HTMLButtonElement>('button[data-action="restart"]');
    restartButton?.blur();
    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    el.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(restartButton);
  });
});
