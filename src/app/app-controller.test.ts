import { afterEach, describe, expect, it, vi } from 'vitest';
import { squareIndex } from '../core/square';
import { createAppController } from './app-controller';
import { createGameState } from './game-state';

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe('createAppController', () => {
  it('プレイヤーの手の後、CPU番なら自動的にAIの手が適用される', async () => {
    const state = createGameState('b', 'normal');
    const aiClient = { requestMove: vi.fn().mockResolvedValue('3c3d') };
    const controller = createAppController(state, aiClient, vi.fn());

    await controller.handlePlayerMove({
      from: squareIndex(7, 7),
      to: squareIndex(7, 6),
      promote: false,
    });

    expect(aiClient.requestMove).toHaveBeenCalled();
    expect(controller.getState().moveHistory).toHaveLength(2);
  });

  it('CPUの応手には最低思考時間(300ms)がかかる', async () => {
    vi.useFakeTimers();
    const state = createGameState('b', 'normal');
    const aiClient = { requestMove: vi.fn().mockResolvedValue('3c3d') };
    const controller = createAppController(state, aiClient, vi.fn());

    const movePromise = controller.handlePlayerMove({
      from: squareIndex(7, 7),
      to: squareIndex(7, 6),
      promote: false,
    });
    await vi.advanceTimersByTimeAsync(299);
    expect(controller.getState().moveHistory).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    await movePromise;
    expect(controller.getState().moveHistory).toHaveLength(2);
  });

  it('undo でプレイヤーの手番まで戻る(CPU応手後なら2手戻る)', async () => {
    const state = createGameState('b', 'normal');
    const aiClient = { requestMove: vi.fn().mockResolvedValue('3c3d') };
    const controller = createAppController(state, aiClient, vi.fn());
    await controller.handlePlayerMove({
      from: squareIndex(7, 7),
      to: squareIndex(7, 6),
      promote: false,
    });
    controller.undo();
    expect(controller.getState().moveHistory).toHaveLength(0);
    expect(controller.getState().status).toBe('playing');
  });

  it('CPU応答待ち中に resign すると、後から届くCPUの手は無視される', async () => {
    vi.useFakeTimers();
    const state = createGameState('b', 'normal');
    const aiClient = { requestMove: vi.fn().mockResolvedValue('3c3d') };
    const controller = createAppController(state, aiClient, vi.fn());

    const movePromise = controller.handlePlayerMove({
      from: squareIndex(7, 7),
      to: squareIndex(7, 6),
      promote: false,
    });
    controller.resign();
    await vi.advanceTimersByTimeAsync(300);
    await movePromise;

    expect(controller.getState().status).toBe('ended');
    expect(controller.getState().endResult).toEqual({ type: 'resign', winner: 'w' });
    expect(controller.getState().moveHistory).toHaveLength(1);
  });

  it('resign で対局が終了する', () => {
    const state = createGameState('b', 'normal');
    const controller = createAppController(state, { requestMove: vi.fn() }, vi.fn());
    controller.resign();
    expect(controller.getState().status).toBe('ended');
  });

  it('restart で新しい対局になり、後手選択ならCPU(先手)が自動的に指す', async () => {
    const state = createGameState('b', 'normal');
    const aiClient = { requestMove: vi.fn().mockResolvedValue('7g7f') };
    const controller = createAppController(state, aiClient, vi.fn());
    await controller.restart('w', 'weak');
    expect(controller.getState().moveHistory).toHaveLength(1);
    expect(controller.getState().playerSide).toBe('w');
  });

  it('状態変化のたびに localStorage に保存される', async () => {
    const state = createGameState('b', 'normal');
    const aiClient = { requestMove: vi.fn().mockResolvedValue('3c3d') };
    const controller = createAppController(state, aiClient, vi.fn());
    await controller.handlePlayerMove({
      from: squareIndex(7, 7),
      to: squareIndex(7, 6),
      promote: false,
    });
    expect(localStorage.getItem('shogi-vs-cpu:save')).not.toBeNull();
  });

  it('状態変化のたびに onStateChange が呼ばれる', async () => {
    const state = createGameState('b', 'normal');
    const aiClient = { requestMove: vi.fn().mockResolvedValue('3c3d') };
    const onStateChange = vi.fn();
    const controller = createAppController(state, aiClient, onStateChange);
    await controller.handlePlayerMove({
      from: squareIndex(7, 7),
      to: squareIndex(7, 6),
      promote: false,
    });
    expect(onStateChange).toHaveBeenCalled();
  });
});
