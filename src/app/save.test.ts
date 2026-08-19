import { afterEach, describe, expect, it } from 'vitest';
import { ROOK } from '../core/piece';
import { parseSfen } from '../core/sfen';
import { squareIndex } from '../core/square';
import { applyMoveToState, createGameState } from './game-state';
import { clearSave, loadGame, saveGame } from './save';

afterEach(() => {
  localStorage.clear();
});

describe('saveGame / loadGame', () => {
  it('保存前は null を返す', () => {
    expect(loadGame()).toBeNull();
  });

  it('保存した対局を復元できる(手順・難易度・先後を含む)', () => {
    let state = createGameState('w', 'strong');
    state = applyMoveToState(state, {
      from: squareIndex(7, 7),
      to: squareIndex(7, 6),
      promote: false,
    });
    saveGame(state);

    const loaded = loadGame();
    expect(loaded?.difficulty).toBe('strong');
    expect(loaded?.playerSide).toBe('w');
    expect(loaded?.moveHistory).toEqual(state.moveHistory);
    expect(loaded?.history).toHaveLength(2);
  });

  it('終局済みの対局を復元すると endResult が再構築される', () => {
    const state = createGameState('b', 'normal');
    // 後手玉9一、先手金8二(逃げ場を制圧)、先手持ち駒に飛車。飛車を9二に打てば詰み(Task 6/8と同じ局面)。
    const mateState = { ...state, history: [parseSfen('k8/1G7/9/9/9/9/9/9/9 b R 1')] };
    const afterMate = applyMoveToState(mateState, {
      from: null,
      to: squareIndex(9, 2),
      promote: false,
      drop: ROOK,
    });
    saveGame(afterMate);

    const loaded = loadGame();
    expect(loaded?.status).toBe('ended');
    expect(loaded?.endResult).toEqual({ type: 'checkmate', winner: 'b' });
  });

  it('壊れたJSONは null を返す', () => {
    localStorage.setItem('shogi-vs-cpu:save', '{not valid json');
    expect(loadGame()).toBeNull();
  });

  it('必須フィールドが欠けたデータは null を返す', () => {
    localStorage.setItem('shogi-vs-cpu:save', JSON.stringify({ moveHistory: [] }));
    expect(loadGame()).toBeNull();
  });

  it('不正な difficulty 値のデータは null を返す', () => {
    localStorage.setItem(
      'shogi-vs-cpu:save',
      JSON.stringify({ moveHistory: [], difficulty: 'invalid', playerSide: 'b' }),
    );
    expect(loadGame()).toBeNull();
  });

  it('clearSave で保存データが消える', () => {
    saveGame(createGameState('b', 'normal'));
    clearSave();
    expect(loadGame()).toBeNull();
  });
});
