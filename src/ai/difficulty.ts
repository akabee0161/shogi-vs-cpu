import type { Move } from '../core/moves';
import type { Position } from '../core/position';
import { legalMoves } from '../core/rules';
import { iterativeDeepeningSearchAllMoves, searchAllMoves } from './search';

export type Difficulty = 'weak' | 'normal' | 'strong';

const RANDOM_MOVE_PROBABILITY_WEAK = 0.2;
const NORMAL_SCORE_MARGIN = 100; // 歩1枚分
const STRONG_TIME_LIMIT_MS = 2000;
const WEAK_SEARCH_DEPTH = 2;
const NORMAL_SEARCH_DEPTH = 3;

function pickRandom<T>(candidates: T[], rng: () => number): T {
  const index = Math.min(Math.floor(rng() * candidates.length), candidates.length - 1);
  const item = candidates[index];
  if (item === undefined) throw new Error('candidates must not be empty');
  return item;
}

function topScoreOf(results: { score: number }[]): number {
  return results.reduce((max, r) => Math.max(max, r.score), Number.NEGATIVE_INFINITY);
}

export function selectMove(pos: Position, difficulty: Difficulty, rng: () => number): Move {
  if (legalMoves(pos).length === 0) throw new Error('no legal moves');

  if (difficulty === 'weak') {
    if (rng() < RANDOM_MOVE_PROBABILITY_WEAK) return pickRandom(legalMoves(pos), rng);
    const results = searchAllMoves(pos, WEAK_SEARCH_DEPTH, false);
    const topScore = topScoreOf(results);
    const best = results.filter((r) => r.score === topScore).map((r) => r.move);
    return pickRandom(best, rng);
  }

  if (difficulty === 'normal') {
    const results = searchAllMoves(pos, NORMAL_SEARCH_DEPTH, true);
    const topScore = topScoreOf(results);
    const candidates = results
      .filter((r) => topScore - r.score <= NORMAL_SCORE_MARGIN)
      .map((r) => r.move);
    return pickRandom(candidates, rng);
  }

  const results = iterativeDeepeningSearchAllMoves(pos, STRONG_TIME_LIMIT_MS, true);
  const topScore = topScoreOf(results);
  const candidates = results.filter((r) => r.score === topScore).map((r) => r.move);
  return pickRandom(candidates, rng);
}
