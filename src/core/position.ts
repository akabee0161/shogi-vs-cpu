export type Position = {
  board: Int8Array; // 81マス。0=空、正=先手、負=後手、絶対値が駒種コード
  hands: [Int8Array, Int8Array]; // [0]=先手, [1]=後手。各7要素: 歩香桂銀金角飛
  sideToMove: 'b' | 'w'; // b=先手, w=後手（SFEN と同じ表記）
  ply: number;
};

export function emptyPosition(): Position {
  return {
    board: new Int8Array(81),
    hands: [new Int8Array(7), new Int8Array(7)],
    sideToMove: 'b',
    ply: 1,
  };
}
