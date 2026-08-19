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
  // 投了で終局した場合の勝者。詰み・千日手とは異なり、投了は盤面の再生からは復元できないため
  // (盤面上は「まだ対局中」に見える)、終局理由そのものを直接保存する。
  resignedWinner?: 'b' | 'w';
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
    isValidSide(data.playerSide) &&
    (data.resignedWinner === undefined || isValidSide(data.resignedWinner))
  );
}

export function saveGame(state: GameState): void {
  const startPosition = state.history[0];
  if (startPosition === undefined) throw new Error('game state history must not be empty');
  const resignedWinner =
    state.endResult !== null &&
    state.endResult.type === 'resign' &&
    isValidSide(state.endResult.winner)
      ? state.endResult.winner
      : undefined;
  const data: SaveData = {
    startSfen: toSfen(startPosition),
    moveHistory: state.moveHistory.map(moveToUsi),
    difficulty: state.difficulty,
    playerSide: state.playerSide,
    resignedWinner,
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

  // 投了は盤面の再生からは判定できないため、保存されていれば最優先で信頼する。
  // (詰み・千日手は盤面から常に再現できるので、投了として保存されていない限りは今まで通り再計算する)
  const resignResult: GameEndInfo | null =
    parsed.resignedWinner !== undefined ? { type: 'resign', winner: parsed.resignedWinner } : null;
  const gameEnd = resignResult === null ? checkGameEnd(pos) : null;
  const repetition = resignResult === null && gameEnd === null ? checkRepetition(history) : null;
  const endResult: GameEndInfo | null = resignResult ?? gameEnd ?? repetition;

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
