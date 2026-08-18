import { moveToUsi } from '../core/record';
import { parseSfen } from '../core/sfen';
import { type Difficulty, selectMove } from './difficulty';

export type WorkerRequest = { sfen: string; difficulty: Difficulty };
export type WorkerResponse = { usiMove: string };

export function handleWorkerRequest(request: WorkerRequest, rng: () => number): WorkerResponse {
  const pos = parseSfen(request.sfen);
  const move = selectMove(pos, request.difficulty, rng);
  return { usiMove: moveToUsi(move) };
}
