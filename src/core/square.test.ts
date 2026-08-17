import { describe, expect, it } from 'vitest';
import { fileOf, rankOf, squareIndex } from './square';

describe('square', () => {
  it('9一 (file=9, rank=1) は index 0', () => {
    expect(squareIndex(9, 1)).toBe(0);
  });

  it('1一 (file=1, rank=1) は index 8', () => {
    expect(squareIndex(1, 1)).toBe(8);
  });

  it('9二 (file=9, rank=2) は index 9', () => {
    expect(squareIndex(9, 2)).toBe(9);
  });

  it('1九 (file=1, rank=9) は index 80', () => {
    expect(squareIndex(1, 9)).toBe(80);
  });

  it('7六 (file=7, rank=6) は index 47', () => {
    expect(squareIndex(7, 6)).toBe(47);
  });

  it('fileOf / rankOf は squareIndex の逆変換になる', () => {
    for (let file = 1; file <= 9; file++) {
      for (let rank = 1; rank <= 9; rank++) {
        const idx = squareIndex(file, rank);
        expect(fileOf(idx)).toBe(file);
        expect(rankOf(idx)).toBe(rank);
      }
    }
  });
});
