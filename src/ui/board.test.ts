import { describe, expect, it, vi } from 'vitest';
import { parseSfen } from '../core/sfen';
import { squareIndex } from '../core/square';
import { createBoardElement, squareAriaLabel, updateBoardElement } from './board';

describe('squareAriaLabel', () => {
  it('駒がなければマス名のみ', () => {
    expect(squareAriaLabel(squareIndex(7, 6), 0)).toBe('7六');
  });

  it('駒があればマス名+持ち主+駒名(先手)', () => {
    expect(squareAriaLabel(squareIndex(7, 6), 1)).toBe('7六 先手 歩'); // 先手歩(正の値)
  });

  it('駒があればマス名+持ち主+駒名(後手)', () => {
    expect(squareAriaLabel(squareIndex(3, 4), -1)).toBe('3四 後手 歩'); // 後手歩(負の値)
  });
});

describe('createBoardElement', () => {
  it('81個のマスボタンを生成する', () => {
    const el = createBoardElement(parseSfen('9/9/9/9/9/9/9/9/9 b - 1'), () => {});
    expect(el.querySelectorAll('button[data-square]')).toHaveLength(81);
  });

  it('先手の駒には piece-gote クラスを付けない、後手の駒には付ける', () => {
    const pos = parseSfen('4p4/9/9/9/9/9/9/9/4P4 b - 1'); // 後手歩5一, 先手歩5九
    const el = createBoardElement(pos, () => {});
    const goteButton = el.querySelector(`button[data-square="${squareIndex(5, 1)}"]`);
    const senteButton = el.querySelector(`button[data-square="${squareIndex(5, 9)}"]`);
    expect(goteButton?.querySelector('.piece')?.classList.contains('piece-gote')).toBe(true);
    expect(senteButton?.querySelector('.piece')?.classList.contains('piece-gote')).toBe(false);
  });

  it('成香・成桂・成銀は piece-compact クラスを付ける(縦2文字縮小表示)', () => {
    const pos = parseSfen('9/9/9/9/4+L4/9/9/9/9 b - 1'); // 成香5五
    const el = createBoardElement(pos, () => {});
    const button = el.querySelector(`button[data-square="${squareIndex(5, 5)}"]`);
    expect(button?.querySelector('.piece')?.textContent).toBe('成香');
    expect(button?.querySelector('.piece')?.classList.contains('piece-compact')).toBe(true);
  });

  it('と金は「と」の1文字で piece-compact は付けない', () => {
    const pos = parseSfen('9/9/9/9/4+P4/9/9/9/9 b - 1');
    const el = createBoardElement(pos, () => {});
    const button = el.querySelector(`button[data-square="${squareIndex(5, 5)}"]`);
    expect(button?.querySelector('.piece')?.textContent).toBe('と');
    expect(button?.querySelector('.piece')?.classList.contains('piece-compact')).toBe(false);
  });

  it('マスをクリックすると onSquareClick がそのマス番号で呼ばれる', () => {
    const onClick = vi.fn();
    const el = createBoardElement(parseSfen('9/9/9/9/9/9/9/9/9 b - 1'), onClick);
    const button = el.querySelector<HTMLButtonElement>(
      `button[data-square="${squareIndex(7, 6)}"]`,
    );
    button?.click();
    expect(onClick).toHaveBeenCalledWith(squareIndex(7, 6));
  });
});

describe('updateBoardElement', () => {
  it('局面を更新すると表示内容が変わる', () => {
    const el = createBoardElement(parseSfen('9/9/9/9/9/9/9/9/9 b - 1'), () => {});
    updateBoardElement(el, parseSfen('9/9/9/9/4P4/9/9/9/9 b - 1'));
    const button = el.querySelector(`button[data-square="${squareIndex(5, 5)}"]`);
    expect(button?.querySelector('.piece')?.textContent).toBe('歩');
  });
});

describe('updateBoardElement (最終手・王手の表示)', () => {
  it('lastMove を渡すと移動元・移動先に last-move クラスが付く', () => {
    const el = createBoardElement(parseSfen('9/9/9/9/4P4/9/9/9/9 b - 1'), () => {});
    const lastMove = { from: squareIndex(5, 6), to: squareIndex(5, 5), promote: false };
    updateBoardElement(el, parseSfen('9/9/9/9/4P4/9/9/9/9 b - 1'), { lastMove });
    expect(
      el
        .querySelector(`button[data-square="${squareIndex(5, 6)}"]`)
        ?.classList.contains('last-move'),
    ).toBe(true);
    expect(
      el
        .querySelector(`button[data-square="${squareIndex(5, 5)}"]`)
        ?.classList.contains('last-move'),
    ).toBe(true);
  });

  it('checkedKingSquare を渡すとそのマスに checked-king クラスが付く', () => {
    const pos = parseSfen('4k4/9/9/9/9/9/9/9/4K4 b - 1');
    const el = createBoardElement(pos, () => {});
    updateBoardElement(el, pos, { checkedKingSquare: squareIndex(5, 1) });
    expect(
      el
        .querySelector(`button[data-square="${squareIndex(5, 1)}"]`)
        ?.classList.contains('checked-king'),
    ).toBe(true);
  });

  it('オプションを渡さない更新では前回のマークが消える', () => {
    const pos = parseSfen('9/9/9/9/4P4/9/9/9/9 b - 1');
    const el = createBoardElement(pos, () => {});
    updateBoardElement(el, pos, {
      lastMove: { from: squareIndex(5, 6), to: squareIndex(5, 5), promote: false },
    });
    updateBoardElement(el, pos);
    expect(
      el
        .querySelector(`button[data-square="${squareIndex(5, 5)}"]`)
        ?.classList.contains('last-move'),
    ).toBe(false);
  });
});
