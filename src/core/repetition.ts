import type { Position } from './position';
import { isInCheck } from './rules';
import { toSfen } from './sfen';

export type RepetitionResult =
  | { type: 'repetition'; winner: null }
  | { type: 'perpetual-check'; winner: 'b' | 'w' };

function positionKey(pos: Position): string {
  const sfen = toSfen(pos);
  return sfen.slice(0, sfen.lastIndexOf(' '));
}

function allInCheckBetween(history: readonly Position[], start: number, end: number): boolean {
  for (let i = start + 1; i <= end; i++) {
    const pos = history[i];
    if (pos === undefined || !isInCheck(pos, pos.sideToMove)) return false;
  }
  return true;
}

export function checkRepetition(history: readonly Position[]): RepetitionResult | null {
  const current = history[history.length - 1];
  if (current === undefined) return null;

  const currentKey = positionKey(current);
  const indices: number[] = [];
  history.forEach((pos, i) => {
    if (positionKey(pos) === currentKey) indices.push(i);
  });
  if (indices.length < 4) return null;

  const last4 = indices.slice(-4);
  let allChecks = true;
  for (let k = 1; k < last4.length; k++) {
    const start = last4[k - 1];
    const end = last4[k];
    if (start === undefined || end === undefined || !allInCheckBetween(history, start, end)) {
      allChecks = false;
      break;
    }
  }

  if (allChecks) {
    const winner = current.sideToMove;
    return { type: 'perpetual-check', winner };
  }

  return { type: 'repetition', winner: null };
}
