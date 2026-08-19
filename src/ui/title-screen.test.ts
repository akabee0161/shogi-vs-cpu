import { describe, expect, it, vi } from 'vitest';
import { createTitleScreenElement } from './title-screen';

describe('createTitleScreenElement', () => {
  it('デフォルトは先手・ふつうが選択されている', () => {
    const el = createTitleScreenElement(vi.fn());
    expect(el.querySelector('button[data-side="b"]')?.classList.contains('selected')).toBe(true);
    expect(
      el.querySelector('button[data-difficulty="normal"]')?.classList.contains('selected'),
    ).toBe(true);
  });

  it('先後・難易度を選び直せる', () => {
    const el = createTitleScreenElement(vi.fn());
    el.querySelector<HTMLButtonElement>('button[data-side="w"]')?.click();
    el.querySelector<HTMLButtonElement>('button[data-difficulty="strong"]')?.click();
    expect(el.querySelector('button[data-side="w"]')?.classList.contains('selected')).toBe(true);
    expect(el.querySelector('button[data-side="b"]')?.classList.contains('selected')).toBe(false);
    expect(
      el.querySelector('button[data-difficulty="strong"]')?.classList.contains('selected'),
    ).toBe(true);
  });

  it('スタートボタンで選択済みの内容が onStart に渡る', () => {
    const onStart = vi.fn();
    const el = createTitleScreenElement(onStart);
    el.querySelector<HTMLButtonElement>('button[data-side="w"]')?.click();
    el.querySelector<HTMLButtonElement>('button[data-difficulty="weak"]')?.click();
    el.querySelector<HTMLButtonElement>('button[data-action="start"]')?.click();
    expect(onStart).toHaveBeenCalledWith({ playerSide: 'w', difficulty: 'weak' });
  });
});
