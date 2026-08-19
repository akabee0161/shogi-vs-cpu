import { afterEach, describe, expect, it, vi } from 'vitest';
import { createControlsElement } from './controls';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createControlsElement', () => {
  it('「まった」クリックで onUndo が呼ばれる', () => {
    const onUndo = vi.fn();
    const el = createControlsElement({ onUndo, onResign: vi.fn(), onRestart: vi.fn() });
    el.querySelector<HTMLButtonElement>('button[data-action="undo"]')?.click();
    expect(onUndo).toHaveBeenCalled();
  });

  it('「さいしょから」クリックで onRestart が呼ばれる', () => {
    const onRestart = vi.fn();
    const el = createControlsElement({ onUndo: vi.fn(), onResign: vi.fn(), onRestart });
    el.querySelector<HTMLButtonElement>('button[data-action="restart"]')?.click();
    expect(onRestart).toHaveBeenCalled();
  });

  it('「とうりょう」クリックは確認ダイアログでOKした場合のみ onResign が呼ばれる', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onResign = vi.fn();
    const el = createControlsElement({ onUndo: vi.fn(), onResign, onRestart: vi.fn() });
    el.querySelector<HTMLButtonElement>('button[data-action="resign"]')?.click();
    expect(onResign).toHaveBeenCalled();
  });

  it('「とうりょう」クリックで確認ダイアログをキャンセルすると onResign は呼ばれない', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onResign = vi.fn();
    const el = createControlsElement({ onUndo: vi.fn(), onResign, onRestart: vi.fn() });
    el.querySelector<HTMLButtonElement>('button[data-action="resign"]')?.click();
    expect(onResign).not.toHaveBeenCalled();
  });
});
