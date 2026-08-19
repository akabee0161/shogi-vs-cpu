import { describe, expect, it } from 'vitest';
import { applyMove } from '../core/apply-move';
import { moveToUsi } from '../core/record';
import { hasNoLegalMoves, legalMoves } from '../core/rules';
import { parseSfen } from '../core/sfen';
import { handleWorkerRequest } from './worker-protocol';

// 後手玉9一、先手桂8四、先手玉1九(局面成立に必要)、先手持ち駒に金1枚。
// このプロジェクトのルールでは王手でなくても合法手ゼロなら負けのため(Task 8)、
// 勝ち手は「王手放置にならず、指した結果相手の合法手がゼロになる手」として計算する。
const MATE_IN_ONE_SFEN = 'k8/9/9/1N7/9/9/9/9/8K b G 1';

function winningUsiMoves(sfen: string): string[] {
  const pos = parseSfen(sfen);
  return legalMoves(pos)
    .filter((m) => hasNoLegalMoves(applyMove(pos, m)))
    .map(moveToUsi);
}

describe('handleWorkerRequest (AI回帰テスト)', () => {
  it.each([['weak'], ['normal'], ['strong']] as const)(
    '難易度 %s でも1手で勝てる手をUSI形式で返す',
    (difficulty) => {
      const response = handleWorkerRequest({ sfen: MATE_IN_ONE_SFEN, difficulty }, () => 0.9);
      expect(winningUsiMoves(MATE_IN_ONE_SFEN)).toContain(response.usiMove);
    },
  );

  it('駒をタダで捨てない(静止探索が壊れていないことの回帰確認)', () => {
    const pos = 'k8/9/3gp4/5S3/9/9/9/9/K8 b - 1';
    const response = handleWorkerRequest({ sfen: pos, difficulty: 'normal' }, () => 0.5);
    expect(response.usiMove).not.toBe('4d5c'); // 銀4四から歩5三を取る損な交換を選ばない
  });
});
