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

  it('成りダイアログ表示中に setPosition が呼ばれた場合、ダイアログ解決後も onMove は呼ばれない', async () => {
    const pos = parseSfen('9/9/9/4P4/9/9/9/9/4K4 b - 1');
    const onMove = vi.fn();
    const controller = createBoardController(pos, onMove);
    document.body.appendChild(controller.element);
    clickSquare(controller.element, squareIndex(5, 4));
    clickSquare(controller.element, squareIndex(5, 3));

    controller.setPosition(pos);

    const promoteButton = document.querySelector<HTMLButtonElement>(
      'button[data-choice="promote"]',
    );
    expect(promoteButton).not.toBeNull();
    promoteButton?.click();
    await Promise.resolve();

    expect(onMove).not.toHaveBeenCalled();
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

import { GOLD } from '../core/piece';

describe('createBoardController (持ち駒)', () => {
  it('持ち駒をクリックすると打てるマスがハイライトされる', () => {
    const pos = parseSfen('9/9/9/9/9/9/9/9/4K4 b G 1');
    const controller = createBoardController(pos, vi.fn());
    document.body.appendChild(controller.element);
    controller.handlePieceTypeClick('b', GOLD);
    const target = controller.element.querySelector(`button[data-square="${squareIndex(5, 5)}"]`);
    expect(target?.classList.contains('highlight')).toBe(true);
  });

  it('持ち駒を選んでマスをクリックすると打つ手で onMove が呼ばれる', () => {
    const pos = parseSfen('9/9/9/9/9/9/9/9/4K4 b G 1');
    const onMove = vi.fn();
    const controller = createBoardController(pos, onMove);
    document.body.appendChild(controller.element);
    controller.handlePieceTypeClick('b', GOLD);
    clickSquare(controller.element, squareIndex(5, 5));
    expect(onMove).toHaveBeenCalledWith({
      from: null,
      to: squareIndex(5, 5),
      promote: false,
      drop: GOLD,
    });
  });

  it('相手の手番の持ち駒をクリックしても反応しない', () => {
    const pos = parseSfen('9/9/9/9/9/9/9/9/9 b - 1'); // 手番は先手(b)
    const controller = createBoardController(pos, vi.fn());
    document.body.appendChild(controller.element);
    // 後手('w')の持ち駒クリックを試みても、手番でないため無視される
    controller.handlePieceTypeClick('w', GOLD);
    const target = controller.element.querySelector(`button[data-square="${squareIndex(5, 5)}"]`);
    expect(target?.classList.contains('highlight')).toBe(false);
  });
});
