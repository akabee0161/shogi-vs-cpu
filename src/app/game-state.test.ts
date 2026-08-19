import { describe, expect, it } from 'vitest';
import { ROOK } from '../core/piece';
import { parseSfen } from '../core/sfen';
import { squareIndex } from '../core/square';
import { applyMoveToState, createGameState, currentPosition, resign, undoMove } from './game-state';

describe('game-state', () => {
  it('createGameState は平手初期局面から開始する', () => {
    const state = createGameState('b', 'normal');
    expect(state.status).toBe('playing');
    expect(state.history).toHaveLength(1);
    expect(state.endResult).toBeNull();
  });

  it('applyMoveToState で局面が進む', () => {
    const state = createGameState('b', 'normal');
    const move = { from: squareIndex(7, 7), to: squareIndex(7, 6), promote: false };
    const next = applyMoveToState(state, move);
    expect(next.history).toHaveLength(2);
    expect(next.moveHistory).toEqual([move]);
    expect(next.status).toBe('playing');
  });

  it('詰みになる手を適用すると status が ended になり勝者が記録される', () => {
    let state = createGameState('b', 'normal');
    state = { ...state, history: [parseSfen('k8/1G7/9/9/9/9/9/9/9 b R 1')] };
    const move = { from: null, to: squareIndex(9, 2), promote: false, drop: ROOK };
    const next = applyMoveToState(state, move);
    expect(next.status).toBe('ended');
    expect(next.endResult).toEqual({ type: 'checkmate', winner: 'b' });
  });

  it('undoMove で1手戻る', () => {
    const state = createGameState('b', 'normal');
    const move = { from: squareIndex(7, 7), to: squareIndex(7, 6), promote: false };
    const afterMove = applyMoveToState(state, move);
    const undone = undoMove(afterMove);
    expect(undone.history).toHaveLength(1);
    expect(undone.moveHistory).toHaveLength(0);
  });

  it('undoMove は初期局面より前には戻らない', () => {
    const state = createGameState('b', 'normal');
    expect(undoMove(state)).toEqual(state);
  });

  it('resign で投了側の相手が勝者になる', () => {
    const state = createGameState('b', 'normal'); // プレイヤーは先手
    const resigned = resign(state);
    expect(resigned.status).toBe('ended');
    expect(resigned.endResult).toEqual({ type: 'resign', winner: 'w' });
  });

  it('currentPosition は履歴の最後の局面を返す', () => {
    const state = createGameState('b', 'normal');
    expect(currentPosition(state)).toBe(state.history[state.history.length - 1]);
  });
});
