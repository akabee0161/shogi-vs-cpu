export const PAWN = 1;
export const LANCE = 2;
export const KNIGHT = 3;
export const SILVER = 4;
export const GOLD = 5;
export const BISHOP = 6;
export const ROOK = 7;
export const KING = 8;
export const PROM_PAWN = 9;
export const PROM_LANCE = 10;
export const PROM_KNIGHT = 11;
export const PROM_SILVER = 12;
export const HORSE = 13;
export const DRAGON = 14;

/** 持ち駒になりうる駒種（成駒・玉を除く7種）。持ち駒配列のインデックスと対応する。 */
export const HAND_PIECE_TYPES = [PAWN, LANCE, KNIGHT, SILVER, GOLD, BISHOP, ROOK] as const;

const PROMOTE_MAP: Partial<Record<number, number>> = {
  [PAWN]: PROM_PAWN,
  [LANCE]: PROM_LANCE,
  [KNIGHT]: PROM_KNIGHT,
  [SILVER]: PROM_SILVER,
  [BISHOP]: HORSE,
  [ROOK]: DRAGON,
};

const DEMOTE_MAP: Partial<Record<number, number>> = {
  [PROM_PAWN]: PAWN,
  [PROM_LANCE]: LANCE,
  [PROM_KNIGHT]: KNIGHT,
  [PROM_SILVER]: SILVER,
  [HORSE]: BISHOP,
  [DRAGON]: ROOK,
};

export function canPromote(pt: number): boolean {
  return PROMOTE_MAP[pt] !== undefined;
}

export function promote(pt: number): number {
  const promoted = PROMOTE_MAP[pt];
  if (promoted === undefined) throw new Error(`cannot promote piece type ${pt}`);
  return promoted;
}

/** 非成駒はそのまま返す。 */
export function demote(pt: number): number {
  return DEMOTE_MAP[pt] ?? pt;
}
