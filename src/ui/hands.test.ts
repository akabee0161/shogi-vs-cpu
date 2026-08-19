import { describe, expect, it, vi } from 'vitest';
import { parseSfen } from '../core/sfen';
import { createHandsElement, updateHandsElement } from './hands';

describe('createHandsElement', () => {
  it('歩香桂銀金角飛の7種のボタンを生成する', () => {
    const pos = parseSfen('9/9/9/9/9/9/9/9/9 b - 1');
    const el = createHandsElement(pos, 'b', () => {});
    expect(el.querySelectorAll('button[data-piece-type]')).toHaveLength(7);
  });

  it('枚数0の駒はボタンを無効化する', () => {
    const pos = parseSfen('9/9/9/9/9/9/9/9/9 b P 1'); // 歩1枚のみ
    const el = createHandsElement(pos, 'b', () => {});
    const pawnButton = el.querySelector<HTMLButtonElement>('button[data-piece-type="1"]');
    const lanceButton = el.querySelector<HTMLButtonElement>('button[data-piece-type="2"]');
    expect(pawnButton?.disabled).toBe(false);
    expect(lanceButton?.disabled).toBe(true);
  });

  it('駒ボタンをクリックすると onPieceClick が駒種で呼ばれる', () => {
    const pos = parseSfen('9/9/9/9/9/9/9/9/9 b P 1');
    const onClick = vi.fn();
    const el = createHandsElement(pos, 'b', onClick);
    el.querySelector<HTMLButtonElement>('button[data-piece-type="1"]')?.click();
    expect(onClick).toHaveBeenCalledWith(1);
  });

  it('updateHandsElement で枚数表示が更新される', () => {
    const el = createHandsElement(parseSfen('9/9/9/9/9/9/9/9/9 b P 1'), 'b', () => {});
    updateHandsElement(el, parseSfen('9/9/9/9/9/9/9/9/9 b 2P 1'), 'b');
    const pawnButton = el.querySelector<HTMLButtonElement>('button[data-piece-type="1"]');
    expect(pawnButton?.querySelector('.hand-count')?.textContent).toBe('2');
  });
});
