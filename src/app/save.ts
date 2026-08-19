import type { Difficulty } from '../ai/difficulty';
import { applyMove } from '../core/apply-move';
import { checkGameEnd } from '../core/game-end';
import type { Move } from '../core/moves';
import type { Position } from '../core/position';
import { moveToUsi, parseUsiMove } from '../core/record';
import { checkRepetition } from '../core/repetition';
import { parseSfen, toSfen } from '../core/sfen';
import type { GameEndInfo, GameState } from './game-state';

const STORAGE_KEY = 'shogi-vs-cpu:save';

type SaveData = {
  // 対局開始局面の SFEN。moveHistory はこの局面からの手順であり、常に平手初期局面とは限らない
  // (例: 待ったで最初の手まで戻した対局は開始局面から一切進んでいない状態になる)。
  startSfen: string;
  moveHistory: string[];
  difficulty: Difficulty;
  playerSide: 'b' | 'w';
};

function isValidDifficulty(value: unknown): value is Difficulty {
  return value === 'weak' || value === 'normal' || value === 'strong';
}

function isValidSide(value: unknown): value is 'b' | 'w' {
  return value === 'b' || value === 'w';
}

function isValidSaveData(value: unknown): value is SaveData {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.startSfen === 'string' &&
    Array.isArray(data.moveHistory) &&
    data.moveHistory.every((m) => typeof m === 'string') &&
    isValidDifficulty(data.difficulty) &&
    isValidSide(data.playerSide)
  );
}

export function saveGame(state: GameState): void {
  const startPosition = state.history[0];
  if (startPosition === undefined) throw new Error('game state history must not be empty');
  const data: SaveData = {
    startSfen: toSfen(startPosition),
    moveHistory: state.moveHistory.map(moveToUsi),
    difficulty: state.difficulty,
    playerSide: state.playerSide,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage が使えない環境(プライベートモード等)では保存を諦める
  }
}

export function loadGame(): GameState | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isValidSaveData(parsed)) return null;

  let pos: Position;
  const history: Position[] = [];
  const moveHistory: Move[] = [];
  try {
    pos = parseSfen(parsed.startSfen);
    history.push(pos);
    for (const usi of parsed.moveHistory) {
      const move = parseUsiMove(usi);
      pos = applyMove(pos, move);
      history.push(pos);
      moveHistory.push(move);
    }
  } catch {
    return null;
  }

  const gameEnd = checkGameEnd(pos);
  const repetition = gameEnd === null ? checkRepetition(history) : null;
  const endResult: GameEndInfo | null = gameEnd ?? repetition;

  return {
    history,
    moveHistory,
    difficulty: parsed.difficulty,
    playerSide: parsed.playerSide,
    status: endResult !== null ? 'ended' : 'playing',
    endResult,
  };
}

export function clearSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 無視
  }
}
