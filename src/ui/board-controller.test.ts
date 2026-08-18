import { describe, expect, it, vi } from 'vitest';
import { parseSfen } from '../core/sfen';
import { squareIndex } from '../core/square';
import { createBoardController } from './board-controller';

function clickSquare(element: HTMLElement, square: number): void {
  element.querySelector<HTMLButtonElement>(`button[data-square="${square}"]`)?.click();
}

describe('createBoardController', () => {
  it('駒をクリックすると合法な移動先がハイライトされる', () => {
    const pos = parseSfen('9/9/9/9/4P4/9/9/9/4K4 b - 1');
    const controller = createBoardController(pos, vi.fn());
    document.body.appendChild(controller.element);
    clickSquare(controller.element, squareIndex(5, 5));
    const target = controller.element.querySelector(`button[data-square="${squareIndex(5, 4)}"]`);
    expect(target?.classList.contains('highlight')).toBe(true);
  });

  it('選択中の駒を再クリックすると選択解除される', () => {
    const pos = parseSfen('9/9/9/9/4P4/9/9/9/4K4 b - 1');
    const controller = createBoardController(pos, vi.fn());
    document.body.appendChild(controller.element);
    clickSquare(controller.element, squareIndex(5, 5));
    clickSquare(controller.element, squareIndex(5, 5));
    const target = controller.element.querySelector(`button[data-square="${squareIndex(5, 4)}"]`);
    expect(target?.classList.contains('highlight')).toBe(false);
  });

  it('合法な移動先をクリックすると onMove が呼ばれる(成りの選択肢がない場合)', () => {
    const pos = parseSfen('9/9/9/9/4P4/9/9/9/4K4 b - 1');
    const onMove = vi.fn();
    const controller = createBoardController(pos, onMove);
    document.body.appendChild(controller.element);
    clickSquare(controller.element, squareIndex(5, 5));
    clickSquare(controller.element, squareIndex(5, 4));
    expect(onMove).toHaveBeenCalledWith({
      from: squareIndex(5, 5),
      to: squareIndex(5, 4),
      promote: false,
    });
  });

  it('強制成りの手ではダイアログを出さず即座に onMove が呼ばれる', () => {
    const pos = parseSfen('9/4P4/9/9/9/9/9/9/4K4 b - 1');
    const onMove = vi.fn();
    const controller = createBoardController(pos, onMove);
    document.body.appendChild(controller.element);
    clickSquare(controller.element, squareIndex(5, 2));
    clickSquare(controller.element, squareIndex(5, 1));
    expect(onMove).toHaveBeenCalledWith({
      from: squareIndex(5, 2),
      to: squareIndex(5, 1),
      promote: true,
    });
  });

  it('成れる手(強制でない)ではダイアログが表示され、「なる」クリックで成りの手が確定する', async () => {
    const pos = parseSfen('9/9/9/4P4/9/9/9/9/4K4 b - 1');
    const onMove = vi.fn();
    const controller = createBoardController(pos, onMove);
    document.body.appendChild(controller.element);
    clickSquare(controller.element, squareIndex(5, 4));
    clickSquare(controller.element, squareIndex(5, 3));

    const promoteButton = document.querySelector<HTMLButtonElement>(
      'button[data-choice="promote"]',
    );
    expect(promoteButton).not.toBeNull();
    promoteButton?.click();
    await Promise.resolve();

    expect(onMove).toHaveBeenCalledWith({
      from: squareIndex(5, 4),
      to: squareIndex(5, 3),
      promote: true,
    });
  });

  it('setInputEnabled(false) の間はクリックしても反応しない', () => {
    const pos = parseSfen('9/9/9/9/4P4/9/9/9/4K4 b - 1');
    const controller = createBoardController(pos, vi.fn());
    document.body.appendChild(controller.element);
    controller.setInputEnabled(false);
    clickSquare(controller.element, squareIndex(5, 5));
    const target = controller.element.querySelector(`button[data-square="${squareIndex(5, 4)}"]`);
    expect(target?.classList.contains('highlight')).toBe(false);
  });
});
