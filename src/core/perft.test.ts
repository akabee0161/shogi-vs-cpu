import { describe, expect, it } from 'vitest';
import { perft } from './perft';
import { initialPosition } from './sfen';
import { parseSfen } from './sfen';

describe('perft (基本動作)', () => {
  it('depth 0 は常に1', () => {
    expect(perft(initialPosition(), 0)).toBe(1);
  });

  it('玉のみが盤中央にいる場合、depth 1 は8(8方向すべてに動ける)', () => {
    const pos = parseSfen('9/9/9/9/4K4/9/9/9/9 b - 1');
    expect(perft(pos, 1)).toBe(8);
  });

  it('玉のみが盤の隅(9一)にいる場合、depth 1 は3', () => {
    const pos = parseSfen('K8/9/9/9/9/9/9/9/9 b - 1');
    expect(perft(pos, 1)).toBe(3);
  });
});

describe('perft (平手初期局面, 既知値との照合)', () => {
  it('depth 1: 30手', () => {
    expect(perft(initialPosition(), 1)).toBe(30);
  });

  it('depth 2: 900手', () => {
    expect(perft(initialPosition(), 2)).toBe(900);
  });

  it('depth 3: 25470手', () => {
    expect(perft(initialPosition(), 3)).toBe(25470);
  });

  it('depth 4: 719731手', () => {
    expect(perft(initialPosition(), 4)).toBe(719731);
  });
});

describe.skip('perft (平手初期局面, depth 5 — ローカルで任意実行。時間がかかるためCIには含めない)', () => {
  it('depth 5: 19861490手', () => {
    expect(perft(initialPosition(), 5)).toBe(19861490);
  });
});
