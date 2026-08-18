import { describe, expect, it } from 'vitest';
import { KNIGHT, ROOK } from '../core/piece';
import { legalMoves } from '../core/rules';
import { parseSfen } from '../core/sfen';
import { squareIndex } from '../core/square';
import { iterativeDeepeningSearchAllMoves, orderMoves, search, searchAllMoves } from './search';

describe('search', () => {
  it('1手詰めを発見できる', () => {
    // 後手玉9一、先手金8二(逃げ場を制圧)、後手桂8一(2解ある詰みを一意にするブロッカー)、先手玉5九(遠方、無関係)、先手持ち駒に飛車。飛車を9二に打てば詰み。
    const pos = parseSfen('kN7/1G7/9/9/9/9/9/9/4K4 b R 1');
    const result = search(pos, 1);
    expect(result.move).toEqual({ from: null, to: squareIndex(9, 2), promote: false, drop: ROOK });
  });

  it('タダで駒を取れる手があれば選ぶ', () => {
    // 後手玉5一、後手歩5七、先手金5八(歩を取れる)、先手玉5九
    const pos = parseSfen('4k4/9/9/9/9/9/4p4/4G4/4K4 b - 1');
    const result = search(pos, 2);
    expect(result.move).toEqual({ from: squareIndex(5, 8), to: squareIndex(5, 7), promote: false });
  });
});

describe('orderMoves', () => {
  it('価値の高い駒を取る手を先頭にする(MVV-LVA)', () => {
    // 先手銀5五、後手飛車6四(価値950)、後手歩4四(価値100)。どちらも銀で取れる。先手玉9九(遠方、無関係)
    const pos = parseSfen('9/9/9/3r1p3/4S4/9/9/9/K8 b - 1');
    const moves = legalMoves(pos).filter((m) => m.from === squareIndex(5, 5));
    const ordered = orderMoves(pos, moves);
    expect(ordered[0]).toEqual({ from: squareIndex(5, 5), to: squareIndex(6, 4), promote: false });
  });
});

describe('search (静止探索)', () => {
  it('駒交換で損する手(タダ捨てに近い)を深さ1でも避ける', () => {
    // 先手銀4四、後手歩5三、後手金6三(歩を守っている)、深さ1では静止探索なしだと銀で歩を取ってしまう
    const pos = parseSfen('8k/9/3gp4/5S3/9/9/9/9/K8 b - 1');
    const result = search(pos, 1);
    expect(result.move).not.toEqual({
      from: squareIndex(4, 4),
      to: squareIndex(5, 3),
      promote: true,
    });
  });

  it('useQuiescence=false では取り返しを読まず駒交換で損する手を選んでしまう(回帰確認用)', () => {
    const pos = parseSfen('8k/9/3gp4/5S3/9/9/9/9/K8 b - 1');
    const result = search(pos, 1, false);
    expect(result.move).toEqual({ from: squareIndex(4, 4), to: squareIndex(5, 3), promote: true });
  });

  it('1手詰めは静止探索を有効にしても引き続き発見できる(回帰確認)', () => {
    const pos = parseSfen('kN7/1G7/9/9/9/9/9/9/4K4 b R 1');
    const result = search(pos, 1);
    expect(result.move).toEqual({ from: null, to: squareIndex(9, 2), promote: false, drop: ROOK });
  });
});

describe('searchAllMoves / iterativeDeepeningSearchAllMoves', () => {
  it('searchAllMoves は全合法手のスコアを返す', () => {
    // 玉のみ、後手玉5九(盤端なので合法手5手)
    const pos = parseSfen('4k4/9/9/9/9/9/9/9/4K4 b - 1');
    const results = searchAllMoves(pos, 1);
    expect(results).toHaveLength(5);
  });

  it('iterativeDeepeningSearchAllMoves は時間制限内で深さ1以上の結果を返す', () => {
    const pos = parseSfen('4k4/9/9/9/9/9/9/9/4K4 b - 1');
    const results = iterativeDeepeningSearchAllMoves(pos, 50);
    expect(results.length).toBeGreaterThan(0);
  });

  it('iterativeDeepeningSearchAllMoves は1手詰めを発見できる', () => {
    // 先手玉9一(自分の歩8一・桂9二・角8二に囲まれ動けない)、後手玉5九(遠方、無関係)、後手持ち駒に桂
    // 桂を8三に打つと9一に王手がかかり、玉は動けず、桂は捕れず、他の合法手もすべて王手放置になる一意な詰み
    const pos = parseSfen('kp7/nb7/9/9/9/9/9/9/4K4 b N 1');
    const results = iterativeDeepeningSearchAllMoves(pos, 200);
    const best = results.reduce((a, b) => (b.score > a.score ? b : a));
    expect(best.move).toEqual({ from: null, to: squareIndex(8, 3), promote: false, drop: KNIGHT });
  });
});
