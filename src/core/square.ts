/** file: 筋 (1〜9), rank: 段 (1〜9) から盤index (0〜80) を求める。index 0 は 9一。 */
export function squareIndex(file: number, rank: number): number {
  return (rank - 1) * 9 + (9 - file);
}

export function fileOf(square: number): number {
  return 9 - (square % 9);
}

export function rankOf(square: number): number {
  return Math.floor(square / 9) + 1;
}
