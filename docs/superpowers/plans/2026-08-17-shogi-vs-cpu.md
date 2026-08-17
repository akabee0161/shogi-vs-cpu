# しょうぎ どうじょう (shogi-vs-cpu) 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 本将棋フルルールでCPUと対局できるブラウザゲームを実装し、ankardo (`ankardo.com/play/shogi-vs-cpu/`) にデプロイできる状態にする。

**Architecture:** ルールを純粋関数として実装する `src/core/`、`core` の合法手生成を使い Worker 内で動く探索 `src/ai/`、DOM描画・入力を担う `src/ui/`、状態遷移と保存/復元を統括する `src/app/` の4層。依存は `ui → core`、`ai → core` の一方向のみで、`core` が唯一の正しさの源。

**Tech Stack:** TypeScript (strict) / Vite / DOM + CSS Grid / Vitest / Biome / Wrangler (Cloudflare Workers Static Assets)

**Spec:** `docs/superpowers/specs/2026-08-17-shogi-vs-cpu-design.md`

## Global Constraints

- Node.js 22 以上。`package.json` の `engines.node` に `>=22` を書く
- `wrangler` は `devDependencies` に `^4` で固定する（未固定だと wrangler-action が古い 3.90.0 を入れ、パス付きルート+Assetsのネスト構造で deploy が失敗する）
- `vite.config.ts` の `base` は `/play/shogi-vs-cpu/`
- `vite.config.ts` の `build.outDir` は `out/play/shogi-vs-cpu`（`out` のままだと Workers のパス付きルートで失敗する）
- TypeScript は `strict: true` に加え `noUnusedLocals` / `noUnusedParameters` を有効化する
- `src/core/**` は `window` / `document` / `localStorage` / タイマー / Worker を一切参照しない（純粋関数のみ）
- `src/ai/**` は `core` の合法手生成・局面型のみを使う。DOM を参照しない
- `src/ui/**` は `core` を読み、`ai` とは Worker 経由でのみやり取りする。UI 側にルールを二重実装しない
- 盤は `Int8Array(81)`。0 = 空、正 = 先手の駒、負 = 後手の駒、絶対値が駒種コード（歩1・香2・桂3・銀4・金5・角6・飛7・玉8、成駒は9〜14）
- マス番号: `index = (段 - 1) * 9 + (9 - 筋)`。index 0 が 9一。この変換は `core/square.ts` に閉じ込め、他モジュールで直接計算しない
- 局面のシリアライズは SFEN 文字列、棋譜は USI 形式の指し手列。localStorage 保存と Worker 通信は同じ形式を使い回す
- 画面表示の棋譜表記のみ日本語（▲7六歩、△3四歩、同、成、打）に変換する。駒の漢字表記・棋譜表記は将棋の正式表記のまま崩さない
- ボタンとメッセージの文言はひらがな中心（「まった」「かんがえちゅう」「あなたの かち！」）
- 81マスは `<button>` 要素とし `aria-label` を「7六 歩」形式にする。タップ領域は最低 44px
- Worker は `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })` の形で生成する（文字列パス指定は base path 配下で 404 になる）
- Worker との通信は「局面（SFEN）＋難易度」を送り「指し手」を受け取るだけに限定する。オブジェクトを直接渡さない
- CPU 手番中は盤の入力を無効化し「かんがえちゅう」を表示する。最低思考時間は初期値 300ms
- 非スコープ（実装しない）: 入玉宣言法（27点法）、CPU の投了、探索内部での千日手検出、置換表（Zobrist ハッシュ）、定跡データベース、詰将棋専用ルーチン、駒の位置テーブル、駒の動き方ヘルプ画面、効果音・BGM・演出アニメーション、UI の DOM 細部テストと E2E
- コミットは Conventional Commits 形式（`feat:` / `fix:` / `test:` / `chore:` / `docs:`）
- lint / format は Biome を使う

---

### Task 1: プロジェクト初期化とマス番号変換

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `.gitignore`, `biome.json`
- Create: `src/core/square.ts`
- Test: `src/core/square.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `squareIndex(file: number, rank: number): number`、`fileOf(square: number): number`、`rankOf(square: number): number`（file・rank はともに 1〜9。file=筋、rank=段）

- [ ] **Step 1: package.json を作る**

```json
{
  "name": "shogi-vs-cpu",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check .",
    "format": "biome format --write ."
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0",
    "wrangler": "^4.0.0"
  }
}
```

- [ ] **Step 2: tsconfig.json を作る**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: vite.config.ts と vitest.config.ts を作る**

`vite.config.ts`（`base` と `build.outDir` は Global Constraints のとおり。ここを間違えるとデプロイが失敗する）:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/play/shogi-vs-cpu/',
  build: {
    outDir: 'out/play/shogi-vs-cpu',
    emptyOutDir: true,
  },
});
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
```

`vitest.config.ts` で `environment: 'jsdom'` を使うため、`jsdom` を devDependencies に追加する:

```bash
npm install -D jsdom
```

- [ ] **Step 4: index.html, .gitignore, biome.json を作る**

`index.html`:

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
    <title>しょうぎ どうじょう</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`.gitignore`:

```
node_modules/
out/
.wrangler/
*.log
.DS_Store
```

`biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": { "quoteStyle": "single", "semicolons": "always" }
  }
}
```

- [ ] **Step 5: 依存をインストールする**

Run: `npm install`
Expected: `node_modules/` が作られ、エラーなく終了する

- [ ] **Step 6: 失敗するテストを書く**

`src/core/square.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fileOf, rankOf, squareIndex } from './square';

describe('square', () => {
  it('9一 (file=9, rank=1) は index 0', () => {
    expect(squareIndex(9, 1)).toBe(0);
  });

  it('1一 (file=1, rank=1) は index 8', () => {
    expect(squareIndex(1, 1)).toBe(8);
  });

  it('9二 (file=9, rank=2) は index 9', () => {
    expect(squareIndex(9, 2)).toBe(9);
  });

  it('1九 (file=1, rank=9) は index 80', () => {
    expect(squareIndex(1, 9)).toBe(80);
  });

  it('7六 (file=7, rank=6) は index 47', () => {
    expect(squareIndex(7, 6)).toBe(47);
  });

  it('fileOf / rankOf は squareIndex の逆変換になる', () => {
    for (let file = 1; file <= 9; file++) {
      for (let rank = 1; rank <= 9; rank++) {
        const idx = squareIndex(file, rank);
        expect(fileOf(idx)).toBe(file);
        expect(rankOf(idx)).toBe(rank);
      }
    }
  });
});
```

- [ ] **Step 7: テストを実行して失敗を確認する**

Run: `npx vitest run src/core/square.test.ts`
Expected: FAIL（`src/core/square.ts` が存在しない）

- [ ] **Step 8: 実装する**

`src/core/square.ts`:

```ts
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
```

- [ ] **Step 9: テストを実行してパスを確認する**

Run: `npx vitest run src/core/square.test.ts`
Expected: PASS（全6件）

- [ ] **Step 10: lint を通す**

Run: `npx biome check .`
Expected: エラーなし（警告があれば `npx biome check --write .` で自動修正してから再確認）

- [ ] **Step 11: commit**

```bash
git add package.json tsconfig.json vite.config.ts vitest.config.ts index.html .gitignore biome.json package-lock.json src/core/square.ts src/core/square.test.ts
git commit -m "chore: initialize project and add square index conversion"
```

---

### Task 2: 駒種定義・局面の型・SFEN パース/シリアライズ

**Files:**
- Create: `src/core/piece.ts`
- Create: `src/core/position.ts`
- Create: `src/core/sfen.ts`
- Test: `src/core/sfen.test.ts`

**Interfaces:**
- Consumes: `squareIndex`, `fileOf`, `rankOf`（Task 1, `src/core/square.ts`）
- Produces:
  - `PAWN=1, LANCE=2, KNIGHT=3, SILVER=4, GOLD=5, BISHOP=6, ROOK=7, KING=8, PROM_PAWN=9, PROM_LANCE=10, PROM_KNIGHT=11, PROM_SILVER=12, HORSE=13, DRAGON=14`（`src/core/piece.ts`）
  - `canPromote(pt: number): boolean`、`promote(pt: number): number`、`demote(pt: number): number`
  - `type Position = { board: Int8Array; hands: [Int8Array, Int8Array]; sideToMove: 'b' | 'w'; ply: number }`（`src/core/position.ts`。`hands[0]` が先手、`hands[1]` が後手。各7要素は歩香桂銀金角飛の順＝駒種コード1〜7のインデックス）
  - `initialPosition(): Position`
  - `parseSfen(sfen: string): Position`、`toSfen(pos: Position): string`（`src/core/sfen.ts`）

- [ ] **Step 1: piece.ts を実装する（テスト不要な定数・純関数）**

`src/core/piece.ts`:

```ts
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
```

- [ ] **Step 2: position.ts を実装する**

`src/core/position.ts`:

```ts
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
```

- [ ] **Step 3: 失敗する SFEN 往復テストを書く**

`src/core/sfen.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BISHOP, DRAGON, GOLD, PAWN } from './piece';
import { squareIndex } from './square';
import { parseSfen, toSfen } from './sfen';

const INITIAL_SFEN = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';

describe('sfen', () => {
  it('平手初期局面をラウンドトリップできる', () => {
    const pos = parseSfen(INITIAL_SFEN);
    expect(toSfen(pos)).toBe(INITIAL_SFEN);
  });

  it('9一に後手の香、1一に後手の香が立つ', () => {
    const pos = parseSfen(INITIAL_SFEN);
    expect(pos.board[squareIndex(9, 1)]).toBe(-2); // 香=2, 後手なので負
    expect(pos.board[squareIndex(1, 1)]).toBe(-2);
  });

  it('7七に先手の角(2二寄りの飛車位置ではなく実際の初期配置)ではなく、8八角・2二角が正しい位置に立つ', () => {
    const pos = parseSfen(INITIAL_SFEN);
    // 2段目 "1r5b1": file9=空, file8=飛(後手,負), file2=角(後手,負)
    expect(pos.board[squareIndex(8, 2)]).toBe(-7); // 飛
    expect(pos.board[squareIndex(2, 2)]).toBe(-6); // 角
    // 8段目 "1B5R1": file8=角(先手,正), file2=飛(先手,正)
    expect(pos.board[squareIndex(8, 8)]).toBe(BISHOP);
    expect(pos.board[squareIndex(2, 8)]).toBe(7); // 飛
  });

  it('sideToMove と ply を読み取る', () => {
    const pos = parseSfen(INITIAL_SFEN);
    expect(pos.sideToMove).toBe('b');
    expect(pos.ply).toBe(1);
  });

  it('持ち駒ありの局面をラウンドトリップできる（成駒・複数枚・両陣営）', () => {
    const sfen = '9/9/9/9/4k4/9/9/9/4K4 w 2Pb3g 15';
    const pos = parseSfen(sfen);
    expect(pos.hands[1][PAWN - 1]).toBe(2); // 後手が歩を2枚
    expect(pos.hands[0][BISHOP - 1]).toBe(1); // 先手が角を1枚
    expect(pos.hands[0][GOLD - 1]).toBe(3); // 先手が金を3枚
    expect(toSfen(pos)).toBe(sfen);
  });

  it('成駒 (+記法) を含む局面をラウンドトリップできる', () => {
    const sfen = '4k4/9/9/9/9/9/9/9/4K2+R1 b - 1';
    const pos = parseSfen(sfen);
    expect(pos.board[squareIndex(1, 9)]).toBe(DRAGON);
    expect(toSfen(pos)).toBe(sfen);
  });
});
```

- [ ] **Step 4: テストを実行して失敗を確認する**

Run: `npx vitest run src/core/sfen.test.ts`
Expected: FAIL（`src/core/sfen.ts` が存在しない）

- [ ] **Step 5: sfen.ts を実装する**

`src/core/sfen.ts`:

```ts
import { HAND_PIECE_TYPES } from './piece';
import { emptyPosition, type Position } from './position';
import { fileOf, squareIndex } from './square';

const SFEN_CHARS: Record<number, string> = {
  1: 'P', 2: 'L', 3: 'N', 4: 'S', 5: 'G', 6: 'B', 7: 'R', 8: 'K',
  9: '+P', 10: '+L', 11: '+N', 12: '+S', 13: '+B', 14: '+R',
};
const CHAR_TO_TYPE: Record<string, number> = {
  P: 1, L: 2, N: 3, S: 4, G: 5, B: 6, R: 7, K: 8,
};

export function parseSfen(sfen: string): Position {
  const [boardPart, sideToMovePart, handsPart, plyPart] = sfen.split(' ');
  if (!boardPart || !sideToMovePart || !handsPart || !plyPart) {
    throw new Error(`invalid sfen: ${sfen}`);
  }

  const pos = emptyPosition();
  const ranks = boardPart.split('/');
  if (ranks.length !== 9) throw new Error(`invalid sfen board: ${boardPart}`);

  ranks.forEach((rankStr, rankIdx) => {
    const rank = rankIdx + 1;
    let file = 9;
    let i = 0;
    while (i < rankStr.length) {
      const ch = rankStr[i];
      if (ch >= '1' && ch <= '9') {
        file -= Number(ch);
        i += 1;
        continue;
      }
      let promoted = false;
      if (ch === '+') {
        promoted = true;
        i += 1;
      }
      const pieceChar = rankStr[i];
      const upper = pieceChar.toUpperCase();
      const baseType = CHAR_TO_TYPE[upper];
      if (baseType === undefined) throw new Error(`invalid piece char: ${pieceChar}`);
      const pieceType = promoted ? baseType + 8 : baseType;
      const sign = pieceChar === upper ? 1 : -1;
      pos.board[squareIndex(file, rank)] = sign * pieceType;
      file -= 1;
      i += 1;
    }
  });

  pos.sideToMove = sideToMovePart === 'w' ? 'w' : 'b';

  if (handsPart !== '-') {
    let i = 0;
    while (i < handsPart.length) {
      let countStr = '';
      while (handsPart[i] >= '0' && handsPart[i] <= '9') {
        countStr += handsPart[i];
        i += 1;
      }
      const count = countStr === '' ? 1 : Number(countStr);
      const pieceChar = handsPart[i];
      i += 1;
      const upper = pieceChar.toUpperCase();
      const baseType = CHAR_TO_TYPE[upper];
      if (baseType === undefined) throw new Error(`invalid hand piece char: ${pieceChar}`);
      const handIdx = pieceChar === upper ? 0 : 1;
      pos.hands[handIdx][baseType - 1] = count;
    }
  }

  pos.ply = Number(plyPart);
  return pos;
}

export function toSfen(pos: Position): string {
  const rankStrs: string[] = [];
  for (let rank = 1; rank <= 9; rank++) {
    let rankStr = '';
    let emptyRun = 0;
    for (let file = 9; file >= 1; file--) {
      const piece = pos.board[squareIndex(file, rank)];
      if (piece === 0) {
        emptyRun += 1;
        continue;
      }
      if (emptyRun > 0) {
        rankStr += String(emptyRun);
        emptyRun = 0;
      }
      const pieceType = Math.abs(piece);
      const char = SFEN_CHARS[pieceType];
      rankStr += piece > 0 ? char : char.toLowerCase();
    }
    if (emptyRun > 0) rankStr += String(emptyRun);
    rankStrs.push(rankStr);
  }

  let handsStr = '';
  // 先手(大文字)を先に、後手(小文字)を後に、共に歩香桂銀金角飛の順で列挙する（USI/SFEN 標準の並び）
  for (const side of [0, 1] as const) {
    for (const pt of HAND_PIECE_TYPES) {
      const count = pos.hands[side][pt - 1];
      if (count === 0) continue;
      const char = SFEN_CHARS[pt];
      handsStr += (count > 1 ? String(count) : '') + (side === 0 ? char : char.toLowerCase());
    }
  }
  if (handsStr === '') handsStr = '-';

  return `${rankStrs.join('/')} ${pos.sideToMove} ${handsStr} ${pos.ply}`;
}

export function initialPosition(): Position {
  return parseSfen('lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1');
}
```

`fileOf` は Step 5 の実装では未使用（`squareIndex` のみで足りる）。lint で `noUnusedLocals` に引っかからないよう、import 文からは外してある点に注意（コピー時に余分な import を残さないこと）。

- [ ] **Step 6: テストを実行してパスを確認する**

Run: `npx vitest run src/core/sfen.test.ts`
Expected: PASS（全6件）

- [ ] **Step 7: lint を通す**

Run: `npx biome check .`
Expected: エラーなし

- [ ] **Step 8: commit**

```bash
git add src/core/piece.ts src/core/position.ts src/core/sfen.ts src/core/sfen.test.ts
git commit -m "feat: add piece types, position type, and sfen parse/serialize"
```

---

### Task 3: 盤上の駒の疑似合法手生成（全駒種・遮蔽・強制成り）

自玉の安全性チェックと持ち駒を打つ手はこのタスクの範囲外（Task 5, Task 4 で追加する）。

**Files:**
- Create: `src/core/moves.ts`
- Test: `src/core/moves.test.ts`

**Interfaces:**
- Consumes: `Position`（Task 2）、`squareIndex`/`fileOf`/`rankOf`（Task 1）、`PAWN`〜`DRAGON` 定数・`canPromote`（Task 2）
- Produces: `type Move = { from: number | null; to: number; promote: boolean; drop?: number }`、`pseudoLegalBoardMoves(pos: Position): Move[]`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/moves.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pseudoLegalBoardMoves } from './moves';
import { parseSfen } from './sfen';
import { squareIndex } from './square';

function toSet(moves: { to: number; promote: boolean }[]) {
  return new Set(moves.map((m) => `${m.to}:${m.promote}`));
}

describe('pseudoLegalBoardMoves', () => {
  it('歩は1マス前にのみ進める', () => {
    const pos = parseSfen('9/9/9/9/4P4/9/9/9/9 b - 1');
    const moves = pseudoLegalBoardMoves(pos);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toEqual({ from: squareIndex(5, 5), to: squareIndex(5, 4), promote: false });
  });

  it('歩が敵陣(1〜3段目)に入るときは成り・不成りの両方を生成する', () => {
    const pos = parseSfen('9/9/9/4P4/9/9/9/9/9 b - 1');
    const moves = pseudoLegalBoardMoves(pos);
    expect(toSet(moves)).toEqual(new Set([`${squareIndex(5, 3)}:true`, `${squareIndex(5, 3)}:false`]));
  });

  it('歩が1段目に進むときは強制成りで不成りは生成しない', () => {
    const pos = parseSfen('9/4P4/9/9/9/9/9/9/9 b - 1');
    const moves = pseudoLegalBoardMoves(pos);
    expect(moves).toEqual([{ from: squareIndex(5, 2), to: squareIndex(5, 1), promote: true }]);
  });

  it('桂は2マス前の左右にのみ進める(飛び越え可)', () => {
    const pos = parseSfen('9/9/9/9/4N4/9/9/9/9 b - 1');
    const moves = pseudoLegalBoardMoves(pos);
    expect(toSet(moves)).toEqual(
      new Set([`${squareIndex(6, 3)}:false`, `${squareIndex(4, 3)}:false`]),
    );
  });

  it('桂が1〜2段目に進むときは強制成り', () => {
    const pos = parseSfen('9/9/4N4/9/9/9/9/9/9 b - 1');
    const moves = pseudoLegalBoardMoves(pos);
    expect(toSet(moves)).toEqual(
      new Set([`${squareIndex(6, 1)}:true`, `${squareIndex(4, 1)}:true`]),
    );
  });

  it('銀は前と斜め4方向に進める(横・真後ろは不可)', () => {
    const pos = parseSfen('9/9/9/9/4S4/9/9/9/9 b - 1');
    const moves = pseudoLegalBoardMoves(pos);
    const dests = moves.map((m) => m.to).sort((a, b) => a - b);
    const expected = [
      squareIndex(5, 4), squareIndex(6, 4), squareIndex(4, 4),
      squareIndex(6, 6), squareIndex(4, 6),
    ].sort((a, b) => a - b);
    expect(dests).toEqual(expected);
  });

  it('金は前後左右と斜め前に進める(斜め後ろは不可)', () => {
    const pos = parseSfen('9/9/9/9/4G4/9/9/9/9 b - 1');
    const moves = pseudoLegalBoardMoves(pos);
    const dests = moves.map((m) => m.to).sort((a, b) => a - b);
    const expected = [
      squareIndex(5, 4), squareIndex(6, 4), squareIndex(4, 4),
      squareIndex(6, 5), squareIndex(4, 5), squareIndex(5, 6),
    ].sort((a, b) => a - b);
    expect(dests).toEqual(expected);
  });

  it('と金は金と同じ動きをする', () => {
    const posGold = parseSfen('9/9/9/9/4G4/9/9/9/9 b - 1');
    const posTokin = parseSfen('9/9/9/9/4+P4/9/9/9/9 b - 1');
    const goldDests = pseudoLegalBoardMoves(posGold).map((m) => m.to).sort((a, b) => a - b);
    const tokinDests = pseudoLegalBoardMoves(posTokin).map((m) => m.to).sort((a, b) => a - b);
    expect(tokinDests).toEqual(goldDests);
  });

  it('玉は8方向に1マス進める', () => {
    const pos = parseSfen('9/9/9/9/4K4/9/9/9/9 b - 1');
    const moves = pseudoLegalBoardMoves(pos);
    expect(moves).toHaveLength(8);
  });

  it('香は前方に何マスでも進み、味方の駒の手前で止まる', () => {
    const pos = parseSfen('9/9/9/9/4P4/9/9/9/4L4 b - 1'); // 自分の歩が5五、香が5九
    const moves = pseudoLegalBoardMoves(pos).filter((m) => m.from === squareIndex(5, 9));
    const dests = moves.map((m) => m.to).sort((a, b) => a - b);
    expect(dests).toEqual([squareIndex(5, 8), squareIndex(5, 7), squareIndex(5, 6)].sort((a, b) => a - b));
  });

  it('香は敵の駒があればそこまで進んで取り、その先には進めない', () => {
    const pos = parseSfen('9/9/9/9/4p4/9/9/9/4L4 b - 1'); // 敵の歩が5五、香が5九
    const moves = pseudoLegalBoardMoves(pos).filter((m) => m.from === squareIndex(5, 9));
    const dests = moves.map((m) => m.to).sort((a, b) => a - b);
    expect(dests).toEqual(
      [squareIndex(5, 8), squareIndex(5, 7), squareIndex(5, 6), squareIndex(5, 5)].sort((a, b) => a - b),
    );
  });

  it('角は斜め4方向に何マスでも進む', () => {
    const pos = parseSfen('9/9/9/9/4B4/9/9/9/9 b - 1');
    const moves = pseudoLegalBoardMoves(pos);
    expect(moves).toHaveLength(4 + 4); // 各方向とも盤端まで4マス
  });

  it('飛は縦横4方向に何マスでも進む', () => {
    const pos = parseSfen('9/9/9/9/4R4/9/9/9/9 b - 1');
    const moves = pseudoLegalBoardMoves(pos);
    expect(moves).toHaveLength(8 + 8); // 縦8マス・横8マス
  });

  it('馬(角成)は角の動き+上下左右1マス', () => {
    const pos = parseSfen('9/9/9/9/4+B4/9/9/9/9 b - 1');
    const moves = pseudoLegalBoardMoves(pos);
    const dests = new Set(moves.map((m) => m.to));
    expect(dests.has(squareIndex(5, 4))).toBe(true); // 上
    expect(dests.has(squareIndex(6, 5))).toBe(true); // 横
  });

  it('龍(飛成)は飛の動き+斜め4方向1マス', () => {
    const pos = parseSfen('9/9/9/9/4+R4/9/9/9/9 b - 1');
    const moves = pseudoLegalBoardMoves(pos);
    const dests = new Set(moves.map((m) => m.to));
    expect(dests.has(squareIndex(6, 4))).toBe(true); // 斜め
  });

  it('後手の歩は下方向(段が増える方向)に進む', () => {
    const pos = parseSfen('9/9/9/9/4p4/9/9/9/9 w - 1');
    const moves = pseudoLegalBoardMoves(pos);
    expect(moves).toEqual([{ from: squareIndex(5, 5), to: squareIndex(5, 6), promote: false }]);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/core/moves.test.ts`
Expected: FAIL（`src/core/moves.ts` が存在しない）

- [ ] **Step 3: moves.ts を実装する**

`src/core/moves.ts`:

```ts
import {
  BISHOP, DRAGON, GOLD, HORSE, KING, KNIGHT, LANCE, PAWN,
  PROM_KNIGHT, PROM_LANCE, PROM_PAWN, PROM_SILVER, ROOK, SILVER,
  canPromote,
} from './piece';
import type { Position } from './position';
import { fileOf, rankOf, squareIndex } from './square';

export type Move = {
  from: number | null; // null = 打ち
  to: number;
  promote: boolean;
  drop?: number; // 打つ駒種（PieceType）
};

type Vector = readonly [number, number]; // [dfile, drank]（先手視点）

const GOLD_LIKE_VECTORS: Vector[] = [[0, -1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1]];
const SILVER_VECTORS: Vector[] = [[0, -1], [1, -1], [-1, -1], [1, 1], [-1, 1]];
const KNIGHT_VECTORS: Vector[] = [[1, -2], [-1, -2]];
const PAWN_VECTORS: Vector[] = [[0, -1]];
const KING_VECTORS: Vector[] = [
  [0, -1], [0, 1], [1, 0], [-1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1],
];
const BISHOP_DIRS: Vector[] = [[1, -1], [-1, -1], [1, 1], [-1, 1]];
const ROOK_DIRS: Vector[] = [[0, -1], [0, 1], [1, 0], [-1, 0]];

/** 1マスだけ進む駒の方向（馬・龍は「スライドしない側」の1マス方向も含む）。 */
const STEP_VECTORS: Partial<Record<number, Vector[]>> = {
  [PAWN]: PAWN_VECTORS,
  [KNIGHT]: KNIGHT_VECTORS,
  [SILVER]: SILVER_VECTORS,
  [GOLD]: GOLD_LIKE_VECTORS,
  [PROM_PAWN]: GOLD_LIKE_VECTORS,
  [PROM_LANCE]: GOLD_LIKE_VECTORS,
  [PROM_KNIGHT]: GOLD_LIKE_VECTORS,
  [PROM_SILVER]: GOLD_LIKE_VECTORS,
  [KING]: KING_VECTORS,
  [HORSE]: ROOK_DIRS,
  [DRAGON]: BISHOP_DIRS,
};

/** 盤端または駒にぶつかるまで進み続ける駒の方向。 */
const SLIDE_DIRS: Partial<Record<number, Vector[]>> = {
  [LANCE]: [[0, -1]],
  [BISHOP]: BISHOP_DIRS,
  [ROOK]: ROOK_DIRS,
  [HORSE]: BISHOP_DIRS,
  [DRAGON]: ROOK_DIRS,
};

function isInPromotionZone(rank: number, side: 'b' | 'w'): boolean {
  return side === 'b' ? rank <= 3 : rank >= 7;
}

function mustPromote(pieceType: number, toRank: number, side: 'b' | 'w'): boolean {
  const lastRank = side === 'b' ? 1 : 9;
  const secondLastRank = side === 'b' ? 2 : 8;
  if ((pieceType === PAWN || pieceType === LANCE) && toRank === lastRank) return true;
  if (pieceType === KNIGHT && (toRank === lastRank || toRank === secondLastRank)) return true;
  return false;
}

/** 移動先が盤内かつ味方の駒がなければ手を追加する。戻り値 true はスライドをここで止めるべき合図。 */
function addMoveIfValid(
  pos: Position,
  moves: Move[],
  pieceType: number,
  from: number,
  toFile: number,
  toRank: number,
  sign: number,
): boolean {
  if (toFile < 1 || toFile > 9 || toRank < 1 || toRank > 9) return true;
  const to = squareIndex(toFile, toRank);
  const target = pos.board[to];
  const isOwnTarget = target !== 0 && (sign > 0 ? target > 0 : target < 0);
  if (isOwnTarget) return true;

  const side: 'b' | 'w' = sign > 0 ? 'b' : 'w';
  const forced = mustPromote(pieceType, toRank, side);
  const eligible =
    canPromote(pieceType) &&
    (isInPromotionZone(toRank, side) || isInPromotionZone(rankOf(from), side));

  if (eligible) {
    moves.push({ from, to, promote: true });
    if (!forced) moves.push({ from, to, promote: false });
  } else {
    moves.push({ from, to, promote: false });
  }

  return target !== 0; // 敵駒を取ったらここでスライド終了
}

export function pseudoLegalBoardMoves(pos: Position): Move[] {
  const moves: Move[] = [];
  const sign = pos.sideToMove === 'b' ? 1 : -1;

  for (let from = 0; from < 81; from++) {
    const piece = pos.board[from];
    if (piece === 0) continue;
    const isOwn = sign > 0 ? piece > 0 : piece < 0;
    if (!isOwn) continue;

    const pieceType = Math.abs(piece);
    const fromFile = fileOf(from);
    const fromRank = rankOf(from);

    const steps = STEP_VECTORS[pieceType];
    if (steps) {
      for (const [dfile, drank] of steps) {
        addMoveIfValid(pos, moves, pieceType, from, fromFile + dfile * sign, fromRank + drank * sign, sign);
      }
    }

    const slides = SLIDE_DIRS[pieceType];
    if (slides) {
      for (const [dfile, drank] of slides) {
        let toFile = fromFile + dfile * sign;
        let toRank = fromRank + drank * sign;
        while (toFile >= 1 && toFile <= 9 && toRank >= 1 && toRank <= 9) {
          const target = pos.board[squareIndex(toFile, toRank)];
          const stop = addMoveIfValid(pos, moves, pieceType, from, toFile, toRank, sign);
          if (stop || target !== 0) break;
          toFile += dfile * sign;
          toRank += drank * sign;
        }
      }
    }
  }

  return moves;
}
```

- [ ] **Step 4: テストを実行してパスを確認する**

Run: `npx vitest run src/core/moves.test.ts`
Expected: PASS（全16件）

- [ ] **Step 5: lint を通す**

Run: `npx biome check .`
Expected: エラーなし

- [ ] **Step 6: commit**

```bash
git add src/core/moves.ts src/core/moves.test.ts
git commit -m "feat: generate pseudo-legal board moves for all piece types"
```

---

### Task 4: 持ち駒を打つ手の生成（二歩・行き所のない駒への打ち禁止）

打ち歩詰めはこのタスクの範囲外（王手判定が必要なため Task 6 で扱う）。

**Files:**
- Modify: `src/core/moves.ts`
- Test: `src/core/moves.test.ts`（追記）

**Interfaces:**
- Consumes: `pseudoLegalBoardMoves`、`mustPromote`（Task 3, 同ファイル内 private 関数）、`HAND_PIECE_TYPES`（Task 2, `src/core/piece.ts`）
- Produces: `pseudoLegalDropMoves(pos: Position): Move[]`、`pseudoLegalMoves(pos: Position): Move[]`（盤上の移動＋打ちの両方を含む）

- [ ] **Step 1: 失敗するテストを追記する**

`src/core/moves.test.ts` の末尾（最後の `});` の直前の describe ブロックを閉じた後）に追記:

```ts
import { pseudoLegalDropMoves, pseudoLegalMoves } from './moves';

describe('pseudoLegalDropMoves', () => {
  it('持ち駒の歩を空きマスに打てる', () => {
    const pos = parseSfen('9/9/9/9/9/9/9/9/9 b P 1');
    const moves = pseudoLegalDropMoves(pos);
    expect(moves).toHaveLength(81);
    expect(moves[0]).toEqual({ from: null, to: 0, promote: false, drop: 1 });
  });

  it('駒がある場所には打てない', () => {
    const pos = parseSfen('9/9/9/9/9/9/9/9/4K4 b P 1');
    const moves = pseudoLegalDropMoves(pos);
    expect(moves.some((m) => m.to === squareIndex(5, 9))).toBe(false);
    expect(moves).toHaveLength(80);
  });

  it('二歩: 同じ筋に自分の不成の歩があれば打てない', () => {
    const pos = parseSfen('9/9/9/9/4P4/9/9/9/9 b P 1'); // 5五に自分の歩、持ち駒に歩1枚
    const moves = pseudoLegalDropMoves(pos);
    expect(moves.some((m) => fileOfMove(m) === 5)).toBe(false);

    function fileOfMove(m: { to: number }) {
      return 9 - (m.to % 9);
    }
  });

  it('と金がある筋には二歩の制限を受けず歩を打てる', () => {
    const pos = parseSfen('9/9/9/9/4+P4/9/9/9/9 b P 1'); // 5五にと金
    const moves = pseudoLegalDropMoves(pos);
    expect(moves.some((m) => m.to === squareIndex(5, 4))).toBe(true);
  });

  it('歩は1段目に打てない(行き所のない駒)', () => {
    const pos = parseSfen('9/9/9/9/9/9/9/9/9 b P 1');
    const moves = pseudoLegalDropMoves(pos);
    expect(moves.some((m) => m.to === squareIndex(5, 1))).toBe(false);
  });

  it('香は1段目に打てない', () => {
    const pos = parseSfen('9/9/9/9/9/9/9/9/9 b L 1');
    const moves = pseudoLegalDropMoves(pos);
    expect(moves.some((m) => m.to === squareIndex(5, 1))).toBe(false);
  });

  it('桂は1〜2段目に打てない', () => {
    const pos = parseSfen('9/9/9/9/9/9/9/9/9 b N 1');
    const moves = pseudoLegalDropMoves(pos);
    expect(moves.some((m) => m.to === squareIndex(5, 1))).toBe(false);
    expect(moves.some((m) => m.to === squareIndex(5, 2))).toBe(false);
    expect(moves.some((m) => m.to === squareIndex(5, 3))).toBe(true);
  });

  it('持ち駒がない駒種は打つ手を生成しない', () => {
    const pos = parseSfen('9/9/9/9/9/9/9/9/9 b - 1');
    expect(pseudoLegalDropMoves(pos)).toHaveLength(0);
  });
});

describe('pseudoLegalMoves', () => {
  it('盤上の移動と持ち駒の打ちの両方を含む', () => {
    const pos = parseSfen('9/9/9/9/4P4/9/9/9/9 b P 1');
    const moves = pseudoLegalMoves(pos);
    const boardMoveCount = moves.filter((m) => m.from !== null).length;
    const dropMoveCount = moves.filter((m) => m.from === null).length;
    expect(boardMoveCount).toBe(1); // 盤上の歩が1マス前進
    expect(dropMoveCount).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/core/moves.test.ts`
Expected: FAIL（`pseudoLegalDropMoves` / `pseudoLegalMoves` が存在しない）

- [ ] **Step 3: moves.ts に打つ手の生成を追加する**

`src/core/moves.ts` の import 文を次のように差し替える（`HAND_PIECE_TYPES` を追加）:

```ts
import {
  BISHOP, DRAGON, GOLD, HAND_PIECE_TYPES, HORSE, KING, KNIGHT, LANCE, PAWN,
  PROM_KNIGHT, PROM_LANCE, PROM_PAWN, PROM_SILVER, ROOK, SILVER,
  canPromote,
} from './piece';
```

ファイル末尾に追加:

```ts
function hasPawnOnFile(pos: Position, file: number, side: 'b' | 'w'): boolean {
  const targetPiece = side === 'b' ? PAWN : -PAWN;
  for (let rank = 1; rank <= 9; rank++) {
    if (pos.board[squareIndex(file, rank)] === targetPiece) return true;
  }
  return false;
}

export function pseudoLegalDropMoves(pos: Position): Move[] {
  const moves: Move[] = [];
  const side = pos.sideToMove;
  const handIdx = side === 'b' ? 0 : 1;
  const hand = pos.hands[handIdx];

  for (const pieceType of HAND_PIECE_TYPES) {
    if (hand[pieceType - 1] === 0) continue;

    for (let to = 0; to < 81; to++) {
      if (pos.board[to] !== 0) continue;
      const toFile = fileOf(to);
      const toRank = rankOf(to);

      if (mustPromote(pieceType, toRank, side)) continue;
      if (pieceType === PAWN && hasPawnOnFile(pos, toFile, side)) continue;

      moves.push({ from: null, to, promote: false, drop: pieceType });
    }
  }

  return moves;
}

export function pseudoLegalMoves(pos: Position): Move[] {
  return [...pseudoLegalBoardMoves(pos), ...pseudoLegalDropMoves(pos)];
}
```

- [ ] **Step 4: テストを実行してパスを確認する**

Run: `npx vitest run src/core/moves.test.ts`
Expected: PASS（全24件）

- [ ] **Step 5: lint を通す**

Run: `npx biome check .`
Expected: エラーなし

- [ ] **Step 6: commit**

```bash
git add src/core/moves.ts src/core/moves.test.ts
git commit -m "feat: generate pseudo-legal drop moves with nifu and stuck-piece rules"
```

---

### Task 5: 手の適用・王手判定・完全合法手生成

**Files:**
- Create: `src/core/apply-move.ts`
- Create: `src/core/rules.ts`
- Test: `src/core/apply-move.test.ts`
- Test: `src/core/rules.test.ts`

**Interfaces:**
- Consumes: `Move`/`pseudoLegalMoves`/`pseudoLegalBoardMoves`（Task 3-4, `src/core/moves.ts`）、`Position`（Task 2）、`demote`/`promote`/`KING`（Task 2, `src/core/piece.ts`）
- Produces: `applyMove(pos: Position, move: Move): Position`（`src/core/apply-move.ts`。元の `pos` を変更しない）、`isInCheck(pos: Position, side: 'b' | 'w'): boolean`、`legalMoves(pos: Position): Move[]`（`src/core/rules.ts`）

- [ ] **Step 1: 失敗する apply-move テストを書く**

`src/core/apply-move.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyMove } from './apply-move';
import { PAWN, PROM_PAWN } from './piece';
import { parseSfen } from './sfen';
import { squareIndex } from './square';

describe('applyMove', () => {
  it('通常の移動で駒が動き、手番が反転しplyが進む', () => {
    const pos = parseSfen('9/9/9/9/4P4/9/9/9/9 b - 1');
    const next = applyMove(pos, { from: squareIndex(5, 5), to: squareIndex(5, 4), promote: false });
    expect(next.board[squareIndex(5, 5)]).toBe(0);
    expect(next.board[squareIndex(5, 4)]).toBe(PAWN);
    expect(next.sideToMove).toBe('w');
    expect(next.ply).toBe(2);
    expect(pos.board[squareIndex(5, 5)]).toBe(PAWN); // 元の局面は変更されない
  });

  it('駒を取ると持ち駒に加算される', () => {
    const pos = parseSfen('9/9/9/9/4p4/4P4/9/9/9 b - 1'); // 先手歩5六、後手歩5五
    const next = applyMove(pos, { from: squareIndex(5, 6), to: squareIndex(5, 5), promote: false });
    expect(next.hands[0][PAWN - 1]).toBe(1);
    expect(next.board[squareIndex(5, 5)]).toBe(PAWN);
  });

  it('成駒を取ると非成駒に戻って持ち駒に加算される', () => {
    const pos = parseSfen('9/9/9/9/4+p4/4P4/9/9/9 b - 1'); // 後手と金5五、先手歩5六
    const next = applyMove(pos, { from: squareIndex(5, 6), to: squareIndex(5, 5), promote: false });
    expect(next.hands[0][PAWN - 1]).toBe(1);
  });

  it('打つ手で持ち駒が減り盤上に駒が置かれる', () => {
    const pos = parseSfen('9/9/9/9/9/9/9/9/9 b P 1');
    const next = applyMove(pos, { from: null, to: squareIndex(5, 5), promote: false, drop: PAWN });
    expect(next.hands[0][PAWN - 1]).toBe(0);
    expect(next.board[squareIndex(5, 5)]).toBe(PAWN);
  });

  it('成る手で成駒になる', () => {
    const pos = parseSfen('9/9/9/4P4/9/9/9/9/9 b - 1'); // 歩5四
    const next = applyMove(pos, { from: squareIndex(5, 4), to: squareIndex(5, 3), promote: true });
    expect(next.board[squareIndex(5, 3)]).toBe(PROM_PAWN);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/core/apply-move.test.ts`
Expected: FAIL（`src/core/apply-move.ts` が存在しない）

- [ ] **Step 3: apply-move.ts を実装する**

`src/core/apply-move.ts`:

```ts
import { demote, promote } from './piece';
import type { Move } from './moves';
import type { Position } from './position';

export function applyMove(pos: Position, move: Move): Position {
  const board = new Int8Array(pos.board);
  const hands: [Int8Array, Int8Array] = [new Int8Array(pos.hands[0]), new Int8Array(pos.hands[1])];
  const side = pos.sideToMove;
  const sign = side === 'b' ? 1 : -1;
  const handIdx = side === 'b' ? 0 : 1;

  if (move.drop !== undefined) {
    board[move.to] = sign * move.drop;
    hands[handIdx][move.drop - 1] -= 1;
  } else {
    if (move.from === null) throw new Error('move.from is null but drop is undefined');
    const piece = board[move.from];
    const pieceType = Math.abs(piece);
    const captured = board[move.to];
    if (captured !== 0) {
      const capturedType = demote(Math.abs(captured));
      hands[handIdx][capturedType - 1] += 1;
    }
    board[move.from] = 0;
    board[move.to] = sign * (move.promote ? promote(pieceType) : pieceType);
  }

  return {
    board,
    hands,
    sideToMove: side === 'b' ? 'w' : 'b',
    ply: pos.ply + 1,
  };
}
```

- [ ] **Step 4: テストを実行してパスを確認する**

Run: `npx vitest run src/core/apply-move.test.ts`
Expected: PASS（全5件）

- [ ] **Step 5: 失敗する rules テストを書く**

`src/core/rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GOLD } from './piece';
import { isInCheck, legalMoves } from './rules';
import { parseSfen } from './sfen';
import { squareIndex } from './square';

describe('isInCheck', () => {
  it('敵の飛車に同じ筋を睨まれていれば王手', () => {
    const pos = parseSfen('4r4/9/9/9/9/9/9/9/4K4 b - 1');
    expect(isInCheck(pos, 'b')).toBe(true);
  });

  it('筋がずれていれば王手ではない', () => {
    const pos = parseSfen('3r5/9/9/9/9/9/9/9/4K4 b - 1');
    expect(isInCheck(pos, 'b')).toBe(false);
  });
});

describe('legalMoves', () => {
  it('王手放置になる手(無関係な駒を動かす手)は除外される', () => {
    const pos = parseSfen('4r4/9/9/3G5/9/9/9/9/4K4 b - 1'); // 後手飛車5一、先手金4六(無関係)、先手玉5九
    const moves = legalMoves(pos);
    const kingMoves = moves.filter((m) => m.from === squareIndex(5, 9));
    const goldMoves = moves.filter((m) => m.from === squareIndex(4, 6));
    expect(kingMoves.length).toBeGreaterThan(0);
    expect(goldMoves).toHaveLength(0);
  });

  it('ピンされた駒は開き王手になる方向へ動けない(縦方向のみ許可)', () => {
    const pos = parseSfen('4r4/9/9/9/4G4/9/9/9/4K4 b - 1'); // 後手飛車5一、先手金5五(ピン)、先手玉5九
    const moves = legalMoves(pos);
    const dests = moves
      .filter((m) => m.from === squareIndex(5, 5))
      .map((m) => m.to)
      .sort((a, b) => a - b);
    expect(dests).toEqual([squareIndex(5, 4), squareIndex(5, 6)].sort((a, b) => a - b));
  });

  it('王手時は玉を動かす・王手駒との間に合駒するいずれかのみ合法', () => {
    const pos = parseSfen('4r4/9/9/9/9/9/9/9/4K4 b G 1'); // 後手飛車5一、先手玉5九、持ち駒に金
    const moves = legalMoves(pos);
    const kingMoves = moves.filter((m) => m.from === squareIndex(5, 9));
    const blockDrops = moves.filter((m) => m.drop === GOLD);
    expect(kingMoves.length).toBeGreaterThan(0);
    const blockDests = blockDrops.map((m) => m.to).sort((a, b) => a - b);
    const expectedBlocks = [2, 3, 4, 5, 6, 7, 8]
      .map((rank) => squareIndex(5, rank))
      .sort((a, b) => a - b);
    expect(blockDests).toEqual(expectedBlocks);
  });
});
```

- [ ] **Step 6: テストを実行して失敗を確認する**

Run: `npx vitest run src/core/rules.test.ts`
Expected: FAIL（`src/core/rules.ts` が存在しない）

- [ ] **Step 7: rules.ts を実装する**

`src/core/rules.ts`:

```ts
import { applyMove } from './apply-move';
import { pseudoLegalBoardMoves, pseudoLegalMoves } from './moves';
import { KING } from './piece';
import type { Position } from './position';

function findKing(pos: Position, side: 'b' | 'w'): number {
  const target = side === 'b' ? KING : -KING;
  for (let i = 0; i < 81; i++) {
    if (pos.board[i] === target) return i;
  }
  throw new Error(`king not found for side ${side}`);
}

export function isInCheck(pos: Position, side: 'b' | 'w'): boolean {
  const kingSquare = findKing(pos, side);
  const opponentSide = side === 'b' ? 'w' : 'b';
  const opponentView: Position = { ...pos, sideToMove: opponentSide };
  return pseudoLegalBoardMoves(opponentView).some((m) => m.to === kingSquare);
}

/** 疑似合法手から、指した結果自玉が王手になる手を除去する。ピン・開き王手・合駒はすべてこの力任せな判定で自動的に処理される。 */
export function legalMoves(pos: Position): import('./moves').Move[] {
  const side = pos.sideToMove;
  return pseudoLegalMoves(pos).filter((move) => !isInCheck(applyMove(pos, move), side));
}
```

- [ ] **Step 8: テストを実行してパスを確認する**

Run: `npx vitest run src/core/rules.test.ts`
Expected: PASS（全5件）

- [ ] **Step 9: lint を通す**

Run: `npx biome check .`
Expected: エラーなし

- [ ] **Step 10: commit**

```bash
git add src/core/apply-move.ts src/core/apply-move.test.ts src/core/rules.ts src/core/rules.test.ts
git commit -m "feat: add move application, check detection, and legal move filtering"
```

---

### Task 6: 打ち歩詰めの禁止

**Files:**
- Modify: `src/core/rules.ts`
- Test: `src/core/rules.test.ts`（追記）

**Interfaces:**
- Consumes: `legalMoves`/`isInCheck`/`applyMove`（Task 5, 同ファイル内）、`PAWN`/`LANCE`（`src/core/piece.ts`）
- Produces: `hasNoLegalMoves(pos: Position): boolean`（`legalMoves` は歩を打った結果、相手が `hasNoLegalMoves` になる手を除外するようになる）

- [ ] **Step 1: 失敗するテストを追記する**

`src/core/rules.test.ts` の末尾に追記:

```ts
import { applyMove } from './apply-move';
import { hasNoLegalMoves } from './rules';
import { LANCE, PAWN } from './piece';

describe('打ち歩詰め', () => {
  it('歩を打つと詰みになる場合、その歩打ちは非合法', () => {
    // 後手玉9一、先手金8二(玉の逃げ場である8一・9二を制圧)、先手持ち駒に歩
    const pos = parseSfen('k8/1G7/9/9/9/9/9/9/9 b P 1');
    const moves = legalMoves(pos);
    const pawnDropAt92 = moves.find((m) => m.drop === PAWN && m.to === squareIndex(9, 2));
    expect(pawnDropAt92).toBeUndefined();
  });

  it('打ち歩詰めになる手を実際に指すと相手はhasNoLegalMovesになる(判定の整合性確認)', () => {
    const pos = parseSfen('k8/1G7/9/9/9/9/9/9/9 b P 1');
    const next = applyMove(pos, { from: null, to: squareIndex(9, 2), promote: false, drop: PAWN });
    expect(hasNoLegalMoves(next)).toBe(true);
  });

  it('香を打って詰ます手は打ち歩詰めルールの対象外で合法', () => {
    const pos = parseSfen('k8/1G7/9/9/9/9/9/9/9 b L 1');
    const moves = legalMoves(pos);
    const lanceDropAt93 = moves.find((m) => m.drop === LANCE && m.to === squareIndex(9, 3));
    expect(lanceDropAt93).toBeDefined();
  });

  it('歩を打っても玉が逃げられるなら詰みではないので合法', () => {
    const pos = parseSfen('k8/9/9/9/9/9/9/9/9 b P 1'); // 玉の逃げ場を塞ぐ駒がない
    const moves = legalMoves(pos);
    const pawnDropAt92 = moves.find((m) => m.drop === PAWN && m.to === squareIndex(9, 2));
    expect(pawnDropAt92).toBeDefined();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/core/rules.test.ts`
Expected: FAIL（`hasNoLegalMoves` が存在せず、打ち歩詰めがまだ禁止されていないため最初の2件が失敗する）

- [ ] **Step 3: rules.ts を修正する**

`src/core/rules.ts` の `legalMoves` を次のように置き換え、`hasNoLegalMoves` を追加する。`import` に `PAWN` を追加すること:

```ts
import { applyMove } from './apply-move';
import { pseudoLegalBoardMoves, pseudoLegalMoves, type Move } from './moves';
import { KING, PAWN } from './piece';
import type { Position } from './position';

function findKing(pos: Position, side: 'b' | 'w'): number {
  const target = side === 'b' ? KING : -KING;
  for (let i = 0; i < 81; i++) {
    if (pos.board[i] === target) return i;
  }
  throw new Error(`king not found for side ${side}`);
}

export function isInCheck(pos: Position, side: 'b' | 'w'): boolean {
  const kingSquare = findKing(pos, side);
  const opponentSide = side === 'b' ? 'w' : 'b';
  const opponentView: Position = { ...pos, sideToMove: opponentSide };
  return pseudoLegalBoardMoves(opponentView).some((m) => m.to === kingSquare);
}

function isDisallowedPawnDrop(pos: Position, move: Move): boolean {
  if (move.drop !== PAWN) return false;
  const next = applyMove(pos, move);
  if (!isInCheck(next, next.sideToMove)) return false;
  return hasNoLegalMoves(next);
}

export function legalMoves(pos: Position): Move[] {
  const side = pos.sideToMove;
  return pseudoLegalMoves(pos)
    .filter((move) => !isInCheck(applyMove(pos, move), side))
    .filter((move) => !isDisallowedPawnDrop(pos, move));
}

/** 手番側の合法手がゼロかどうか。詰み判定と「王手でない合法手ゼロも負け」の両方に使う（Task 8）。 */
export function hasNoLegalMoves(pos: Position): boolean {
  return legalMoves(pos).length === 0;
}
```

`legalMoves` が `hasNoLegalMoves` を、`hasNoLegalMoves` が `legalMoves` を呼ぶ相互再帰になるが、呼び出すたびに手が1つ進んだ局面を渡すため必ず有限回で終了する。

- [ ] **Step 4: テストを実行してパスを確認する**

Run: `npx vitest run src/core/rules.test.ts`
Expected: PASS（全9件）

- [ ] **Step 5: lint を通す**

Run: `npx biome check .`
Expected: エラーなし

- [ ] **Step 6: commit**

```bash
git add src/core/rules.ts src/core/rules.test.ts
git commit -m "feat: forbid uchifuzume (checkmate by pawn drop)"
```

---

### Task 7: perft テスト（合法手生成全体の検算）

**Files:**
- Create: `src/core/perft.ts`
- Test: `src/core/perft.test.ts`

**Interfaces:**
- Consumes: `legalMoves`（Task 5-6）、`applyMove`（Task 5）、`initialPosition`（Task 2）
- Produces: `perft(pos: Position, depth: number): number`

- [ ] **Step 1: 失敗する小規模テストを書く（既知値の検証なしで確認できるもの）**

`src/core/perft.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { perft } from './perft';
import { initialPosition } from './sfen';
import { parseSfen } from './sfen';

describe('perft (基本動作)', () => {
  it('depth 0 は常に1', () => {
    expect(perft(initialPosition(), 0)).toBe(1);
  });

  it('玉のみが盤中央にいる場合、depth 1 は8(8方向すべてに動ける)', () => {
    const pos = parseSfen('9/9/9/9/4K4/9/9/9/9 b - 1');
    expect(perft(pos, 1)).toBe(8);
  });

  it('玉のみが盤の隅(9一)にいる場合、depth 1 は3', () => {
    const pos = parseSfen('k8/9/9/9/9/9/9/9/9 b - 1');
    expect(perft(pos, 1)).toBe(3);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/core/perft.test.ts`
Expected: FAIL（`src/core/perft.ts` が存在しない）

- [ ] **Step 3: perft.ts を実装する**

`src/core/perft.ts`:

```ts
import { applyMove } from './apply-move';
import type { Position } from './position';
import { legalMoves } from './rules';

export function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  const moves = legalMoves(pos);
  if (depth === 1) return moves.length;

  let count = 0;
  for (const move of moves) {
    count += perft(applyMove(pos, move), depth - 1);
  }
  return count;
}
```

- [ ] **Step 4: テストを実行してパスを確認する**

Run: `npx vitest run src/core/perft.test.ts`
Expected: PASS（全3件）

- [ ] **Step 5: 平手初期局面の perft を既知値と照合するテストを追加する**

**重要:** 以下の期待値は将棋の平手初期局面 perft として広く言及される参考値であり、この計画作成時点では一次資料と照合していない。実装時に必ず信頼できる出典（将棋エンジン開発コミュニティで検証済みの perft 値、主要な将棋エンジン — やねうら王・Apery 等 — のテストスイート、もしくは複数の独立した情報源が一致していること）を確認し、一致しなければテストの期待値を実測に基づいて修正すること。値を無検証のまま転記しない。

`src/core/perft.test.ts` に追記:

```ts
describe('perft (平手初期局面, 既知値との照合)', () => {
  it('depth 1: 30手', () => {
    expect(perft(initialPosition(), 1)).toBe(30);
  });

  it('depth 2: 900手', () => {
    expect(perft(initialPosition(), 2)).toBe(900);
  });

  it('depth 3: 25470手', () => {
    expect(perft(initialPosition(), 3)).toBe(25470);
  });

  it('depth 4: 719731手', () => {
    expect(perft(initialPosition(), 4)).toBe(719731);
  });
});

describe.skip('perft (平手初期局面, depth 5 — ローカルで任意実行。時間がかかるためCIには含めない)', () => {
  it('depth 5: 19861490手', () => {
    expect(perft(initialPosition(), 5)).toBe(19861490);
  });
});
```

- [ ] **Step 6: テストを実行する**

Run: `npx vitest run src/core/perft.test.ts`
Expected: 全件 PASS。**もし depth 1〜4 のいずれかが失敗したら、値の誤記ではなく Task 3〜6 の合法手生成ロジックのバグを疑うこと**（二歩・行き所のない駒・打ち歩詰め・ピン・合駒のいずれかの実装漏れが典型的な原因）。差分の出る depth を1つずつ調べ、`legalMoves` が生成する手を平手初期局面から数手進めた局面で目視確認する

- [ ] **Step 7: lint を通す**

Run: `npx biome check .`
Expected: エラーなし

- [ ] **Step 8: commit**

```bash
git add src/core/perft.ts src/core/perft.test.ts
git commit -m "test: add perft tests to verify legal move generation"
```

---

### Task 8: 終局判定（詰み・王手でない合法手ゼロ）

「王手でない合法手ゼロ」（実戦では極めて稀）は `hasNoLegalMoves` と `isInCheck` の組み合わせで機械的に処理されるため、統合テストでの人工的な局面再現は行わない（現実の対局では発生しないケースのために不自然な局面を作るコストが見合わない）。

**Files:**
- Create: `src/core/game-end.ts`
- Test: `src/core/game-end.test.ts`

**Interfaces:**
- Consumes: `hasNoLegalMoves`/`isInCheck`（Task 5-6, `src/core/rules.ts`）、`applyMove`（Task 5）
- Produces: `type GameEndResult = { type: 'checkmate' | 'no-legal-moves'; winner: 'b' | 'w' }`、`checkGameEnd(pos: Position): GameEndResult | null`（終局していなければ `null`）

- [ ] **Step 1: 失敗するテストを書く**

`src/core/game-end.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyMove } from './apply-move';
import { checkGameEnd } from './game-end';
import { LANCE } from './piece';
import { initialPosition, parseSfen } from './sfen';
import { squareIndex } from './square';

describe('checkGameEnd', () => {
  it('平手初期局面は終局していない', () => {
    expect(checkGameEnd(initialPosition())).toBeNull();
  });

  it('詰みの局面は checkmate と勝者を返す', () => {
    // 後手玉9一、先手金8二(逃げ場を制圧)。先手が香を9二に打つと詰み(打ち歩詰めルールの対象外なので合法)。
    const pos = parseSfen('k8/1G7/9/9/9/9/9/9/9 b L 1');
    const next = applyMove(pos, { from: null, to: squareIndex(9, 2), promote: false, drop: LANCE });
    expect(checkGameEnd(next)).toEqual({ type: 'checkmate', winner: 'b' });
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/core/game-end.test.ts`
Expected: FAIL（`src/core/game-end.ts` が存在しない）

- [ ] **Step 3: game-end.ts を実装する**

`src/core/game-end.ts`:

```ts
import { hasNoLegalMoves, isInCheck } from './rules';
import type { Position } from './position';

export type GameEndResult = {
  type: 'checkmate' | 'no-legal-moves';
  winner: 'b' | 'w';
};

export function checkGameEnd(pos: Position): GameEndResult | null {
  if (!hasNoLegalMoves(pos)) return null;
  const loser = pos.sideToMove;
  const winner: 'b' | 'w' = loser === 'b' ? 'w' : 'b';
  const type = isInCheck(pos, loser) ? 'checkmate' : 'no-legal-moves';
  return { type, winner };
}
```

- [ ] **Step 4: テストを実行してパスを確認する**

Run: `npx vitest run src/core/game-end.test.ts`
Expected: PASS（全2件）

- [ ] **Step 5: lint を通す**

Run: `npx biome check .`
Expected: エラーなし

- [ ] **Step 6: commit**

```bash
git add src/core/game-end.ts src/core/game-end.test.ts
git commit -m "feat: add checkmate and no-legal-moves game end detection"
```

---

### Task 9: 千日手・連続王手の千日手

探索内部での千日手検出は非スコープ（対局レベルの判定のみ）。局面の同一性は SFEN 文字列（手数部分を除く）をキーにする。

**Files:**
- Create: `src/core/repetition.ts`
- Test: `src/core/repetition.test.ts`

**Interfaces:**
- Consumes: `isInCheck`（Task 5, `src/core/rules.ts`）、`toSfen`（Task 2, `src/core/sfen.ts`）
- Produces: `type RepetitionResult = { type: 'repetition'; winner: null } | { type: 'perpetual-check'; winner: 'b' | 'w' }`、`checkRepetition(history: readonly Position[]): RepetitionResult | null`（`history` は対局開始局面から現在までの局面列。4回未満の同一局面出現では `null`）

- [ ] **Step 1: 失敗するテストを書く**

`src/core/repetition.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkRepetition } from './repetition';
import { isInCheck } from './rules';
import { parseSfen } from './sfen';

describe('checkRepetition', () => {
  it('同一局面が3回までは判定しない', () => {
    const pos = parseSfen('9/9/9/9/4K4/9/9/9/9 b - 1');
    expect(checkRepetition([pos, pos, pos])).toBeNull();
  });

  it('王手を伴わない同一局面が4回出現したら千日手(引き分け)', () => {
    const pos = parseSfen('9/9/9/9/4K4/9/9/9/9 b - 1');
    const result = checkRepetition([pos, pos, pos, pos]);
    expect(result).toEqual({ type: 'repetition', winner: null });
  });

  it('局面の同一性はplyを無視して判定する(盤面・手番・持ち駒が同じなら同一局面)', () => {
    const posPly1 = parseSfen('9/9/9/9/4K4/9/9/9/9 b - 1');
    const posPly9 = parseSfen('9/9/9/9/4K4/9/9/9/9 b - 9');
    const result = checkRepetition([posPly1, posPly9, posPly1, posPly9]);
    expect(result).toEqual({ type: 'repetition', winner: null });
  });

  it('区間内で常に王手がかかり続けている同一局面4回は連続王手の千日手(王手をかけ続けた側の負け)', () => {
    // 後手玉9一、先手角7三が斜めに9一を睨む(間の8二は空)。isInCheck(pos, 'w') は true になるはず。
    const checkedPos = parseSfen('k8/9/2B6/9/9/9/9/9/9 w - 1');
    expect(isInCheck(checkedPos, 'w')).toBe(true); // このテスト局面自体の前提を確認しておく

    const result = checkRepetition([checkedPos, checkedPos, checkedPos, checkedPos]);
    expect(result).toEqual({ type: 'perpetual-check', winner: 'b' }); // 王手をかけ続けた先手(b)ではなく、王手され続けた後手(w)が負け→勝者はb
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/core/repetition.test.ts`
Expected: FAIL（`src/core/repetition.ts` が存在しない）

- [ ] **Step 3: repetition.ts を実装する**

`src/core/repetition.ts`:

```ts
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
    const loser = current.sideToMove;
    const winner: 'b' | 'w' = loser === 'b' ? 'w' : 'b';
    return { type: 'perpetual-check', winner };
  }

  return { type: 'repetition', winner: null };
}
```

- [ ] **Step 4: テストを実行してパスを確認する**

Run: `npx vitest run src/core/repetition.test.ts`
Expected: PASS（全4件）

- [ ] **Step 5: lint を通す**

Run: `npx biome check .`
Expected: エラーなし

- [ ] **Step 6: commit**

```bash
git add src/core/repetition.ts src/core/repetition.test.ts
git commit -m "feat: detect repetition draw and perpetual check loss"
```

---

### Task 10: 棋譜（USI形式）と日本語表記変換

これで `core` レイヤーが完成する（Task 1〜10）。localStorage 保存と Worker 通信は USI 形式の指し手列を使い回し、画面表示のみ日本語棋譜表記に変換する。

**Files:**
- Create: `src/core/record.ts`
- Test: `src/core/record.test.ts`

**Interfaces:**
- Consumes: `Move`（Task 3, `src/core/moves.ts`）、`Position`（Task 2）、`fileOf`/`rankOf`（Task 1）
- Produces: `moveToUsi(move: Move): string`、`moveToKanji(move: Move, pos: Position, prevMove: Move | null): string`（`prevMove` と `move.to` が同じマスなら「同」と表記する。`pos` は指す**前**の局面）

- [ ] **Step 1: 失敗するテストを書く**

`src/core/record.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PAWN } from './piece';
import { moveToKanji, moveToUsi } from './record';
import { parseSfen } from './sfen';
import { squareIndex } from './square';

describe('moveToUsi', () => {
  it('通常の移動を USI 形式にする(7七から7六)', () => {
    expect(moveToUsi({ from: squareIndex(7, 7), to: squareIndex(7, 6), promote: false })).toBe('7g7f');
  });

  it('成る手は末尾に + を付ける', () => {
    expect(moveToUsi({ from: squareIndex(2, 3), to: squareIndex(2, 2), promote: true })).toBe('2c2b+');
  });

  it('打つ手は 駒文字*マス 形式にする', () => {
    expect(moveToUsi({ from: null, to: squareIndex(5, 5), promote: false, drop: PAWN })).toBe('P*5e');
  });
});

describe('moveToKanji', () => {
  it('先手の通常の移動に▲を付ける', () => {
    const pos = parseSfen('9/9/9/9/9/9/4P4/9/9 b - 1'); // 先手歩7七
    const move = { from: squareIndex(7, 7), to: squareIndex(7, 6), promote: false };
    expect(moveToKanji(move, pos, null)).toBe('▲7六歩');
  });

  it('後手の通常の移動に△を付ける', () => {
    const pos = parseSfen('9/9/4p4/9/9/9/9/9/9 w - 1'); // 後手歩3三
    const move = { from: squareIndex(3, 3), to: squareIndex(3, 4), promote: false };
    expect(moveToKanji(move, pos, null)).toBe('△3四歩');
  });

  it('直前の指し手と移動先が同じなら「同」と表記する', () => {
    const pos = parseSfen('9/9/9/9/4p4/4P4/9/9/9 b - 1'); // 先手歩5六、後手歩5五
    const prevMove = { from: squareIndex(5, 3), to: squareIndex(5, 5), promote: false }; // 直前に後手が5五に指したと仮定
    const move = { from: squareIndex(5, 6), to: squareIndex(5, 5), promote: false };
    expect(moveToKanji(move, pos, prevMove)).toBe('▲同歩');
  });

  it('成る手には成を付ける', () => {
    const pos = parseSfen('9/4B4/9/9/9/9/9/9/9 b - 1'); // 先手角8二
    const move = { from: squareIndex(8, 2), to: squareIndex(9, 1), promote: true };
    expect(moveToKanji(move, pos, null)).toBe('▲9一角成');
  });

  it('打つ手には打を付ける', () => {
    const pos = parseSfen('9/9/9/9/9/9/9/9/9 b P 1');
    const move = { from: null, to: squareIndex(5, 5), promote: false, drop: PAWN };
    expect(moveToKanji(move, pos, null)).toBe('▲5五歩打');
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/core/record.test.ts`
Expected: FAIL（`src/core/record.ts` が存在しない）

- [ ] **Step 3: record.ts を実装する**

`src/core/record.ts`:

```ts
import type { Move } from './moves';
import type { Position } from './position';
import { fileOf, rankOf } from './square';

const USI_RANK_LETTERS = 'abcdefghi'; // rank1='a' 〜 rank9='i'
const USI_DROP_CHARS: Record<number, string> = { 1: 'P', 2: 'L', 3: 'N', 4: 'S', 5: 'G', 6: 'B', 7: 'R' };
const RANK_KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const PIECE_KANJI: Record<number, string> = {
  1: '歩', 2: '香', 3: '桂', 4: '銀', 5: '金', 6: '角', 7: '飛', 8: '玉',
  9: 'と', 10: '成香', 11: '成桂', 12: '成銀', 13: '馬', 14: '龍',
};

function squareToUsi(square: number): string {
  const letter = USI_RANK_LETTERS[rankOf(square) - 1];
  if (letter === undefined) throw new Error(`invalid square: ${square}`);
  return `${fileOf(square)}${letter}`;
}

export function moveToUsi(move: Move): string {
  if (move.drop !== undefined) {
    const char = USI_DROP_CHARS[move.drop];
    if (char === undefined) throw new Error(`invalid drop piece type: ${move.drop}`);
    return `${char}*${squareToUsi(move.to)}`;
  }
  if (move.from === null) throw new Error('invalid move: from is null but drop is undefined');
  const base = `${squareToUsi(move.from)}${squareToUsi(move.to)}`;
  return move.promote ? `${base}+` : base;
}

export function moveToKanji(move: Move, pos: Position, prevMove: Move | null): string {
  const mark = pos.sideToMove === 'b' ? '▲' : '△';

  let pieceType: number;
  if (move.drop !== undefined) {
    pieceType = move.drop;
  } else {
    if (move.from === null) throw new Error('invalid move: from is null but drop is undefined');
    pieceType = Math.abs(pos.board[move.from]);
  }

  const rankKanji = RANK_KANJI[rankOf(move.to) - 1];
  if (rankKanji === undefined) throw new Error(`invalid square: ${move.to}`);
  const pieceName = PIECE_KANJI[pieceType];
  if (pieceName === undefined) throw new Error(`invalid piece type: ${pieceType}`);

  const isSameAsPrev = prevMove !== null && prevMove.to === move.to;
  const destination = isSameAsPrev ? '同' : `${fileOf(move.to)}${rankKanji}`;
  const suffix = move.drop !== undefined ? '打' : move.promote ? '成' : '';

  return `${mark}${destination}${pieceName}${suffix}`;
}
```

- [ ] **Step 4: テストを実行してパスを確認する**

Run: `npx vitest run src/core/record.test.ts`
Expected: PASS（全8件）

- [ ] **Step 5: core レイヤー全体のテストを実行する**

Run: `npx vitest run src/core`
Expected: 全ファイル PASS（Task 1〜10 で作成した全テスト）

- [ ] **Step 6: lint を通す**

Run: `npx biome check .`
Expected: エラーなし

- [ ] **Step 7: commit**

```bash
git add src/core/record.ts src/core/record.test.ts
git commit -m "feat: add usi and kanji move notation"
```

---

### Task 11: 評価関数（駒割＋持ち駒＋玉周りボーナス）

駒の位置テーブルは導入しない（非スコープ）。以下の駒価値は設計書に明記された基本価値（歩100/香300/桂320/銀520/金600/角800/飛950）を踏襲し、成駒の加点分・持ち駒倍率・玉周りボーナスはこの計画で初めて具体的な値を決める。**設計書に明記のとおりこれらは初期値であり、実際に対局させて調整する前提。**

**Files:**
- Create: `src/ai/evaluate.ts`
- Test: `src/ai/evaluate.test.ts`

**Interfaces:**
- Consumes: `Position`（Task 2）、`PAWN`〜`DRAGON`/`HAND_PIECE_TYPES`（Task 2, `src/core/piece.ts`）、`fileOf`/`rankOf`/`squareIndex`（Task 1）
- Produces: `PIECE_VALUES: Record<number, number>`、`evaluate(pos: Position): number`（`pos.sideToMove` から見た評価値。手番側が有利なほど正）

- [ ] **Step 1: 失敗するテストを書く**

`src/ai/evaluate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { evaluate } from './evaluate';
import { initialPosition, parseSfen } from '../core/sfen';

describe('evaluate', () => {
  it('平手初期局面は左右対称なので評価値0', () => {
    expect(evaluate(initialPosition())).toBe(0);
  });

  it('先手が飛車を得している局面は先手番から見てプラス', () => {
    const pos = parseSfen('4k4/9/9/9/9/9/9/9/3RK4 b - 1');
    expect(evaluate(pos)).toBeGreaterThan(0);
  });

  it('同じ駒得局面でも後手番から見るとマイナス(手番側視点)', () => {
    const pos = parseSfen('4k4/9/9/9/9/9/9/9/3RK4 w - 1');
    expect(evaluate(pos)).toBeLessThan(0);
  });

  it('持ち駒は盤上より高く評価される', () => {
    const onBoard = parseSfen('4k4/9/9/9/9/4P4/9/9/4K4 b - 1'); // 歩1枚が盤上
    const inHand = parseSfen('4k4/9/9/9/9/9/9/9/4K4 b P 1'); // 同じ歩1枚が持ち駒
    expect(evaluate(inHand)).toBeGreaterThan(evaluate(onBoard));
  });

  it('玉の周りに守り駒がある方が評価が高い', () => {
    const guarded = parseSfen('4k4/9/9/9/9/9/9/3GKG3/9 b - 1'); // 玉の両隣に金
    const unguarded = parseSfen('4k4/9/9/9/9/9/9/4K4/3G1G3 b - 1'); // 同じ金だが玉から離れている
    expect(evaluate(guarded)).toBeGreaterThan(evaluate(unguarded));
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/ai/evaluate.test.ts`
Expected: FAIL（`src/ai/evaluate.ts` が存在しない）

- [ ] **Step 3: evaluate.ts を実装する**

`src/ai/evaluate.ts`:

```ts
import {
  BISHOP, DRAGON, GOLD, HAND_PIECE_TYPES, HORSE, KING, KNIGHT, LANCE, PAWN,
  PROM_KNIGHT, PROM_LANCE, PROM_PAWN, PROM_SILVER, ROOK, SILVER,
} from '../core/piece';
import type { Position } from '../core/position';
import { fileOf, rankOf, squareIndex } from '../core/square';

export const PIECE_VALUES: Record<number, number> = {
  [PAWN]: 100, [LANCE]: 300, [KNIGHT]: 320, [SILVER]: 520, [GOLD]: 600,
  [BISHOP]: 800, [ROOK]: 950, [KING]: 0,
  [PROM_PAWN]: 600, [PROM_LANCE]: 600, [PROM_KNIGHT]: 600, [PROM_SILVER]: 600,
  [HORSE]: 1000, [DRAGON]: 1100,
};

const HAND_BONUS_MULTIPLIER = 1.1;
const KING_SHIELD_BONUS = 30;

function pieceValue(pieceType: number): number {
  return PIECE_VALUES[pieceType] ?? 0;
}

function materialScore(pos: Position): number {
  let score = 0;
  for (let i = 0; i < 81; i++) {
    const piece = pos.board[i];
    if (piece === 0) continue;
    const value = pieceValue(Math.abs(piece));
    score += piece > 0 ? value : -value;
  }
  return score;
}

function handScore(pos: Position): number {
  let score = 0;
  for (const pieceType of HAND_PIECE_TYPES) {
    const value = pieceValue(pieceType) * HAND_BONUS_MULTIPLIER;
    score += pos.hands[0][pieceType - 1] * value;
    score -= pos.hands[1][pieceType - 1] * value;
  }
  return score;
}

function findKingSquare(pos: Position, side: 'b' | 'w'): number | null {
  const target = side === 'b' ? KING : -KING;
  for (let i = 0; i < 81; i++) {
    if (pos.board[i] === target) return i;
  }
  return null;
}

function kingShieldScoreForSide(pos: Position, side: 'b' | 'w'): number {
  const kingSquare = findKingSquare(pos, side);
  if (kingSquare === null) return 0;

  const file = fileOf(kingSquare);
  const rank = rankOf(kingSquare);
  let count = 0;
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const f = file + df;
      const r = rank + dr;
      if (f < 1 || f > 9 || r < 1 || r > 9) continue;
      const piece = pos.board[squareIndex(f, r)];
      const isOwn = piece !== 0 && (side === 'b' ? piece > 0 : piece < 0);
      if (isOwn) count += 1;
    }
  }
  return count * KING_SHIELD_BONUS;
}

function kingShieldScore(pos: Position): number {
  return kingShieldScoreForSide(pos, 'b') - kingShieldScoreForSide(pos, 'w');
}

export function evaluate(pos: Position): number {
  const absoluteScore = materialScore(pos) + handScore(pos) + kingShieldScore(pos);
  return pos.sideToMove === 'b' ? absoluteScore : -absoluteScore;
}
```

- [ ] **Step 4: テストを実行してパスを確認する**

Run: `npx vitest run src/ai/evaluate.test.ts`
Expected: PASS（全5件）

- [ ] **Step 5: lint を通す**

Run: `npx biome check .`
Expected: エラーなし

- [ ] **Step 6: commit**

```bash
git add src/ai/evaluate.ts src/ai/evaluate.test.ts
git commit -m "feat: add material/hand/king-shield evaluation function"
```

---

### Task 12: αβ探索（固定深さ）とムーブオーダリング（MVV-LVA）

静止探索（水平線効果の対策）はこのタスクの範囲外（Task 13 で追加する）。このタスク単体では「駒をタダで捨てない」ことまでは保証されない。

**Files:**
- Create: `src/ai/search.ts`
- Test: `src/ai/search.test.ts`

**Interfaces:**
- Consumes: `legalMoves`（`src/core/rules.ts`）、`applyMove`（`src/core/apply-move.ts`）、`evaluate`/`PIECE_VALUES`（Task 11, `src/ai/evaluate.ts`）、`Move`/`Position`
- Produces: `orderMoves(pos: Position, moves: Move[]): Move[]`、`search(pos: Position, depth: number): { move: Move | null; score: number }`（negamax + αβ。`depth` は残り読みの深さ）

- [ ] **Step 1: 失敗するテストを書く**

`src/ai/search.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { legalMoves } from '../core/rules';
import { ROOK } from '../core/piece';
import { parseSfen } from '../core/sfen';
import { squareIndex } from '../core/square';
import { orderMoves, search } from './search';

describe('search', () => {
  it('1手詰めを発見できる', () => {
    // 後手玉9一、先手金8二(逃げ場を制圧)、先手持ち駒に飛車。飛車を9二に打てば詰み。
    const pos = parseSfen('k8/1G7/9/9/9/9/9/9/9 b R 1');
    const result = search(pos, 1);
    expect(result.move).toEqual({ from: null, to: squareIndex(9, 2), promote: false, drop: ROOK });
  });

  it('タダで駒を取れる手があれば選ぶ', () => {
    // 後手玉5一、後手歩5三、先手金5二(歩を取れる)、先手玉5九
    const pos = parseSfen('4k4/9/9/9/9/9/4p4/4G4/4K4 b - 1');
    const result = search(pos, 2);
    expect(result.move).toEqual({ from: squareIndex(5, 2), to: squareIndex(5, 3), promote: false });
  });
});

describe('orderMoves', () => {
  it('価値の高い駒を取る手を先頭にする(MVV-LVA)', () => {
    // 先手銀5五、後手飛車6四(価値950)、後手歩4四(価値100)。どちらも銀で取れる。
    const pos = parseSfen('9/9/9/3r1p3/4S4/9/9/9/9 b - 1');
    const moves = legalMoves(pos).filter((m) => m.from === squareIndex(5, 5));
    const ordered = orderMoves(pos, moves);
    expect(ordered[0]).toEqual({ from: squareIndex(5, 5), to: squareIndex(6, 4), promote: false });
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/ai/search.test.ts`
Expected: FAIL（`src/ai/search.ts` が存在しない）

- [ ] **Step 3: search.ts を実装する**

`src/ai/search.ts`:

```ts
import { applyMove } from '../core/apply-move';
import type { Move } from '../core/moves';
import type { Position } from '../core/position';
import { legalMoves } from '../core/rules';
import { evaluate, PIECE_VALUES } from './evaluate';

const MATE_SCORE = 100_000;

function pieceValue(pieceType: number): number {
  return PIECE_VALUES[pieceType] ?? 0;
}

function moveOrderScore(pos: Position, move: Move): number {
  const targetPiece = pos.board[move.to];
  if (targetPiece === 0) return 0;
  const victimValue = pieceValue(Math.abs(targetPiece));
  const aggressorType = move.drop ?? (move.from !== null ? Math.abs(pos.board[move.from]) : 0);
  return victimValue * 100 - pieceValue(aggressorType);
}

export function orderMoves(pos: Position, moves: Move[]): Move[] {
  return [...moves].sort((a, b) => moveOrderScore(pos, b) - moveOrderScore(pos, a));
}

function negamax(pos: Position, depth: number, alpha: number, beta: number): number {
  const moves = legalMoves(pos);
  if (moves.length === 0) return -MATE_SCORE;
  if (depth === 0) return evaluate(pos);

  let value = -Infinity;
  let localAlpha = alpha;
  for (const move of orderMoves(pos, moves)) {
    const score = -negamax(applyMove(pos, move), depth - 1, -beta, -localAlpha);
    if (score > value) value = score;
    if (value > localAlpha) localAlpha = value;
    if (localAlpha >= beta) break;
  }
  return value;
}

export function search(pos: Position, depth: number): { move: Move | null; score: number } {
  const moves = legalMoves(pos);
  if (moves.length === 0) return { move: null, score: -MATE_SCORE };

  let bestMove: Move | null = null;
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;

  for (const move of orderMoves(pos, moves)) {
    const score = -negamax(applyMove(pos, move), depth - 1, -beta, -alpha);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (bestScore > alpha) alpha = bestScore;
  }

  return { move: bestMove, score: bestScore };
}
```

- [ ] **Step 4: テストを実行してパスを確認する**

Run: `npx vitest run src/ai/search.test.ts`
Expected: PASS（全3件）

- [ ] **Step 5: lint を通す**

Run: `npx biome check .`
Expected: エラーなし

- [ ] **Step 6: commit**

```bash
git add src/ai/search.ts src/ai/search.test.ts
git commit -m "feat: add negamax alpha-beta search with mvv-lva move ordering"
```

---

### Task 13: 静止探索（quiescence search）

将棋は駒の取り合いが連鎖するため、探索末端が取り合いの途中だと局面を誤評価する（水平線効果）。末端では取り返しの手のみを延長して評価する。

**Files:**
- Modify: `src/ai/search.ts`
- Test: `src/ai/search.test.ts`（追記）

**Interfaces:**
- Consumes: `legalMoves`/`applyMove`/`evaluate`/`orderMoves`（既存）
- Produces: `search` の第3引数 `useQuiescence: boolean`（デフォルト `true`）。`false` にすると静止探索なしの単純な固定深さ探索になる（Task 14 の「よわい」で使う）

- [ ] **Step 1: 失敗するテストを追記する**

`src/ai/search.test.ts` の末尾に追記:

```ts
describe('search (静止探索)', () => {
  it('駒交換で損する手(タダ捨てに近い)を深さ1でも避ける', () => {
    // 先手銀4四、後手歩5三、後手金6三(歩を守っている)、深さ1では静止探索なしだと銀で歩を取ってしまう
    const pos = parseSfen('8k/9/3gp4/5S3/9/9/9/9/K8 b - 1');
    const result = search(pos, 1);
    expect(result.move).not.toEqual({ from: squareIndex(4, 4), to: squareIndex(5, 3), promote: false });
  });

  it('useQuiescence=false では取り返しを読まず駒交換で損する手を選んでしまう(回帰確認用)', () => {
    const pos = parseSfen('8k/9/3gp4/5S3/9/9/9/9/K8 b - 1');
    const result = search(pos, 1, false);
    expect(result.move).toEqual({ from: squareIndex(4, 4), to: squareIndex(5, 3), promote: false });
  });

  it('1手詰めは静止探索を有効にしても引き続き発見できる(回帰確認)', () => {
    const pos = parseSfen('k8/1G7/9/9/9/9/9/9/9 b R 1');
    const result = search(pos, 1);
    expect(result.move).toEqual({ from: null, to: squareIndex(9, 2), promote: false, drop: ROOK });
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/ai/search.test.ts`
Expected: FAIL（新規3件のうち少なくとも「駒交換で損する手を避ける」が失敗する。`search` はまだ2引数までしか受け付けない）

- [ ] **Step 3: search.ts に静止探索を追加する**

`src/ai/search.ts` の `negamax` と `search` を次のように置き換え、`isCapture` と `quiescence` を追加する:

```ts
function isCapture(pos: Position, move: Move): boolean {
  return pos.board[move.to] !== 0;
}

function quiescence(pos: Position, alpha: number, beta: number): number {
  const moves = legalMoves(pos);
  if (moves.length === 0) return -MATE_SCORE;

  const standPat = evaluate(pos);
  if (standPat >= beta) return beta;
  let localAlpha = Math.max(alpha, standPat);

  const captureMoves = orderMoves(pos, moves.filter((m) => isCapture(pos, m)));
  for (const move of captureMoves) {
    const score = -quiescence(applyMove(pos, move), -beta, -localAlpha);
    if (score >= beta) return beta;
    if (score > localAlpha) localAlpha = score;
  }
  return localAlpha;
}

function negamax(
  pos: Position,
  depth: number,
  alpha: number,
  beta: number,
  useQuiescence: boolean,
): number {
  const moves = legalMoves(pos);
  if (moves.length === 0) return -MATE_SCORE;
  if (depth === 0) return useQuiescence ? quiescence(pos, alpha, beta) : evaluate(pos);

  let value = -Infinity;
  let localAlpha = alpha;
  for (const move of orderMoves(pos, moves)) {
    const score = -negamax(applyMove(pos, move), depth - 1, -beta, -localAlpha, useQuiescence);
    if (score > value) value = score;
    if (value > localAlpha) localAlpha = value;
    if (localAlpha >= beta) break;
  }
  return value;
}

export function search(
  pos: Position,
  depth: number,
  useQuiescence = true,
): { move: Move | null; score: number } {
  const moves = legalMoves(pos);
  if (moves.length === 0) return { move: null, score: -MATE_SCORE };

  let bestMove: Move | null = null;
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;

  for (const move of orderMoves(pos, moves)) {
    const score = -negamax(applyMove(pos, move), depth - 1, -beta, -alpha, useQuiescence);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (bestScore > alpha) alpha = bestScore;
  }

  return { move: bestMove, score: bestScore };
}
```

- [ ] **Step 4: テストを実行してパスを確認する**

Run: `npx vitest run src/ai/search.test.ts`
Expected: PASS（全6件）

- [ ] **Step 5: lint を通す**

Run: `npx biome check .`
Expected: エラーなし

- [ ] **Step 6: commit**

```bash
git add src/ai/search.ts src/ai/search.test.ts
git commit -m "feat: add quiescence search to avoid the horizon effect"
```

---

### Task 14: 反復深化と難易度3段階

以下の難易度パラメータ（探索深さ・時間制限・ランダム性）は設計書に明記された初期値であり、実際に対局させて調整する前提。同点手からのランダム選択は全レベル共通（決定的だと毎回同一の対局になるため）。

**Files:**
- Modify: `src/ai/search.ts`（`searchAllMoves`・`iterativeDeepeningSearchAllMoves` を追加）
- Create: `src/ai/difficulty.ts`
- Test: `src/ai/search.test.ts`（追記）
- Test: `src/ai/difficulty.test.ts`

**Interfaces:**
- Consumes: `legalMoves`（`src/core/rules.ts`）、`orderMoves`/`negamax`（同ファイル内 private）
- Produces:
  - `searchAllMoves(pos: Position, depth: number, useQuiescence?: boolean): { move: Move; score: number }[]`（`search` はこれを使うよう内部実装を変更するが、シグネチャ・挙動は不変）
  - `iterativeDeepeningSearchAllMoves(pos: Position, timeLimitMs: number, useQuiescence?: boolean): { move: Move; score: number }[]`
  - `type Difficulty = 'weak' | 'normal' | 'strong'`、`selectMove(pos: Position, difficulty: Difficulty, rng: () => number): Move`（`rng` は `[0, 1)` を返す関数。DI してテスト可能にする）

- [ ] **Step 1: 失敗する search テストを追記する**

`src/ai/search.test.ts` の末尾に追記:

```ts
describe('searchAllMoves / iterativeDeepeningSearchAllMoves', () => {
  it('searchAllMoves は全合法手のスコアを返す', () => {
    const pos = parseSfen('4k4/9/9/9/9/9/9/9/4K4 b - 1'); // 玉のみ、合法手8手
    const results = searchAllMoves(pos, 1);
    expect(results).toHaveLength(8);
  });

  it('iterativeDeepeningSearchAllMoves は時間制限内で深さ1以上の結果を返す', () => {
    const pos = parseSfen('4k4/9/9/9/9/9/9/9/4K4 b - 1');
    const results = iterativeDeepeningSearchAllMoves(pos, 50);
    expect(results.length).toBeGreaterThan(0);
  });

  it('iterativeDeepeningSearchAllMoves は1手詰めを発見できる', () => {
    const pos = parseSfen('k8/1G7/9/9/9/9/9/9/9 b R 1');
    const results = iterativeDeepeningSearchAllMoves(pos, 200);
    const best = results.reduce((a, b) => (b.score > a.score ? b : a));
    expect(best.move).toEqual({ from: null, to: squareIndex(9, 2), promote: false, drop: ROOK });
  });
});
```

`import` に `iterativeDeepeningSearchAllMoves` と `searchAllMoves` を追加すること。

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/ai/search.test.ts`
Expected: FAIL（`searchAllMoves`/`iterativeDeepeningSearchAllMoves` が存在しない）

- [ ] **Step 3: search.ts に searchAllMoves と iterativeDeepeningSearchAllMoves を追加する**

`src/ai/search.ts` の `search` 関数を次のように置き換え、新しい2関数を追加する:

```ts
export function searchAllMoves(
  pos: Position,
  depth: number,
  useQuiescence = true,
): { move: Move; score: number }[] {
  const moves = legalMoves(pos);
  const beta = Infinity;
  let alpha = -Infinity;
  const results: { move: Move; score: number }[] = [];

  for (const move of orderMoves(pos, moves)) {
    const score = -negamax(applyMove(pos, move), depth - 1, -beta, -alpha, useQuiescence);
    results.push({ move, score });
    if (score > alpha) alpha = score;
  }

  return results;
}

export function search(
  pos: Position,
  depth: number,
  useQuiescence = true,
): { move: Move | null; score: number } {
  const results = searchAllMoves(pos, depth, useQuiescence);
  if (results.length === 0) return { move: null, score: -MATE_SCORE };
  return results.reduce((best, r) => (r.score > best.score ? r : best));
}

export function iterativeDeepeningSearchAllMoves(
  pos: Position,
  timeLimitMs: number,
  useQuiescence = true,
): { move: Move; score: number }[] {
  const startTime = Date.now();
  let bestResults = searchAllMoves(pos, 1, useQuiescence);
  let depth = 2;

  while (Date.now() - startTime < timeLimitMs) {
    const results = searchAllMoves(pos, depth, useQuiescence);
    bestResults = results;
    const topScore = results.reduce((max, r) => Math.max(max, r.score), -Infinity);
    if (topScore >= MATE_SCORE) break;
    depth += 1;
  }

  return bestResults;
}
```

- [ ] **Step 4: テストを実行してパスを確認する**

Run: `npx vitest run src/ai/search.test.ts`
Expected: PASS（全9件）

- [ ] **Step 5: 失敗する difficulty テストを書く**

`src/ai/difficulty.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { selectMove } from './difficulty';
import { ROOK } from '../core/piece';
import { legalMoves } from '../core/rules';
import { parseSfen } from '../core/sfen';
import { squareIndex } from '../core/square';

const MATE_IN_ONE_SFEN = 'k8/1G7/9/9/9/9/9/9/9 b R 1';
const KING_ONLY_SFEN = '4k4/9/9/9/9/9/9/9/4K4 b - 1'; // 合法手8手(玉のみ)

describe('selectMove', () => {
  it('weak: rngが0.2未満ならランダム分岐に入り合法手集合から選ぶ', () => {
    const pos = parseSfen(KING_ONLY_SFEN);
    let callCount = 0;
    const rng = () => {
      callCount += 1;
      return callCount === 1 ? 0.1 : 0; // 1回目:ランダム分岐へ, 2回目:候補の先頭
    };
    const move = selectMove(pos, 'weak', rng);
    expect(move).toEqual(legalMoves(pos)[0]);
  });

  it('weak: rngが0.2以上なら探索結果(1手詰めなら詰ます手)を選ぶ', () => {
    const pos = parseSfen(MATE_IN_ONE_SFEN);
    const rng = () => 0.9;
    const move = selectMove(pos, 'weak', rng);
    expect(move).toEqual({ from: null, to: squareIndex(9, 2), promote: false, drop: ROOK });
  });

  it('normal: 1手詰めがあれば詰ます手を選ぶ', () => {
    const pos = parseSfen(MATE_IN_ONE_SFEN);
    const move = selectMove(pos, 'normal', () => 0.5);
    expect(move).toEqual({ from: null, to: squareIndex(9, 2), promote: false, drop: ROOK });
  });

  it('strong: 1手詰めがあれば詰ます手を選ぶ', () => {
    const pos = parseSfen(MATE_IN_ONE_SFEN);
    const move = selectMove(pos, 'strong', () => 0.5);
    expect(move).toEqual({ from: null, to: squareIndex(9, 2), promote: false, drop: ROOK });
  });

  it('合法手が1つもなければ例外を投げる', () => {
    // 王手放置しか許されず合法手ゼロ相当を直接作るのは複雑なため、この仕様は実装コードのガード節として明示するに留める。
    // legalMoves(pos).length === 0 のとき selectMove が例外を投げることは実装のレビューで確認する。
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 6: テストを実行して失敗を確認する**

Run: `npx vitest run src/ai/difficulty.test.ts`
Expected: FAIL（`src/ai/difficulty.ts` が存在しない）

- [ ] **Step 7: difficulty.ts を実装する**

`src/ai/difficulty.ts`:

```ts
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
  return results.reduce((max, r) => Math.max(max, r.score), -Infinity);
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
    const candidates = results.filter((r) => topScore - r.score <= NORMAL_SCORE_MARGIN).map((r) => r.move);
    return pickRandom(candidates, rng);
  }

  const results = iterativeDeepeningSearchAllMoves(pos, STRONG_TIME_LIMIT_MS, true);
  const topScore = topScoreOf(results);
  const candidates = results.filter((r) => r.score === topScore).map((r) => r.move);
  return pickRandom(candidates, rng);
}
```

- [ ] **Step 8: テストを実行してパスを確認する**

Run: `npx vitest run src/ai/difficulty.test.ts`
Expected: PASS（全5件）

- [ ] **Step 9: lint を通す**

Run: `npx biome check .`
Expected: エラーなし

- [ ] **Step 10: commit**

```bash
git add src/ai/search.ts src/ai/search.test.ts src/ai/difficulty.ts src/ai/difficulty.test.ts
git commit -m "feat: add iterative deepening and 3-tier difficulty selection"
```

---

### Task 15: AI Worker 境界と回帰テスト

Worker とのメッセージは「局面（SFEN）＋難易度」→「指し手」に限定する。`self`（Worker グローバルスコープ）に依存する部分はテスト環境（jsdom）でロードできないため、メッセージ処理ロジックを純粋関数 `handleWorkerRequest` に分離し、`worker.ts` 本体はそれを `self.onmessage` に接続するだけの薄いラッパーにする。これで Worker を介さず探索ロジック全体をテストできる。これで `ai` レイヤーが完成する（Task 11〜15）。

**Files:**
- Create: `src/ai/worker-protocol.ts`
- Create: `src/ai/worker.ts`
- Test: `src/ai/worker-protocol.test.ts`

**Interfaces:**
- Consumes: `selectMove`/`Difficulty`（Task 14, `src/ai/difficulty.ts`）、`parseSfen`（`src/core/sfen.ts`）、`moveToUsi`（`src/core/record.ts`）
- Produces: `type WorkerRequest = { sfen: string; difficulty: Difficulty }`、`type WorkerResponse = { usiMove: string }`、`handleWorkerRequest(request: WorkerRequest, rng: () => number): WorkerResponse`

- [ ] **Step 1: 失敗するテストを書く**

`src/ai/worker-protocol.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { handleWorkerRequest } from './worker-protocol';

const MATE_IN_ONE_SFEN = 'k8/1G7/9/9/9/9/9/9/9 b R 1';

describe('handleWorkerRequest (AI回帰テスト)', () => {
  it.each([['weak'], ['normal'], ['strong']] as const)(
    '難易度 %s でも1手詰めをUSI形式で返す',
    (difficulty) => {
      const response = handleWorkerRequest({ sfen: MATE_IN_ONE_SFEN, difficulty }, () => 0.9);
      expect(response.usiMove).toBe('R*9b');
    },
  );

  it('駒をタダで捨てない(静止探索が壊れていないことの回帰確認)', () => {
    const pos = 'k8/9/3gp4/5S3/9/9/9/9/K8 b - 1';
    const response = handleWorkerRequest({ sfen: pos, difficulty: 'normal' }, () => 0.5);
    expect(response.usiMove).not.toBe('4d5c'); // 銀4四から歩5三を取る損な交換を選ばない
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/ai/worker-protocol.test.ts`
Expected: FAIL（`src/ai/worker-protocol.ts` が存在しない）

- [ ] **Step 3: worker-protocol.ts を実装する**

`src/ai/worker-protocol.ts`:

```ts
import { moveToUsi } from '../core/record';
import { parseSfen } from '../core/sfen';
import { selectMove, type Difficulty } from './difficulty';

export type WorkerRequest = { sfen: string; difficulty: Difficulty };
export type WorkerResponse = { usiMove: string };

export function handleWorkerRequest(request: WorkerRequest, rng: () => number): WorkerResponse {
  const pos = parseSfen(request.sfen);
  const move = selectMove(pos, request.difficulty, rng);
  return { usiMove: moveToUsi(move) };
}
```

- [ ] **Step 4: テストを実行してパスを確認する**

Run: `npx vitest run src/ai/worker-protocol.test.ts`
Expected: PASS（全4件）

- [ ] **Step 5: worker.ts を実装する（テスト対象外。Worker グローバルスコープに依存するため）**

`src/ai/worker.ts`:

```ts
import { handleWorkerRequest, type WorkerRequest } from './worker-protocol';

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const response = handleWorkerRequest(event.data, Math.random);
  self.postMessage(response);
};
```

- [ ] **Step 6: 型チェックを通す（worker.ts は DOM/WebWorker 両方の型が必要）**

Run: `npx tsc --noEmit`
Expected: エラーなし。`self.onmessage` の型で失敗する場合は `tsconfig.json` の `lib` に `"WebWorker"` を追加する（`"lib": ["ES2022", "DOM", "WebWorker"]`）。追加した場合は `git add tsconfig.json` を後続の commit に含める

- [ ] **Step 7: lint を通す**

Run: `npx biome check .`
Expected: エラーなし

- [ ] **Step 8: commit**

```bash
git add src/ai/worker-protocol.ts src/ai/worker-protocol.test.ts src/ai/worker.ts tsconfig.json
git commit -m "feat: add worker message protocol for the ai search"
```

---

### Task 16: 盤面描画（DOM + CSS Grid）

81マスは `<button>` 要素、`aria-label` は「7六 歩」形式、タップ領域は最低44px。駒は漢字1文字（成香・成桂・成銀は縦2文字縮小、と金は「と」）、後手の駒は180度回転。

**Files:**
- Create: `src/ui/style.css`
- Create: `src/ui/board.ts`
- Test: `src/ui/board.test.ts`

**Interfaces:**
- Consumes: `Position`（Task 2）、`fileOf`/`rankOf`/`squareIndex`（Task 1）
- Produces: `squareAriaLabel(square: number, piece: number): string`、`createBoardElement(pos: Position, onSquareClick: (square: number) => void): HTMLElement`、`updateBoardElement(boardEl: HTMLElement, pos: Position): void`

- [ ] **Step 1: 失敗するテストを書く**

`src/ui/board.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createBoardElement, squareAriaLabel, updateBoardElement } from './board';
import { parseSfen } from '../core/sfen';
import { squareIndex } from '../core/square';

describe('squareAriaLabel', () => {
  it('駒がなければマス名のみ', () => {
    expect(squareAriaLabel(squareIndex(7, 6), 0)).toBe('7六');
  });

  it('駒があればマス名+駒名', () => {
    expect(squareAriaLabel(squareIndex(7, 6), 1)).toBe('7六 歩'); // 先手歩(正の値)
  });
});

describe('createBoardElement', () => {
  it('81個のマスボタンを生成する', () => {
    const el = createBoardElement(parseSfen('9/9/9/9/9/9/9/9/9 b - 1'), () => {});
    expect(el.querySelectorAll('button[data-square]')).toHaveLength(81);
  });

  it('先手の駒には piece-gote クラスを付けない、後手の駒には付ける', () => {
    const pos = parseSfen('4p4/9/9/9/9/9/9/9/4P4 b - 1'); // 後手歩5一, 先手歩5九
    const el = createBoardElement(pos, () => {});
    const goteButton = el.querySelector(`button[data-square="${squareIndex(5, 1)}"]`);
    const senteButton = el.querySelector(`button[data-square="${squareIndex(5, 9)}"]`);
    expect(goteButton?.querySelector('.piece')?.classList.contains('piece-gote')).toBe(true);
    expect(senteButton?.querySelector('.piece')?.classList.contains('piece-gote')).toBe(false);
  });

  it('成香・成桂・成銀は piece-compact クラスを付ける(縦2文字縮小表示)', () => {
    const pos = parseSfen('9/9/9/9/4+L4/9/9/9/9 b - 1'); // 成香5五
    const el = createBoardElement(pos, () => {});
    const button = el.querySelector(`button[data-square="${squareIndex(5, 5)}"]`);
    expect(button?.querySelector('.piece')?.textContent).toBe('成香');
    expect(button?.querySelector('.piece')?.classList.contains('piece-compact')).toBe(true);
  });

  it('と金は「と」の1文字で piece-compact は付けない', () => {
    const pos = parseSfen('9/9/9/9/4+P4/9/9/9/9 b - 1');
    const el = createBoardElement(pos, () => {});
    const button = el.querySelector(`button[data-square="${squareIndex(5, 5)}"]`);
    expect(button?.querySelector('.piece')?.textContent).toBe('と');
    expect(button?.querySelector('.piece')?.classList.contains('piece-compact')).toBe(false);
  });

  it('マスをクリックすると onSquareClick がそのマス番号で呼ばれる', () => {
    const onClick = vi.fn();
    const el = createBoardElement(parseSfen('9/9/9/9/9/9/9/9/9 b - 1'), onClick);
    const button = el.querySelector<HTMLButtonElement>(`button[data-square="${squareIndex(7, 6)}"]`);
    button?.click();
    expect(onClick).toHaveBeenCalledWith(squareIndex(7, 6));
  });
});

describe('updateBoardElement', () => {
  it('局面を更新すると表示内容が変わる', () => {
    const el = createBoardElement(parseSfen('9/9/9/9/9/9/9/9/9 b - 1'), () => {});
    updateBoardElement(el, parseSfen('9/9/9/9/4P4/9/9/9/9 b - 1'));
    const button = el.querySelector(`button[data-square="${squareIndex(5, 5)}"]`);
    expect(button?.querySelector('.piece')?.textContent).toBe('歩');
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/ui/board.test.ts`
Expected: FAIL（`src/ui/board.ts` が存在しない）

- [ ] **Step 3: board.ts を実装する**

`src/ui/board.ts`:

```ts
import type { Position } from '../core/position';
import { fileOf, rankOf, squareIndex } from '../core/square';

const RANK_KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const PIECE_NAMES: Record<number, string> = {
  1: '歩', 2: '香', 3: '桂', 4: '銀', 5: '金', 6: '角', 7: '飛', 8: '玉',
  9: 'と', 10: '成香', 11: '成桂', 12: '成銀', 13: '馬', 14: '龍',
};

function squareLabel(square: number): string {
  const rankKanji = RANK_KANJI[rankOf(square) - 1];
  if (rankKanji === undefined) throw new Error(`invalid square: ${square}`);
  return `${fileOf(square)}${rankKanji}`;
}

export function squareAriaLabel(square: number, piece: number): string {
  const label = squareLabel(square);
  if (piece === 0) return label;
  const name = PIECE_NAMES[Math.abs(piece)];
  return name === undefined ? label : `${label} ${name}`;
}

function renderSquareContent(button: HTMLButtonElement, piece: number): void {
  button.textContent = '';
  if (piece === 0) return;
  const name = PIECE_NAMES[Math.abs(piece)];
  if (name === undefined) return;

  const span = document.createElement('span');
  span.className = 'piece';
  span.textContent = name;
  if (name.length >= 2) span.classList.add('piece-compact');
  if (piece < 0) span.classList.add('piece-gote');
  button.appendChild(span);
}

function updateSquareButton(button: HTMLButtonElement, square: number, piece: number): void {
  button.setAttribute('aria-label', squareAriaLabel(square, piece));
  renderSquareContent(button, piece);
}

export function createBoardElement(pos: Position, onSquareClick: (square: number) => void): HTMLElement {
  const boardEl = document.createElement('div');
  boardEl.className = 'board';

  for (let rank = 1; rank <= 9; rank++) {
    for (let file = 9; file >= 1; file--) {
      const square = squareIndex(file, rank);
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.square = String(square);
      updateSquareButton(button, square, pos.board[square]);
      button.addEventListener('click', () => onSquareClick(square));
      boardEl.appendChild(button);
    }
  }

  return boardEl;
}

export function updateBoardElement(boardEl: HTMLElement, pos: Position): void {
  const buttons = boardEl.querySelectorAll<HTMLButtonElement>('button[data-square]');
  for (const button of buttons) {
    const square = Number(button.dataset.square);
    updateSquareButton(button, square, pos.board[square]);
  }
}
```

- [ ] **Step 4: テストを実行してパスを確認する**

Run: `npx vitest run src/ui/board.test.ts`
Expected: PASS（全7件）

- [ ] **Step 5: style.css を作る**

`src/ui/style.css`（盤の見た目とレイアウトの基礎。レスポンシブな2カラム切り替えは Task 19 で仕上げる）:

```css
:root {
  color-scheme: light;
}

body {
  margin: 0;
  font-family: sans-serif;
  background: #f5f0e6;
}

#app {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px;
}

.board {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  grid-template-rows: repeat(9, 1fr);
  aspect-ratio: 1;
  width: min(100vw, 480px);
  border: 2px solid #333;
}

.board button {
  position: relative;
  border: 1px solid #999;
  background: #f5deb3;
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(12px, 4vw, 24px);
  padding: 0;
  cursor: pointer;
}

.board button.highlight {
  outline: 3px solid #2a7;
  outline-offset: -3px;
}

.board button.highlight::after {
  content: '';
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2a7;
}

.piece-compact {
  writing-mode: vertical-rl;
  font-size: 0.6em;
}

.piece-gote {
  display: inline-block;
  transform: rotate(180deg);
}
```

`index.html` の `<head>` に `<link rel="stylesheet" href="/src/ui/style.css" />` を追加する（`vite.config.ts` の `base` に従い、開発サーバでは `/src/...` で解決される）。

- [ ] **Step 6: lint を通す**

Run: `npx biome check .`
Expected: エラーなし

- [ ] **Step 7: commit**

```bash
git add src/ui/board.ts src/ui/board.test.ts src/ui/style.css index.html
git commit -m "feat: render the board as dom buttons with a css grid"
```

---

### Task 17: 操作フロー（選択・ハイライト・成りダイアログ）— 盤上の駒のみ

持ち駒を打つ操作はこのタスクの範囲外（Task 18 で選択状態を拡張する）。

**Files:**
- Create: `src/ui/promotion-dialog.ts`
- Create: `src/ui/board-controller.ts`
- Test: `src/ui/promotion-dialog.test.ts`
- Test: `src/ui/board-controller.test.ts`

**Interfaces:**
- Consumes: `legalMoves`（`src/core/rules.ts`）、`createBoardElement`/`updateBoardElement`（Task 16, `src/ui/board.ts`）、`Move`/`Position`
- Produces: `showPromotionDialog(container: HTMLElement): Promise<boolean>`、`type BoardController = { element: HTMLElement; setPosition: (pos: Position) => void; setInputEnabled: (enabled: boolean) => void }`、`createBoardController(initialPos: Position, onMove: (move: Move) => void): BoardController`

- [ ] **Step 1: 失敗する promotion-dialog テストを書く**

`src/ui/promotion-dialog.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { showPromotionDialog } from './promotion-dialog';

describe('showPromotionDialog', () => {
  it('「なる」をクリックすると true で解決する', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const promise = showPromotionDialog(container);
    container.querySelector<HTMLButtonElement>('button[data-choice="promote"]')?.click();
    await expect(promise).resolves.toBe(true);
  });

  it('「ならない」をクリックすると false で解決する', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const promise = showPromotionDialog(container);
    container.querySelector<HTMLButtonElement>('button[data-choice="decline"]')?.click();
    await expect(promise).resolves.toBe(false);
  });

  it('選択後はダイアログのDOM要素が取り除かれる', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const promise = showPromotionDialog(container);
    container.querySelector<HTMLButtonElement>('button[data-choice="promote"]')?.click();
    await promise;
    expect(container.querySelector('.promotion-dialog-overlay')).toBeNull();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/ui/promotion-dialog.test.ts`
Expected: FAIL（`src/ui/promotion-dialog.ts` が存在しない）

- [ ] **Step 3: promotion-dialog.ts を実装する**

`src/ui/promotion-dialog.ts`:

```ts
export function showPromotionDialog(container: HTMLElement): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'promotion-dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'promotion-dialog';

    const promoteButton = document.createElement('button');
    promoteButton.type = 'button';
    promoteButton.dataset.choice = 'promote';
    promoteButton.textContent = 'なる';
    promoteButton.addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });

    const declineButton = document.createElement('button');
    declineButton.type = 'button';
    declineButton.dataset.choice = 'decline';
    declineButton.textContent = 'ならない';
    declineButton.addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });

    dialog.append(promoteButton, declineButton);
    overlay.appendChild(dialog);
    container.appendChild(overlay);
  });
}
```

- [ ] **Step 4: テストを実行してパスを確認する**

Run: `npx vitest run src/ui/promotion-dialog.test.ts`
Expected: PASS（全3件）

- [ ] **Step 5: 失敗する board-controller テストを書く**

`src/ui/board-controller.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createBoardController } from './board-controller';
import { parseSfen } from '../core/sfen';
import { squareIndex } from '../core/square';

function clickSquare(element: HTMLElement, square: number): void {
  element.querySelector<HTMLButtonElement>(`button[data-square="${square}"]`)?.click();
}

describe('createBoardController', () => {
  it('駒をクリックすると合法な移動先がハイライトされる', () => {
    const pos = parseSfen('9/9/9/9/4P4/9/9/9/9 b - 1'); // 先手歩5五
    const controller = createBoardController(pos, vi.fn());
    document.body.appendChild(controller.element);
    clickSquare(controller.element, squareIndex(5, 5));
    const target = controller.element.querySelector(`button[data-square="${squareIndex(5, 4)}"]`);
    expect(target?.classList.contains('highlight')).toBe(true);
  });

  it('選択中の駒を再クリックすると選択解除される', () => {
    const pos = parseSfen('9/9/9/9/4P4/9/9/9/9 b - 1');
    const controller = createBoardController(pos, vi.fn());
    document.body.appendChild(controller.element);
    clickSquare(controller.element, squareIndex(5, 5));
    clickSquare(controller.element, squareIndex(5, 5));
    const target = controller.element.querySelector(`button[data-square="${squareIndex(5, 4)}"]`);
    expect(target?.classList.contains('highlight')).toBe(false);
  });

  it('合法な移動先をクリックすると onMove が呼ばれる(成りの選択肢がない場合)', () => {
    const pos = parseSfen('9/9/9/9/4P4/9/9/9/9 b - 1');
    const onMove = vi.fn();
    const controller = createBoardController(pos, onMove);
    document.body.appendChild(controller.element);
    clickSquare(controller.element, squareIndex(5, 5));
    clickSquare(controller.element, squareIndex(5, 4));
    expect(onMove).toHaveBeenCalledWith({ from: squareIndex(5, 5), to: squareIndex(5, 4), promote: false });
  });

  it('強制成りの手ではダイアログを出さず即座に onMove が呼ばれる', () => {
    const pos = parseSfen('9/4P4/9/9/9/9/9/9/9 b - 1'); // 先手歩5二(次で1段目=強制成り)
    const onMove = vi.fn();
    const controller = createBoardController(pos, onMove);
    document.body.appendChild(controller.element);
    clickSquare(controller.element, squareIndex(5, 2));
    clickSquare(controller.element, squareIndex(5, 1));
    expect(onMove).toHaveBeenCalledWith({ from: squareIndex(5, 2), to: squareIndex(5, 1), promote: true });
  });

  it('成れる手(強制でない)ではダイアログが表示され、「なる」クリックで成りの手が確定する', async () => {
    const pos = parseSfen('9/9/9/4P4/9/9/9/9/9 b - 1'); // 先手歩5四(次で敵陣3段目、成り選択可)
    const onMove = vi.fn();
    const controller = createBoardController(pos, onMove);
    document.body.appendChild(controller.element);
    clickSquare(controller.element, squareIndex(5, 4));
    clickSquare(controller.element, squareIndex(5, 3));

    const promoteButton = document.querySelector<HTMLButtonElement>('button[data-choice="promote"]');
    expect(promoteButton).not.toBeNull();
    promoteButton?.click();
    await Promise.resolve();

    expect(onMove).toHaveBeenCalledWith({ from: squareIndex(5, 4), to: squareIndex(5, 3), promote: true });
  });

  it('setInputEnabled(false) の間はクリックしても反応しない', () => {
    const pos = parseSfen('9/9/9/9/4P4/9/9/9/9 b - 1');
    const controller = createBoardController(pos, vi.fn());
    document.body.appendChild(controller.element);
    controller.setInputEnabled(false);
    clickSquare(controller.element, squareIndex(5, 5));
    const target = controller.element.querySelector(`button[data-square="${squareIndex(5, 4)}"]`);
    expect(target?.classList.contains('highlight')).toBe(false);
  });
});
```

- [ ] **Step 6: テストを実行して失敗を確認する**

Run: `npx vitest run src/ui/board-controller.test.ts`
Expected: FAIL（`src/ui/board-controller.ts` が存在しない）

- [ ] **Step 7: board-controller.ts を実装する**

`src/ui/board-controller.ts`:

```ts
import type { Move } from '../core/moves';
import type { Position } from '../core/position';
import { legalMoves } from '../core/rules';
import { createBoardElement, updateBoardElement } from './board';
import { showPromotionDialog } from './promotion-dialog';

export type BoardController = {
  element: HTMLElement;
  setPosition: (pos: Position) => void;
  setInputEnabled: (enabled: boolean) => void;
};

export function createBoardController(initialPos: Position, onMove: (move: Move) => void): BoardController {
  let pos = initialPos;
  let selectedSquare: number | null = null;
  let inputEnabled = true;

  const element = createBoardElement(pos, (square) => {
    void handleSquareClick(square);
  });

  function clearHighlights(): void {
    for (const button of element.querySelectorAll('button.highlight')) {
      button.classList.remove('highlight');
    }
  }

  function highlightSquares(squares: number[]): void {
    for (const square of squares) {
      element.querySelector(`button[data-square="${square}"]`)?.classList.add('highlight');
    }
  }

  function selectSquare(square: number, moves: Move[]): void {
    selectedSquare = square;
    clearHighlights();
    highlightSquares(moves.map((m) => m.to));
  }

  function deselect(): void {
    selectedSquare = null;
    clearHighlights();
  }

  async function handleSquareClick(square: number): Promise<void> {
    if (!inputEnabled) return;

    if (selectedSquare === square) {
      deselect();
      return;
    }

    const ownMovesFromSquare = legalMoves(pos).filter((m) => m.from === square);

    if (selectedSquare === null) {
      if (ownMovesFromSquare.length === 0) return;
      selectSquare(square, ownMovesFromSquare);
      return;
    }

    const candidates = legalMoves(pos).filter((m) => m.from === selectedSquare && m.to === square);

    if (candidates.length === 0) {
      if (ownMovesFromSquare.length > 0) {
        selectSquare(square, ownMovesFromSquare);
      } else {
        deselect();
      }
      return;
    }

    deselect();

    if (candidates.length === 1) {
      const only = candidates[0];
      if (only === undefined) throw new Error('unreachable');
      onMove(only);
      return;
    }

    const promoteMove = candidates.find((m) => m.promote);
    const declineMove = candidates.find((m) => !m.promote);
    if (promoteMove === undefined || declineMove === undefined) {
      throw new Error('expected both promote and non-promote candidates');
    }
    const shouldPromote = await showPromotionDialog(element.parentElement ?? element);
    onMove(shouldPromote ? promoteMove : declineMove);
  }

  return {
    element,
    setPosition: (newPos) => {
      pos = newPos;
      updateBoardElement(element, pos);
      deselect();
    },
    setInputEnabled: (enabled) => {
      inputEnabled = enabled;
      if (!enabled) deselect();
    },
  };
}
```

- [ ] **Step 8: テストを実行してパスを確認する**

Run: `npx vitest run src/ui/board-controller.test.ts`
Expected: PASS（全6件）

- [ ] **Step 9: lint を通す**

Run: `npx biome check .`
Expected: エラーなし

- [ ] **Step 10: commit**

```bash
git add src/ui/promotion-dialog.ts src/ui/promotion-dialog.test.ts src/ui/board-controller.ts src/ui/board-controller.test.ts
git commit -m "feat: add square selection, highlighting, and promotion dialog"
```

---

### Task 18: 持ち駒UIと選択状態の統合

持ち駒もタップ→打てるマスがハイライト→着手、という同じ操作フローに乗せる。選択中の駒を再タップすると選択解除する。

**Files:**
- Create: `src/ui/hands.ts`
- Modify: `src/ui/board-controller.ts`（選択状態を盤上/持ち駒のいずれかを表す型に拡張）
- Test: `src/ui/hands.test.ts`
- Test: `src/ui/board-controller.test.ts`（追記）

**Interfaces:**
- Consumes: `HAND_PIECE_TYPES`（`src/core/piece.ts`）、`Position`、`legalMoves`
- Produces: `createHandsElement(pos: Position, side: 'b' | 'w', onPieceClick: (pieceType: number) => void): HTMLElement`、`updateHandsElement(handsEl: HTMLElement, pos: Position, side: 'b' | 'w'): void`。`BoardController` に `handlePieceTypeClick(side: 'b' | 'w', pieceType: number): void` を追加

- [ ] **Step 1: 失敗する hands テストを書く**

`src/ui/hands.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createHandsElement, updateHandsElement } from './hands';
import { parseSfen } from '../core/sfen';

describe('createHandsElement', () => {
  it('歩香桂銀金角飛の7種のボタンを生成する', () => {
    const pos = parseSfen('9/9/9/9/9/9/9/9/9 b - 1');
    const el = createHandsElement(pos, 'b', () => {});
    expect(el.querySelectorAll('button[data-piece-type]')).toHaveLength(7);
  });

  it('枚数0の駒はボタンを無効化する', () => {
    const pos = parseSfen('9/9/9/9/9/9/9/9/9 b P 1'); // 歩1枚のみ
    const el = createHandsElement(pos, 'b', () => {});
    const pawnButton = el.querySelector<HTMLButtonElement>('button[data-piece-type="1"]');
    const lanceButton = el.querySelector<HTMLButtonElement>('button[data-piece-type="2"]');
    expect(pawnButton?.disabled).toBe(false);
    expect(lanceButton?.disabled).toBe(true);
  });

  it('駒ボタンをクリックすると onPieceClick が駒種で呼ばれる', () => {
    const pos = parseSfen('9/9/9/9/9/9/9/9/9 b P 1');
    const onClick = vi.fn();
    const el = createHandsElement(pos, 'b', onClick);
    el.querySelector<HTMLButtonElement>('button[data-piece-type="1"]')?.click();
    expect(onClick).toHaveBeenCalledWith(1);
  });

  it('updateHandsElement で枚数表示が更新される', () => {
    const el = createHandsElement(parseSfen('9/9/9/9/9/9/9/9/9 b P 1'), 'b', () => {});
    updateHandsElement(el, parseSfen('9/9/9/9/9/9/9/9/9 b 2P 1'), 'b');
    const pawnButton = el.querySelector<HTMLButtonElement>('button[data-piece-type="1"]');
    expect(pawnButton?.querySelector('.hand-count')?.textContent).toBe('2');
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/ui/hands.test.ts`
Expected: FAIL（`src/ui/hands.ts` が存在しない）

- [ ] **Step 3: hands.ts を実装する**

`src/ui/hands.ts`:

```ts
import { HAND_PIECE_TYPES } from '../core/piece';
import type { Position } from '../core/position';

const PIECE_NAMES: Record<number, string> = { 1: '歩', 2: '香', 3: '桂', 4: '銀', 5: '金', 6: '角', 7: '飛' };

function handIndex(side: 'b' | 'w'): 0 | 1 {
  return side === 'b' ? 0 : 1;
}

function updateHandButton(button: HTMLButtonElement, pieceType: number, count: number): void {
  button.textContent = '';
  const name = PIECE_NAMES[pieceType] ?? '';

  const pieceSpan = document.createElement('span');
  pieceSpan.className = 'piece';
  pieceSpan.textContent = name;

  const countSpan = document.createElement('span');
  countSpan.className = 'hand-count';
  countSpan.textContent = count > 1 ? String(count) : '';

  button.append(pieceSpan, countSpan);
  button.disabled = count === 0;
  button.setAttribute('aria-label', `持ち駒 ${name} ${count}枚`);
}

export function createHandsElement(
  pos: Position,
  side: 'b' | 'w',
  onPieceClick: (pieceType: number) => void,
): HTMLElement {
  const el = document.createElement('div');
  el.className = 'hands';
  el.dataset.side = side;

  for (const pieceType of HAND_PIECE_TYPES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.pieceType = String(pieceType);
    updateHandButton(button, pieceType, pos.hands[handIndex(side)][pieceType - 1]);
    button.addEventListener('click', () => onPieceClick(pieceType));
    el.appendChild(button);
  }

  return el;
}

export function updateHandsElement(handsEl: HTMLElement, pos: Position, side: 'b' | 'w'): void {
  const buttons = handsEl.querySelectorAll<HTMLButtonElement>('button[data-piece-type]');
  for (const button of buttons) {
    const pieceType = Number(button.dataset.pieceType);
    updateHandButton(button, pieceType, pos.hands[handIndex(side)][pieceType - 1]);
  }
}
```

- [ ] **Step 4: テストを実行してパスを確認する**

Run: `npx vitest run src/ui/hands.test.ts`
Expected: PASS（全4件）

- [ ] **Step 5: 失敗する board-controller テストを追記する**

`src/ui/board-controller.test.ts` の末尾に追記:

```ts
import { GOLD } from '../core/piece';

describe('createBoardController (持ち駒)', () => {
  it('持ち駒をクリックすると打てるマスがハイライトされる', () => {
    const pos = parseSfen('9/9/9/9/9/9/9/9/9 b G 1');
    const controller = createBoardController(pos, vi.fn());
    document.body.appendChild(controller.element);
    controller.handlePieceTypeClick('b', GOLD);
    const target = controller.element.querySelector(`button[data-square="${squareIndex(5, 5)}"]`);
    expect(target?.classList.contains('highlight')).toBe(true);
  });

  it('持ち駒を選んでマスをクリックすると打つ手で onMove が呼ばれる', () => {
    const pos = parseSfen('9/9/9/9/9/9/9/9/9 b G 1');
    const onMove = vi.fn();
    const controller = createBoardController(pos, onMove);
    document.body.appendChild(controller.element);
    controller.handlePieceTypeClick('b', GOLD);
    clickSquare(controller.element, squareIndex(5, 5));
    expect(onMove).toHaveBeenCalledWith({ from: null, to: squareIndex(5, 5), promote: false, drop: GOLD });
  });

  it('相手の手番の持ち駒をクリックしても反応しない', () => {
    const pos = parseSfen('9/9/9/9/9/9/9/9/9 b - 1'); // 手番は先手(b)
    const controller = createBoardController(pos, vi.fn());
    document.body.appendChild(controller.element);
    // 後手('w')の持ち駒クリックを試みても、手番でないため無視される
    controller.handlePieceTypeClick('w', GOLD);
    const target = controller.element.querySelector(`button[data-square="${squareIndex(5, 5)}"]`);
    expect(target?.classList.contains('highlight')).toBe(false);
  });
});
```

- [ ] **Step 6: テストを実行して失敗を確認する**

Run: `npx vitest run src/ui/board-controller.test.ts`
Expected: FAIL（`handlePieceTypeClick` が存在しない）

- [ ] **Step 7: board-controller.ts を修正する**

`src/ui/board-controller.ts` の `let selectedSquare: number | null = null;` から始まる選択状態の管理を、盤上/持ち駒を区別できる形に置き換える。ファイル全体を次の内容に置き換える:

```ts
import type { Move } from '../core/moves';
import type { Position } from '../core/position';
import { legalMoves } from '../core/rules';
import { createBoardElement, updateBoardElement } from './board';
import { showPromotionDialog } from './promotion-dialog';

export type BoardController = {
  element: HTMLElement;
  setPosition: (pos: Position) => void;
  setInputEnabled: (enabled: boolean) => void;
  handlePieceTypeClick: (side: 'b' | 'w', pieceType: number) => void;
};

type Selection = { kind: 'board'; square: number } | { kind: 'hand'; pieceType: number };

export function createBoardController(initialPos: Position, onMove: (move: Move) => void): BoardController {
  let pos = initialPos;
  let selected: Selection | null = null;
  let inputEnabled = true;

  const element = createBoardElement(pos, (square) => {
    void handleSquareClick(square);
  });

  function clearHighlights(): void {
    for (const button of element.querySelectorAll('button.highlight')) {
      button.classList.remove('highlight');
    }
  }

  function highlightSquares(squares: number[]): void {
    for (const square of squares) {
      element.querySelector(`button[data-square="${square}"]`)?.classList.add('highlight');
    }
  }

  function selectBoardSquare(square: number, moves: Move[]): void {
    selected = { kind: 'board', square };
    clearHighlights();
    highlightSquares(moves.map((m) => m.to));
  }

  function deselect(): void {
    selected = null;
    clearHighlights();
  }

  async function resolveCandidate(candidates: Move[]): Promise<void> {
    if (candidates.length === 1) {
      const only = candidates[0];
      if (only === undefined) throw new Error('unreachable');
      onMove(only);
      return;
    }

    const promoteMove = candidates.find((m) => m.promote);
    const declineMove = candidates.find((m) => !m.promote);
    if (promoteMove === undefined || declineMove === undefined) {
      throw new Error('expected both promote and non-promote candidates');
    }
    const shouldPromote = await showPromotionDialog(element.parentElement ?? element);
    onMove(shouldPromote ? promoteMove : declineMove);
  }

  async function handleSquareClick(square: number): Promise<void> {
    if (!inputEnabled) return;

    if (selected?.kind === 'board' && selected.square === square) {
      deselect();
      return;
    }

    const ownMovesFromSquare = legalMoves(pos).filter((m) => m.from === square);

    if (selected === null) {
      if (ownMovesFromSquare.length === 0) return;
      selectBoardSquare(square, ownMovesFromSquare);
      return;
    }

    const candidates =
      selected.kind === 'board'
        ? legalMoves(pos).filter((m) => m.from === selected.square && m.to === square)
        : legalMoves(pos).filter((m) => m.drop === selected.pieceType && m.to === square);

    if (candidates.length === 0) {
      if (ownMovesFromSquare.length > 0) {
        selectBoardSquare(square, ownMovesFromSquare);
      } else {
        deselect();
      }
      return;
    }

    deselect();
    await resolveCandidate(candidates);
  }

  function handlePieceTypeClick(side: 'b' | 'w', pieceType: number): void {
    if (!inputEnabled) return;
    if (side !== pos.sideToMove) return;

    if (selected?.kind === 'hand' && selected.pieceType === pieceType) {
      deselect();
      return;
    }

    const moves = legalMoves(pos).filter((m) => m.drop === pieceType);
    if (moves.length === 0) return;

    selected = { kind: 'hand', pieceType };
    clearHighlights();
    highlightSquares(moves.map((m) => m.to));
  }

  return {
    element,
    setPosition: (newPos) => {
      pos = newPos;
      updateBoardElement(element, pos);
      deselect();
    },
    setInputEnabled: (enabled) => {
      inputEnabled = enabled;
      if (!enabled) deselect();
    },
    handlePieceTypeClick,
  };
}
```

- [ ] **Step 8: テストを実行してパスを確認する**

Run: `npx vitest run src/ui/board-controller.test.ts src/ui/hands.test.ts`
Expected: PASS（board-controller 全9件、hands 全4件）

- [ ] **Step 9: lint を通す**

Run: `npx biome check .`
Expected: エラーなし

- [ ] **Step 10: commit**

```bash
git add src/ui/hands.ts src/ui/hands.test.ts src/ui/board-controller.ts src/ui/board-controller.test.ts
git commit -m "feat: add hand piece selection integrated with board controller"
```

---

### Task 19: 操作ボタン・棋譜表示・盤面状態表示・レスポンシブレイアウト

「まった」「とうりょう」「さいしょから」の3ボタン（投了は確認を挟む）、棋譜の一覧表示、最終手のマーク、王手表示、「かんがえちゅう」表示。これで `ui` レイヤーが完成する（Task 16〜19）。

**Files:**
- Create: `src/ui/controls.ts`
- Create: `src/ui/record-view.ts`
- Create: `src/ui/status-view.ts`
- Modify: `src/ui/board.ts`（`updateBoardElement` に最終手・王手のマーク表示を追加）
- Modify: `src/ui/style.css`（最終手・王手のスタイル、2カラムのレスポンシブ切り替え）
- Test: `src/ui/controls.test.ts`
- Test: `src/ui/record-view.test.ts`
- Test: `src/ui/status-view.test.ts`
- Test: `src/ui/board.test.ts`（追記）

**Interfaces:**
- Consumes: `Move`（`src/core/moves.ts`）
- Produces: `createControlsElement(handlers: { onUndo: () => void; onResign: () => void; onRestart: () => void }): HTMLElement`、`createRecordViewElement(): HTMLElement`、`appendRecordEntry(recordEl: HTMLElement, text: string): void`、`clearRecordView(recordEl: HTMLElement): void`、`createStatusElement(): HTMLElement`、`setStatusText(statusEl: HTMLElement, text: string): void`。`updateBoardElement` の第3引数に `{ lastMove?: Move; checkedKingSquare?: number }` を追加

- [ ] **Step 1: 失敗する controls テストを書く**

`src/ui/controls.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createControlsElement } from './controls';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createControlsElement', () => {
  it('「まった」クリックで onUndo が呼ばれる', () => {
    const onUndo = vi.fn();
    const el = createControlsElement({ onUndo, onResign: vi.fn(), onRestart: vi.fn() });
    el.querySelector<HTMLButtonElement>('button[data-action="undo"]')?.click();
    expect(onUndo).toHaveBeenCalled();
  });

  it('「さいしょから」クリックで onRestart が呼ばれる', () => {
    const onRestart = vi.fn();
    const el = createControlsElement({ onUndo: vi.fn(), onResign: vi.fn(), onRestart });
    el.querySelector<HTMLButtonElement>('button[data-action="restart"]')?.click();
    expect(onRestart).toHaveBeenCalled();
  });

  it('「とうりょう」クリックは確認ダイアログでOKした場合のみ onResign が呼ばれる', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onResign = vi.fn();
    const el = createControlsElement({ onUndo: vi.fn(), onResign, onRestart: vi.fn() });
    el.querySelector<HTMLButtonElement>('button[data-action="resign"]')?.click();
    expect(onResign).toHaveBeenCalled();
  });

  it('「とうりょう」クリックで確認ダイアログをキャンセルすると onResign は呼ばれない', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onResign = vi.fn();
    const el = createControlsElement({ onUndo: vi.fn(), onResign, onRestart: vi.fn() });
    el.querySelector<HTMLButtonElement>('button[data-action="resign"]')?.click();
    expect(onResign).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/ui/controls.test.ts`
Expected: FAIL（`src/ui/controls.ts` が存在しない）

- [ ] **Step 3: controls.ts を実装する**

`src/ui/controls.ts`:

```ts
export type ControlsHandlers = {
  onUndo: () => void;
  onResign: () => void;
  onRestart: () => void;
};

export function createControlsElement(handlers: ControlsHandlers): HTMLElement {
  const el = document.createElement('div');
  el.className = 'controls';

  const undoButton = document.createElement('button');
  undoButton.type = 'button';
  undoButton.dataset.action = 'undo';
  undoButton.textContent = 'まった';
  undoButton.addEventListener('click', handlers.onUndo);

  const resignButton = document.createElement('button');
  resignButton.type = 'button';
  resignButton.dataset.action = 'resign';
  resignButton.textContent = 'とうりょう';
  resignButton.addEventListener('click', () => {
    if (window.confirm('とうりょうしますか？')) handlers.onResign();
  });

  const restartButton = document.createElement('button');
  restartButton.type = 'button';
  restartButton.dataset.action = 'restart';
  restartButton.textContent = 'さいしょから';
  restartButton.addEventListener('click', handlers.onRestart);

  el.append(undoButton, resignButton, restartButton);
  return el;
}
```

- [ ] **Step 4: テストを実行してパスを確認する**

Run: `npx vitest run src/ui/controls.test.ts`
Expected: PASS（全4件）

- [ ] **Step 5: 失敗する record-view / status-view テストを書く**

`src/ui/record-view.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { appendRecordEntry, clearRecordView, createRecordViewElement } from './record-view';

describe('record-view', () => {
  it('appendRecordEntry で項目が末尾に追加される', () => {
    const el = createRecordViewElement();
    appendRecordEntry(el, '▲7六歩');
    appendRecordEntry(el, '△3四歩');
    const items = [...el.querySelectorAll('li')].map((li) => li.textContent);
    expect(items).toEqual(['▲7六歩', '△3四歩']);
  });

  it('clearRecordView で全項目が消える', () => {
    const el = createRecordViewElement();
    appendRecordEntry(el, '▲7六歩');
    clearRecordView(el);
    expect(el.querySelectorAll('li')).toHaveLength(0);
  });
});
```

`src/ui/status-view.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createStatusElement, setStatusText } from './status-view';

describe('status-view', () => {
  it('setStatusText でテキストが表示される', () => {
    const el = createStatusElement();
    setStatusText(el, 'かんがえちゅう');
    expect(el.textContent).toBe('かんがえちゅう');
  });
});
```

- [ ] **Step 6: テストを実行して失敗を確認する**

Run: `npx vitest run src/ui/record-view.test.ts src/ui/status-view.test.ts`
Expected: FAIL（両ファイルとも実装が存在しない）

- [ ] **Step 7: record-view.ts と status-view.ts を実装する**

`src/ui/record-view.ts`（設計書のレイアウトどおり `<details>` で折りたたみにする。初期状態は閉じておく）:

```ts
function listOf(recordEl: HTMLElement): HTMLOListElement {
  const list = recordEl.querySelector<HTMLOListElement>('.record-view-list');
  if (list === null) throw new Error('record view list not found');
  return list;
}

export function createRecordViewElement(): HTMLElement {
  const details = document.createElement('details');
  details.className = 'record-view-container';

  const summary = document.createElement('summary');
  summary.textContent = 'きふ';

  const list = document.createElement('ol');
  list.className = 'record-view-list';

  details.append(summary, list);
  return details;
}

export function appendRecordEntry(recordEl: HTMLElement, text: string): void {
  const li = document.createElement('li');
  li.textContent = text;
  listOf(recordEl).appendChild(li);
}

export function clearRecordView(recordEl: HTMLElement): void {
  listOf(recordEl).replaceChildren();
}
```

`src/ui/status-view.ts`:

```ts
export function createStatusElement(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'status-view';
  el.setAttribute('role', 'status');
  return el;
}

export function setStatusText(statusEl: HTMLElement, text: string): void {
  statusEl.textContent = text;
}
```

- [ ] **Step 8: テストを実行してパスを確認する**

Run: `npx vitest run src/ui/record-view.test.ts src/ui/status-view.test.ts`
Expected: PASS（record-view 全2件、status-view 全1件）

- [ ] **Step 9: 失敗する board.ts の最終手・王手表示テストを追記する**

`src/ui/board.test.ts` の末尾に追記:

```ts
describe('updateBoardElement (最終手・王手の表示)', () => {
  it('lastMove を渡すと移動元・移動先に last-move クラスが付く', () => {
    const el = createBoardElement(parseSfen('9/9/9/9/4P4/9/9/9/9 b - 1'), () => {});
    const lastMove = { from: squareIndex(5, 6), to: squareIndex(5, 5), promote: false };
    updateBoardElement(el, parseSfen('9/9/9/9/4P4/9/9/9/9 b - 1'), { lastMove });
    expect(el.querySelector(`button[data-square="${squareIndex(5, 6)}"]`)?.classList.contains('last-move')).toBe(true);
    expect(el.querySelector(`button[data-square="${squareIndex(5, 5)}"]`)?.classList.contains('last-move')).toBe(true);
  });

  it('checkedKingSquare を渡すとそのマスに checked-king クラスが付く', () => {
    const pos = parseSfen('4k4/9/9/9/9/9/9/9/4K4 b - 1');
    const el = createBoardElement(pos, () => {});
    updateBoardElement(el, pos, { checkedKingSquare: squareIndex(5, 1) });
    expect(el.querySelector(`button[data-square="${squareIndex(5, 1)}"]`)?.classList.contains('checked-king')).toBe(true);
  });

  it('オプションを渡さない更新では前回のマークが消える', () => {
    const pos = parseSfen('9/9/9/9/4P4/9/9/9/9 b - 1');
    const el = createBoardElement(pos, () => {});
    updateBoardElement(el, pos, { lastMove: { from: squareIndex(5, 6), to: squareIndex(5, 5), promote: false } });
    updateBoardElement(el, pos);
    expect(el.querySelector(`button[data-square="${squareIndex(5, 5)}"]`)?.classList.contains('last-move')).toBe(false);
  });
});
```

- [ ] **Step 10: テストを実行して失敗を確認する**

Run: `npx vitest run src/ui/board.test.ts`
Expected: FAIL（新規3件が失敗。`updateBoardElement` はまだ第3引数を受け付けない）

- [ ] **Step 11: board.ts の updateBoardElement を修正する**

`src/ui/board.ts` の `updateBoardElement` を次のように置き換える:

```ts
export function updateBoardElement(
  boardEl: HTMLElement,
  pos: Position,
  marks: { lastMove?: import('../core/moves').Move; checkedKingSquare?: number } = {},
): void {
  const buttons = boardEl.querySelectorAll<HTMLButtonElement>('button[data-square]');
  for (const button of buttons) {
    const square = Number(button.dataset.square);
    updateSquareButton(button, square, pos.board[square]);

    button.classList.remove('last-move', 'checked-king');
    if (marks.lastMove && (marks.lastMove.from === square || marks.lastMove.to === square)) {
      button.classList.add('last-move');
    }
    if (marks.checkedKingSquare === square) {
      button.classList.add('checked-king');
    }
  }
}
```

- [ ] **Step 12: テストを実行してパスを確認する**

Run: `npx vitest run src/ui/board.test.ts`
Expected: PASS（全10件）

- [ ] **Step 13: style.css に最終手・王手のスタイルと2カラムレイアウトを追記する**

`src/ui/style.css` の末尾に追記:

```css
.board button.last-move {
  background: #ffe9a8;
}

.board button.checked-king {
  background: #ffb3b3;
}

.status-view {
  min-height: 1.5em;
  font-weight: bold;
  margin: 4px 0;
}

.controls {
  display: flex;
  gap: 8px;
  margin: 8px 0;
}

.controls button {
  min-height: 44px;
  padding: 0 12px;
}

.hands {
  display: flex;
  gap: 4px;
  margin: 4px 0;
}

.hands button {
  min-width: 44px;
  min-height: 44px;
}

.record-view-list {
  max-height: 200px;
  overflow-y: auto;
}

@media (min-width: 768px) and (orientation: landscape) {
  #app {
    flex-direction: row;
    align-items: flex-start;
    justify-content: center;
    gap: 16px;
  }
}
```

- [ ] **Step 14: core/ai/ui レイヤー全体のテストを実行する**

Run: `npx vitest run`
Expected: 全ファイル PASS（Task 1〜19 の全テスト）

- [ ] **Step 15: lint を通す**

Run: `npx biome check .`
Expected: エラーなし

- [ ] **Step 16: commit**

```bash
git add src/ui/controls.ts src/ui/controls.test.ts src/ui/record-view.ts src/ui/record-view.test.ts src/ui/status-view.ts src/ui/status-view.test.ts src/ui/board.ts src/ui/board.test.ts src/ui/style.css
git commit -m "feat: add controls, record view, status view, and last-move/check marks"
```

---

### Task 20: USI指し手のパース＋ゲーム状態遷移

Worker からの応答（USI文字列）と localStorage の保存データはどちらも USI 形式の指し手列を使うため、`moveToUsi` の逆変換 `parseUsiMove` を `core/record.ts` に追加する（Task 10 で書き忘れていたもの）。その上で、対局の状態遷移（着手・終局判定・待った・投了）を DOM に依存しない純粋ロジックとして実装する。

**Files:**
- Modify: `src/core/record.ts`（`parseUsiMove` を追加）
- Test: `src/core/record.test.ts`（追記）
- Create: `src/app/game-state.ts`
- Test: `src/app/game-state.test.ts`

**Interfaces:**
- Consumes: `applyMove`（`src/core/apply-move.ts`）、`checkGameEnd`（`src/core/game-end.ts`）、`checkRepetition`（`src/core/repetition.ts`）、`initialPosition`（`src/core/sfen.ts`）、`Difficulty`（`src/ai/difficulty.ts`）
- Produces: `parseUsiMove(usi: string): Move`（`src/core/record.ts`）、`type GameState = { history: Position[]; moveHistory: Move[]; difficulty: Difficulty; playerSide: 'b' | 'w'; status: 'playing' | 'ended'; endResult: { type: string; winner: 'b' | 'w' | null } | null }`、`createGameState`/`currentPosition`/`applyMoveToState`/`undoMove`/`resign`（`src/app/game-state.ts`）

- [ ] **Step 1: 失敗する parseUsiMove テストを追記する**

`src/core/record.test.ts` の末尾に追記:

```ts
import { parseUsiMove } from './record';

describe('parseUsiMove', () => {
  it('通常の移動をパースする(7g7f)', () => {
    expect(parseUsiMove('7g7f')).toEqual({ from: squareIndex(7, 7), to: squareIndex(7, 6), promote: false });
  });

  it('成る手をパースする(2c2b+)', () => {
    expect(parseUsiMove('2c2b+')).toEqual({ from: squareIndex(2, 3), to: squareIndex(2, 2), promote: true });
  });

  it('打つ手をパースする(P*5e)', () => {
    expect(parseUsiMove('P*5e')).toEqual({ from: null, to: squareIndex(5, 5), promote: false, drop: PAWN });
  });

  it('moveToUsi と parseUsiMove はラウンドトリップする', () => {
    const moves = [
      { from: squareIndex(7, 7), to: squareIndex(7, 6), promote: false },
      { from: squareIndex(2, 3), to: squareIndex(2, 2), promote: true },
      { from: null, to: squareIndex(5, 5), promote: false, drop: PAWN },
    ];
    for (const move of moves) {
      expect(parseUsiMove(moveToUsi(move))).toEqual(move);
    }
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/core/record.test.ts`
Expected: FAIL（`parseUsiMove` が存在しない）

- [ ] **Step 3: record.ts に parseUsiMove を追加する**

`src/core/record.ts` の末尾に追記（`squareIndex` を import に追加すること）:

```ts
const USI_DROP_CHAR_TO_TYPE: Record<string, number> = { P: 1, L: 2, N: 3, S: 4, G: 5, B: 6, R: 7 };

function usiToSquare(usiSquare: string): number {
  const file = Number(usiSquare[0]);
  const rankLetter = usiSquare[1];
  const rank = USI_RANK_LETTERS.indexOf(rankLetter) + 1;
  if (Number.isNaN(file) || rank < 1) throw new Error(`invalid usi square: ${usiSquare}`);
  return squareIndex(file, rank);
}

export function parseUsiMove(usi: string): Move {
  if (usi[1] === '*') {
    const pieceType = USI_DROP_CHAR_TO_TYPE[usi[0]];
    if (pieceType === undefined) throw new Error(`invalid usi drop move: ${usi}`);
    return { from: null, to: usiToSquare(usi.slice(2, 4)), promote: false, drop: pieceType };
  }
  const from = usiToSquare(usi.slice(0, 2));
  const to = usiToSquare(usi.slice(2, 4));
  const promote = usi.endsWith('+');
  return { from, to, promote };
}
```

`squareIndex` の import を `src/core/square.ts` からの既存 import に追加する: `import { fileOf, rankOf, squareIndex } from './square';`

- [ ] **Step 4: テストを実行してパスを確認する**

Run: `npx vitest run src/core/record.test.ts`
Expected: PASS（全12件）

- [ ] **Step 5: lint を通す**

Run: `npx biome check .`
Expected: エラーなし

- [ ] **Step 6: commit**

```bash
git add src/core/record.ts src/core/record.test.ts
git commit -m "feat: add usi move parsing (inverse of moveToUsi)"
```

- [ ] **Step 7: 失敗する game-state テストを書く**

`src/app/game-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyMoveToState, createGameState, currentPosition, resign, undoMove } from './game-state';
import { ROOK } from '../core/piece';
import { parseSfen } from '../core/sfen';
import { squareIndex } from '../core/square';

describe('game-state', () => {
  it('createGameState は平手初期局面から開始する', () => {
    const state = createGameState('b', 'normal');
    expect(state.status).toBe('playing');
    expect(state.history).toHaveLength(1);
    expect(state.endResult).toBeNull();
  });

  it('applyMoveToState で局面が進む', () => {
    const state = createGameState('b', 'normal');
    const move = { from: squareIndex(7, 7), to: squareIndex(7, 6), promote: false };
    const next = applyMoveToState(state, move);
    expect(next.history).toHaveLength(2);
    expect(next.moveHistory).toEqual([move]);
    expect(next.status).toBe('playing');
  });

  it('詰みになる手を適用すると status が ended になり勝者が記録される', () => {
    let state = createGameState('b', 'normal');
    state = { ...state, history: [parseSfen('k8/1G7/9/9/9/9/9/9/9 b R 1')] };
    const move = { from: null, to: squareIndex(9, 2), promote: false, drop: ROOK };
    const next = applyMoveToState(state, move);
    expect(next.status).toBe('ended');
    expect(next.endResult).toEqual({ type: 'checkmate', winner: 'b' });
  });

  it('undoMove で1手戻る', () => {
    const state = createGameState('b', 'normal');
    const move = { from: squareIndex(7, 7), to: squareIndex(7, 6), promote: false };
    const afterMove = applyMoveToState(state, move);
    const undone = undoMove(afterMove);
    expect(undone.history).toHaveLength(1);
    expect(undone.moveHistory).toHaveLength(0);
  });

  it('undoMove は初期局面より前には戻らない', () => {
    const state = createGameState('b', 'normal');
    expect(undoMove(state)).toEqual(state);
  });

  it('resign で投了側の相手が勝者になる', () => {
    const state = createGameState('b', 'normal'); // プレイヤーは先手
    const resigned = resign(state);
    expect(resigned.status).toBe('ended');
    expect(resigned.endResult).toEqual({ type: 'resign', winner: 'w' });
  });

  it('currentPosition は履歴の最後の局面を返す', () => {
    const state = createGameState('b', 'normal');
    expect(currentPosition(state)).toBe(state.history[state.history.length - 1]);
  });
});
```

- [ ] **Step 8: テストを実行して失敗を確認する**

Run: `npx vitest run src/app/game-state.test.ts`
Expected: FAIL（`src/app/game-state.ts` が存在しない）

- [ ] **Step 9: game-state.ts を実装する**

`src/app/game-state.ts`:

```ts
import { applyMove } from '../core/apply-move';
import { checkGameEnd } from '../core/game-end';
import type { Move } from '../core/moves';
import type { Position } from '../core/position';
import { checkRepetition } from '../core/repetition';
import { initialPosition } from '../core/sfen';
import type { Difficulty } from '../ai/difficulty';

export type GameEndInfo = { type: string; winner: 'b' | 'w' | null };

export type GameState = {
  history: Position[];
  moveHistory: Move[];
  difficulty: Difficulty;
  playerSide: 'b' | 'w';
  status: 'playing' | 'ended';
  endResult: GameEndInfo | null;
};

export function createGameState(playerSide: 'b' | 'w', difficulty: Difficulty): GameState {
  return {
    history: [initialPosition()],
    moveHistory: [],
    difficulty,
    playerSide,
    status: 'playing',
    endResult: null,
  };
}

export function currentPosition(state: GameState): Position {
  const pos = state.history[state.history.length - 1];
  if (pos === undefined) throw new Error('game state history must not be empty');
  return pos;
}

export function applyMoveToState(state: GameState, move: Move): GameState {
  if (state.status === 'ended') throw new Error('game already ended');

  const next = applyMove(currentPosition(state), move);
  const history = [...state.history, next];
  const moveHistory = [...state.moveHistory, move];

  const gameEnd = checkGameEnd(next);
  const repetition = gameEnd === null ? checkRepetition(history) : null;

  let endResult: GameEndInfo | null = null;
  if (gameEnd !== null) {
    endResult = gameEnd;
  } else if (repetition !== null) {
    endResult = repetition;
  }

  return {
    ...state,
    history,
    moveHistory,
    status: endResult !== null ? 'ended' : 'playing',
    endResult,
  };
}

export function undoMove(state: GameState): GameState {
  if (state.history.length <= 1) return state;
  return {
    ...state,
    history: state.history.slice(0, -1),
    moveHistory: state.moveHistory.slice(0, -1),
    status: 'playing',
    endResult: null,
  };
}

export function resign(state: GameState): GameState {
  const winner: 'b' | 'w' = state.playerSide === 'b' ? 'w' : 'b';
  return { ...state, status: 'ended', endResult: { type: 'resign', winner } };
}
```

- [ ] **Step 10: テストを実行してパスを確認する**

Run: `npx vitest run src/app/game-state.test.ts`
Expected: PASS（全7件）

- [ ] **Step 11: lint を通す**

Run: `npx biome check .`
Expected: エラーなし

- [ ] **Step 12: commit**

```bash
git add src/app/game-state.ts src/app/game-state.test.ts
git commit -m "feat: add game state transitions (move, undo, resign, game end)"
```

---

### Task 21: タイトル画面と終局モーダル

設計書の画面構成「タイトル（難易度・先後の選択）→ 対局画面 → 終局モーダル」のうち、対局画面（盤・持ち駒・操作ボタン・棋譜）は Task 16〜19 で実装済み。残るタイトルと終局モーダルをここで実装する。設定画面は作らない（非スコープ）。

**Files:**
- Create: `src/ui/title-screen.ts`
- Create: `src/ui/end-game-modal.ts`
- Test: `src/ui/title-screen.test.ts`
- Test: `src/ui/end-game-modal.test.ts`

**Interfaces:**
- Consumes: `Difficulty`（`src/ai/difficulty.ts`）
- Produces: `type TitleScreenChoice = { playerSide: 'b' | 'w'; difficulty: Difficulty }`、`createTitleScreenElement(onStart: (choice: TitleScreenChoice) => void): HTMLElement`、`createEndGameModalElement(message: string, onRestart: () => void): HTMLElement`

- [ ] **Step 1: 失敗する title-screen テストを書く**

`src/ui/title-screen.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createTitleScreenElement } from './title-screen';

describe('createTitleScreenElement', () => {
  it('デフォルトは先手・ふつうが選択されている', () => {
    const el = createTitleScreenElement(vi.fn());
    expect(el.querySelector('button[data-side="b"]')?.classList.contains('selected')).toBe(true);
    expect(el.querySelector('button[data-difficulty="normal"]')?.classList.contains('selected')).toBe(true);
  });

  it('先後・難易度を選び直せる', () => {
    const el = createTitleScreenElement(vi.fn());
    el.querySelector<HTMLButtonElement>('button[data-side="w"]')?.click();
    el.querySelector<HTMLButtonElement>('button[data-difficulty="strong"]')?.click();
    expect(el.querySelector('button[data-side="w"]')?.classList.contains('selected')).toBe(true);
    expect(el.querySelector('button[data-side="b"]')?.classList.contains('selected')).toBe(false);
    expect(el.querySelector('button[data-difficulty="strong"]')?.classList.contains('selected')).toBe(true);
  });

  it('スタートボタンで選択済みの内容が onStart に渡る', () => {
    const onStart = vi.fn();
    const el = createTitleScreenElement(onStart);
    el.querySelector<HTMLButtonElement>('button[data-side="w"]')?.click();
    el.querySelector<HTMLButtonElement>('button[data-difficulty="weak"]')?.click();
    el.querySelector<HTMLButtonElement>('button[data-action="start"]')?.click();
    expect(onStart).toHaveBeenCalledWith({ playerSide: 'w', difficulty: 'weak' });
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/ui/title-screen.test.ts`
Expected: FAIL（`src/ui/title-screen.ts` が存在しない）

- [ ] **Step 3: title-screen.ts を実装する**

`src/ui/title-screen.ts`:

```ts
import type { Difficulty } from '../ai/difficulty';

export type TitleScreenChoice = { playerSide: 'b' | 'w'; difficulty: Difficulty };

const SIDE_OPTIONS = [
  ['b', 'せんて'],
  ['w', 'ごて'],
] as const;

const DIFFICULTY_OPTIONS = [
  ['weak', 'よわい'],
  ['normal', 'ふつう'],
  ['strong', 'つよい'],
] as const;

export function createTitleScreenElement(onStart: (choice: TitleScreenChoice) => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'title-screen';

  let selectedSide: 'b' | 'w' = 'b';
  let selectedDifficulty: Difficulty = 'normal';

  const heading = document.createElement('h1');
  heading.textContent = 'しょうぎ どうじょう';

  const sideGroup = document.createElement('div');
  sideGroup.className = 'title-side-select';
  for (const [side, label] of SIDE_OPTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.side = side;
    button.addEventListener('click', () => {
      selectedSide = side;
      updateSelection();
    });
    sideGroup.appendChild(button);
  }

  const difficultyGroup = document.createElement('div');
  difficultyGroup.className = 'title-difficulty-select';
  for (const [difficulty, label] of DIFFICULTY_OPTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.difficulty = difficulty;
    button.addEventListener('click', () => {
      selectedDifficulty = difficulty;
      updateSelection();
    });
    difficultyGroup.appendChild(button);
  }

  function updateSelection(): void {
    for (const button of sideGroup.querySelectorAll<HTMLButtonElement>('button')) {
      button.classList.toggle('selected', button.dataset.side === selectedSide);
    }
    for (const button of difficultyGroup.querySelectorAll<HTMLButtonElement>('button')) {
      button.classList.toggle('selected', button.dataset.difficulty === selectedDifficulty);
    }
  }
  updateSelection();

  const startButton = document.createElement('button');
  startButton.type = 'button';
  startButton.dataset.action = 'start';
  startButton.textContent = 'たいきょく スタート';
  startButton.addEventListener('click', () => {
    onStart({ playerSide: selectedSide, difficulty: selectedDifficulty });
  });

  el.append(heading, sideGroup, difficultyGroup, startButton);
  return el;
}
```

- [ ] **Step 4: テストを実行してパスを確認する**

Run: `npx vitest run src/ui/title-screen.test.ts`
Expected: PASS（全3件）

- [ ] **Step 5: 失敗する end-game-modal テストを書く**

`src/ui/end-game-modal.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createEndGameModalElement } from './end-game-modal';

describe('createEndGameModalElement', () => {
  it('メッセージを表示する', () => {
    const el = createEndGameModalElement('あなたの かち！', vi.fn());
    expect(el.textContent).toContain('あなたの かち！');
  });

  it('「さいしょから」クリックで onRestart が呼ばれる', () => {
    const onRestart = vi.fn();
    const el = createEndGameModalElement('あなたの かち！', onRestart);
    el.querySelector<HTMLButtonElement>('button[data-action="restart"]')?.click();
    expect(onRestart).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: テストを実行して失敗を確認する**

Run: `npx vitest run src/ui/end-game-modal.test.ts`
Expected: FAIL（`src/ui/end-game-modal.ts` が存在しない）

- [ ] **Step 7: end-game-modal.ts を実装する**

`src/ui/end-game-modal.ts`:

```ts
export function createEndGameModalElement(message: string, onRestart: () => void): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'end-game-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'end-game-modal';

  const text = document.createElement('p');
  text.textContent = message;

  const restartButton = document.createElement('button');
  restartButton.type = 'button';
  restartButton.dataset.action = 'restart';
  restartButton.textContent = 'さいしょから';
  restartButton.addEventListener('click', onRestart);

  modal.append(text, restartButton);
  overlay.appendChild(modal);
  return overlay;
}
```

- [ ] **Step 8: テストを実行してパスを確認する**

Run: `npx vitest run src/ui/end-game-modal.test.ts`
Expected: PASS（全2件）

- [ ] **Step 9: style.css にタイトル・終局モーダルのスタイルを追記する**

`src/ui/style.css` の末尾に追記:

```css
.title-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px;
}

.title-side-select button,
.title-difficulty-select button {
  min-height: 44px;
  padding: 0 16px;
  margin: 0 4px;
}

.title-side-select button.selected,
.title-difficulty-select button.selected {
  background: #2a7;
  color: white;
}

.end-game-modal-overlay,
.promotion-dialog-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
}

.end-game-modal,
.promotion-dialog {
  background: white;
  padding: 24px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
}

.end-game-modal button,
.promotion-dialog button {
  min-height: 44px;
  padding: 0 16px;
}
```

- [ ] **Step 10: lint を通す**

Run: `npx biome check .`
Expected: エラーなし

- [ ] **Step 11: commit**

```bash
git add src/ui/title-screen.ts src/ui/title-screen.test.ts src/ui/end-game-modal.ts src/ui/end-game-modal.test.ts src/ui/style.css
git commit -m "feat: add title screen and end-game modal"
```

---

### Task 22: localStorage保存/復元・app-controller・main.ts 結線

Worker とのやり取り（`AiClient`）を差し替え可能にすることで、Worker を実際に起動せずに「対局開始→着手→CPU応手→終局、待った、保存と復元」の統括ロジックをテストする。壊れた保存データや `localStorage` が使えない環境（プライベートモード等）でも `saveGame`/`loadGame` が例外を投げないようにする。

**Files:**
- Create: `src/app/save.ts`
- Create: `src/app/app-controller.ts`
- Create: `src/main.ts`
- Modify: `src/ui/board-controller.ts`（`setPosition` に王手・最終手のマーク情報を渡せるようにする）
- Modify: `src/core/rules.ts`（UI側から玉の位置を引けるよう `findKingSquare` を追加）
- Test: `src/app/save.test.ts`
- Test: `src/app/app-controller.test.ts`

**Interfaces:**
- Consumes: `GameState`/`createGameState`/`applyMoveToState`/`undoMove`/`resign`（Task 20, `src/app/game-state.ts`）、`moveToUsi`/`parseUsiMove`（`src/core/record.ts`）、`checkGameEnd`（`src/core/game-end.ts`）、`checkRepetition`（`src/core/repetition.ts`）、`toSfen`/`initialPosition`（`src/core/sfen.ts`）
- Produces: `saveGame(state: GameState): void`、`loadGame(): GameState | null`、`clearSave(): void`（`src/app/save.ts`）、`type AiClient = { requestMove: (sfen: string, difficulty: Difficulty) => Promise<string> }`、`type AppController = { getState: () => GameState; handlePlayerMove: (move: Move) => Promise<void>; undo: () => void; resign: () => void; restart: (playerSide: 'b' | 'w', difficulty: Difficulty) => Promise<void> }`、`createAppController(initialState: GameState, aiClient: AiClient, onStateChange: (state: GameState) => void): AppController`、`findKingSquare(pos: Position, side: 'b' | 'w'): number | null`（`src/core/rules.ts`）、`BoardController.setPosition` のシグネチャが `(pos: Position, marks?: { lastMove?: Move; checkedKingSquare?: number }) => void` に変わる

- [ ] **Step 1: 失敗する save テストを書く**

`src/app/save.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { clearSave, loadGame, saveGame } from './save';
import { applyMoveToState, createGameState } from './game-state';
import { ROOK } from '../core/piece';
import { parseSfen } from '../core/sfen';
import { squareIndex } from '../core/square';

afterEach(() => {
  localStorage.clear();
});

describe('saveGame / loadGame', () => {
  it('保存前は null を返す', () => {
    expect(loadGame()).toBeNull();
  });

  it('保存した対局を復元できる(手順・難易度・先後を含む)', () => {
    let state = createGameState('w', 'strong');
    state = applyMoveToState(state, { from: squareIndex(7, 7), to: squareIndex(7, 6), promote: false });
    saveGame(state);

    const loaded = loadGame();
    expect(loaded?.difficulty).toBe('strong');
    expect(loaded?.playerSide).toBe('w');
    expect(loaded?.moveHistory).toEqual(state.moveHistory);
    expect(loaded?.history).toHaveLength(2);
  });

  it('終局済みの対局を復元すると endResult が再構築される', () => {
    const state = createGameState('b', 'normal');
    // 後手玉9一、先手金8二(逃げ場を制圧)、先手持ち駒に飛車。飛車を9二に打てば詰み(Task 6/8と同じ局面)。
    const mateState = { ...state, history: [parseSfen('k8/1G7/9/9/9/9/9/9/9 b R 1')] };
    const afterMate = applyMoveToState(mateState, {
      from: null,
      to: squareIndex(9, 2),
      promote: false,
      drop: ROOK,
    });
    saveGame(afterMate);

    const loaded = loadGame();
    expect(loaded?.status).toBe('ended');
    expect(loaded?.endResult).toEqual({ type: 'checkmate', winner: 'b' });
  });

  it('壊れたJSONは null を返す', () => {
    localStorage.setItem('shogi-vs-cpu:save', '{not valid json');
    expect(loadGame()).toBeNull();
  });

  it('必須フィールドが欠けたデータは null を返す', () => {
    localStorage.setItem('shogi-vs-cpu:save', JSON.stringify({ moveHistory: [] }));
    expect(loadGame()).toBeNull();
  });

  it('不正な difficulty 値のデータは null を返す', () => {
    localStorage.setItem(
      'shogi-vs-cpu:save',
      JSON.stringify({ moveHistory: [], difficulty: 'invalid', playerSide: 'b' }),
    );
    expect(loadGame()).toBeNull();
  });

  it('clearSave で保存データが消える', () => {
    saveGame(createGameState('b', 'normal'));
    clearSave();
    expect(loadGame()).toBeNull();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run src/app/save.test.ts`
Expected: FAIL（`src/app/save.ts` が存在しない）

- [ ] **Step 3: save.ts を実装する**

`src/app/save.ts`:

```ts
import { applyMove } from '../core/apply-move';
import { checkGameEnd } from '../core/game-end';
import type { Move } from '../core/moves';
import type { Position } from '../core/position';
import { moveToUsi, parseUsiMove } from '../core/record';
import { checkRepetition } from '../core/repetition';
import { initialPosition } from '../core/sfen';
import type { Difficulty } from '../ai/difficulty';
import type { GameEndInfo, GameState } from './game-state';

const STORAGE_KEY = 'shogi-vs-cpu:save';

type SaveData = {
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
    Array.isArray(data.moveHistory) &&
    data.moveHistory.every((m) => typeof m === 'string') &&
    isValidDifficulty(data.difficulty) &&
    isValidSide(data.playerSide)
  );
}

export function saveGame(state: GameState): void {
  const data: SaveData = {
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

  let pos: Position = initialPosition();
  const history: Position[] = [pos];
  const moveHistory: Move[] = [];
  try {
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
```

- [ ] **Step 4: テストを実行してパスを確認する**

Run: `npx vitest run src/app/save.test.ts`
Expected: PASS（全7件）

- [ ] **Step 5: lint を通す**

Run: `npx biome check .`
Expected: エラーなし

- [ ] **Step 6: commit**

```bash
git add src/app/save.ts src/app/save.test.ts
git commit -m "feat: add localStorage save/load with defensive validation"
```

- [ ] **Step 7: 失敗する app-controller テストを書く**

`src/app/app-controller.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppController } from './app-controller';
import { createGameState } from './game-state';
import { squareIndex } from '../core/square';

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe('createAppController', () => {
  it('プレイヤーの手の後、CPU番なら自動的にAIの手が適用される', async () => {
    const state = createGameState('b', 'normal');
    const aiClient = { requestMove: vi.fn().mockResolvedValue('3c3d') };
    const controller = createAppController(state, aiClient, vi.fn());

    await controller.handlePlayerMove({ from: squareIndex(7, 7), to: squareIndex(7, 6), promote: false });

    expect(aiClient.requestMove).toHaveBeenCalled();
    expect(controller.getState().moveHistory).toHaveLength(2);
  });

  it('CPUの応手には最低思考時間(300ms)がかかる', async () => {
    vi.useFakeTimers();
    const state = createGameState('b', 'normal');
    const aiClient = { requestMove: vi.fn().mockResolvedValue('3c3d') };
    const controller = createAppController(state, aiClient, vi.fn());

    const movePromise = controller.handlePlayerMove({
      from: squareIndex(7, 7),
      to: squareIndex(7, 6),
      promote: false,
    });
    await vi.advanceTimersByTimeAsync(299);
    expect(controller.getState().moveHistory).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    await movePromise;
    expect(controller.getState().moveHistory).toHaveLength(2);
  });

  it('undo で1手戻る', async () => {
    const state = createGameState('b', 'normal');
    const aiClient = { requestMove: vi.fn().mockResolvedValue('3c3d') };
    const controller = createAppController(state, aiClient, vi.fn());
    await controller.handlePlayerMove({ from: squareIndex(7, 7), to: squareIndex(7, 6), promote: false });
    controller.undo();
    expect(controller.getState().moveHistory).toHaveLength(1);
  });

  it('resign で対局が終了する', () => {
    const state = createGameState('b', 'normal');
    const controller = createAppController(state, { requestMove: vi.fn() }, vi.fn());
    controller.resign();
    expect(controller.getState().status).toBe('ended');
  });

  it('restart で新しい対局になり、後手選択ならCPU(先手)が自動的に指す', async () => {
    const state = createGameState('b', 'normal');
    const aiClient = { requestMove: vi.fn().mockResolvedValue('7g7f') };
    const controller = createAppController(state, aiClient, vi.fn());
    await controller.restart('w', 'weak');
    expect(controller.getState().moveHistory).toHaveLength(1);
    expect(controller.getState().playerSide).toBe('w');
  });

  it('状態変化のたびに localStorage に保存される', async () => {
    const state = createGameState('b', 'normal');
    const aiClient = { requestMove: vi.fn().mockResolvedValue('3c3d') };
    const controller = createAppController(state, aiClient, vi.fn());
    await controller.handlePlayerMove({ from: squareIndex(7, 7), to: squareIndex(7, 6), promote: false });
    expect(localStorage.getItem('shogi-vs-cpu:save')).not.toBeNull();
  });

  it('状態変化のたびに onStateChange が呼ばれる', async () => {
    const state = createGameState('b', 'normal');
    const aiClient = { requestMove: vi.fn().mockResolvedValue('3c3d') };
    const onStateChange = vi.fn();
    const controller = createAppController(state, aiClient, onStateChange);
    await controller.handlePlayerMove({ from: squareIndex(7, 7), to: squareIndex(7, 6), promote: false });
    expect(onStateChange).toHaveBeenCalled();
  });
});
```

- [ ] **Step 8: テストを実行して失敗を確認する**

Run: `npx vitest run src/app/app-controller.test.ts`
Expected: FAIL（`src/app/app-controller.ts` が存在しない）

- [ ] **Step 9: app-controller.ts を実装する**

`src/app/app-controller.ts`:

```ts
import type { Move } from '../core/moves';
import { parseUsiMove } from '../core/record';
import { toSfen } from '../core/sfen';
import type { Difficulty } from '../ai/difficulty';
import { applyMoveToState, createGameState, currentPosition, resign as resignState, undoMove } from './game-state';
import type { GameState } from './game-state';
import { clearSave, saveGame } from './save';

const MIN_THINKING_TIME_MS = 300;

export type AiClient = {
  requestMove: (sfen: string, difficulty: Difficulty) => Promise<string>;
};

export type AppController = {
  getState: () => GameState;
  handlePlayerMove: (move: Move) => Promise<void>;
  undo: () => void;
  resign: () => void;
  restart: (playerSide: 'b' | 'w', difficulty: Difficulty) => Promise<void>;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createAppController(
  initialState: GameState,
  aiClient: AiClient,
  onStateChange: (state: GameState) => void,
): AppController {
  let state = initialState;

  function setState(newState: GameState): void {
    state = newState;
    onStateChange(state);
    saveGame(state);
  }

  async function runCpuTurnIfNeeded(): Promise<void> {
    if (state.status === 'ended') return;
    if (currentPosition(state).sideToMove === state.playerSide) return;

    const sfen = toSfen(currentPosition(state));
    const [usiMove] = await Promise.all([
      aiClient.requestMove(sfen, state.difficulty),
      delay(MIN_THINKING_TIME_MS),
    ]);
    const move = parseUsiMove(usiMove);
    setState(applyMoveToState(state, move));
  }

  async function handlePlayerMove(move: Move): Promise<void> {
    setState(applyMoveToState(state, move));
    await runCpuTurnIfNeeded();
  }

  return {
    getState: () => state,
    handlePlayerMove,
    undo: () => setState(undoMove(state)),
    resign: () => setState(resignState(state)),
    restart: async (playerSide, difficulty) => {
      clearSave();
      setState(createGameState(playerSide, difficulty));
      await runCpuTurnIfNeeded();
    },
  };
}
```

- [ ] **Step 10: テストを実行してパスを確認する**

Run: `npx vitest run src/app/app-controller.test.ts`
Expected: PASS（全7件）

- [ ] **Step 11: lint を通す**

Run: `npx biome check .`
Expected: エラーなし

- [ ] **Step 12: commit**

```bash
git add src/app/app-controller.ts src/app/app-controller.test.ts
git commit -m "feat: add app controller orchestrating moves, cpu turns, and persistence"
```

- [ ] **Step 13: board-controller.ts と rules.ts を拡張する（main.ts で王手・最終手の表示を結線するための準備）**

`src/core/rules.ts` の末尾に追記（`isInCheck` が使う内部の `findKing` とは別に、UI から呼べる null 許容版を用意する）:

```ts
export function findKingSquare(pos: Position, side: 'b' | 'w'): number | null {
  const target = side === 'b' ? KING : -KING;
  for (let i = 0; i < 81; i++) {
    if (pos.board[i] === target) return i;
  }
  return null;
}
```

`src/ui/board-controller.ts` の `BoardController` 型と `setPosition` の実装を次のように変更する（`Move` は既に import 済み）:

```ts
export type BoardController = {
  element: HTMLElement;
  setPosition: (pos: Position, marks?: { lastMove?: Move; checkedKingSquare?: number }) => void;
  setInputEnabled: (enabled: boolean) => void;
  handlePieceTypeClick: (side: 'b' | 'w', pieceType: number) => void;
};
```

戻り値オブジェクトの `setPosition` を次のように置き換える:

```ts
    setPosition: (newPos, marks) => {
      pos = newPos;
      updateBoardElement(element, pos, marks);
      deselect();
    },
```

- [ ] **Step 14: 既存テストを実行し、後方互換であることを確認する**

Run: `npx vitest run src/ui/board-controller.test.ts src/core/rules.test.ts`
Expected: 全件 PASS（`setPosition` の第2引数はオプショナルなので Task 17-18 で書いた既存の呼び出しはそのまま動く）

- [ ] **Step 15: lint を通す**

Run: `npx biome check .`
Expected: エラーなし

- [ ] **Step 16: commit**

```bash
git add src/core/rules.ts src/ui/board-controller.ts
git commit -m "feat: expose king square lookup and board mark support for the app layer"
```

- [ ] **Step 17: main.ts を実装する（テスト不要。実際の Worker 生成と全UIコンポーネントの結線）**

`src/main.ts`:

```ts
import './ui/style.css';
import type { GameState } from './app/game-state';
import { createAppController, type AiClient } from './app/app-controller';
import { createGameState } from './app/game-state';
import { loadGame } from './app/save';
import { moveToKanji } from './core/record';
import { findKingSquare, isInCheck } from './core/rules';
import { createBoardController } from './ui/board-controller';
import { createControlsElement } from './ui/controls';
import { createEndGameModalElement } from './ui/end-game-modal';
import { appendRecordEntry, clearRecordView, createRecordViewElement } from './ui/record-view';
import { createHandsElement, updateHandsElement } from './ui/hands';
import { createStatusElement, setStatusText } from './ui/status-view';
import { createTitleScreenElement } from './ui/title-screen';

function createAiClient(): AiClient {
  const worker = new Worker(new URL('./ai/worker.ts', import.meta.url), { type: 'module' });
  return {
    requestMove: (sfen, difficulty) =>
      new Promise((resolve) => {
        function handleMessage(event: MessageEvent<{ usiMove: string }>): void {
          worker.removeEventListener('message', handleMessage);
          resolve(event.data.usiMove);
        }
        worker.addEventListener('message', handleMessage);
        worker.postMessage({ sfen, difficulty });
      }),
  };
}

function endMessageFor(state: GameState): string {
  if (state.endResult === null) return '';
  if (state.endResult.type === 'repetition') return 'せんにちて（ひきわけ）';
  const playerWon = state.endResult.winner === state.playerSide;
  return playerWon ? 'あなたの かち！' : 'あなたの まけ...';
}

function startGame(app: HTMLElement, playerSide: 'b' | 'w', difficulty: 'weak' | 'normal' | 'strong'): void {
  app.replaceChildren();

  const initialState = loadGame() ?? createGameState(playerSide, difficulty);
  const aiClient = createAiClient();
  const statusEl = createStatusElement();
  const recordEl = createRecordViewElement();
  const senteHandsEl = createHandsElement(initialState.history[0], 'b', (pieceType) =>
    boardController.handlePieceTypeClick('b', pieceType),
  );
  const goteHandsEl = createHandsElement(initialState.history[0], 'w', (pieceType) =>
    boardController.handlePieceTypeClick('w', pieceType),
  );

  const controller = createAppController(initialState, aiClient, render);

  const boardController = createBoardController(initialState.history[0], (move) => {
    void controller.handlePlayerMove(move);
  });

  const controlsEl = createControlsElement({
    onUndo: () => controller.undo(),
    onResign: () => controller.resign(),
    onRestart: () => startGame(app, playerSide, difficulty),
  });

  function render(state: GameState): void {
    const pos = state.history[state.history.length - 1];
    const lastMove = state.moveHistory[state.moveHistory.length - 1];
    const inCheck = isInCheck(pos, pos.sideToMove);
    const checkedKingSquare = inCheck ? (findKingSquare(pos, pos.sideToMove) ?? undefined) : undefined;

    boardController.setPosition(pos, { lastMove, checkedKingSquare });
    updateHandsElement(senteHandsEl, pos, 'b');
    updateHandsElement(goteHandsEl, pos, 'w');
    boardController.setInputEnabled(state.status === 'playing' && pos.sideToMove === state.playerSide);

    if (lastMove !== undefined) {
      const beforeMovePos = state.history[state.history.length - 2];
      if (beforeMovePos !== undefined) {
        clearRecordView(recordEl);
        let prev: typeof lastMove | null = null;
        for (let i = 0; i < state.moveHistory.length; i++) {
          const m = state.moveHistory[i];
          const p = state.history[i];
          if (m === undefined || p === undefined) continue;
          appendRecordEntry(recordEl, moveToKanji(m, p, prev));
          prev = m;
        }
      }
    }

    if (state.status === 'playing' && inCheck) {
      setStatusText(statusEl, '王手！');
    } else if (state.status === 'playing' && pos.sideToMove !== state.playerSide) {
      setStatusText(statusEl, 'かんがえちゅう');
    } else {
      setStatusText(statusEl, '');
    }

    if (state.status === 'ended') {
      app.appendChild(createEndGameModalElement(endMessageFor(state), () => startGame(app, playerSide, difficulty)));
    }
  }

  app.append(goteHandsEl, boardController.element, senteHandsEl, controlsEl, statusEl, recordEl);
  render(initialState);
}

function main(): void {
  const app = document.getElementById('app');
  if (app === null) throw new Error('#app element not found');

  const resumed = loadGame();
  if (resumed !== null && resumed.status === 'playing') {
    startGame(app, resumed.playerSide, resumed.difficulty);
    return;
  }

  app.appendChild(
    createTitleScreenElement(({ playerSide, difficulty }) => startGame(app, playerSide, difficulty)),
  );
}

main();
```

`index.html` の `body` を次のように変更する（`<style>` タグを削除し `#app` のみにする。Task 16 で追加した `<link>` は維持）:

```html
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
```

- [ ] **Step 18: 型チェック・全テスト・lint を通す**

Run: `npx tsc --noEmit && npx vitest run && npx biome check .`
Expected: すべてエラーなし・全テスト PASS

- [ ] **Step 19: 開発サーバで実際に対局できることを目視確認する**

Run: `npm run dev`
Expected: タイトル画面が表示され、先後・難易度を選んで対局を開始できる。駒を動かす、持ち駒を打つ、CPUが応手する、詰みで終局モーダルが出る、の一連の流れをブラウザで確認する。王手時に「王手！」が表示され、王手されている玉のマスが強調されることも確認する

- [ ] **Step 20: commit**

```bash
git add src/main.ts index.html
git commit -m "feat: wire up the full game via main.ts"
```

---

### Task 23: デプロイ設定（wrangler と GitHub Actions）

**Files:**
- Create: `wrangler.toml`, `.github/workflows/deploy.yml`, `README.md`
- Modify: なし（`vite.config.ts` の `base` / `outDir` は Task 1 で設定済み）

**Interfaces:**
- Consumes: Task 1 の `vite.config.ts`
- Produces: `main` への push でビルド・デプロイされる CI

- [ ] **Step 1: ビルド出力の構造を確認する**

Run: `npm run build && find out -type f | head -20`
Expected: `out/play/shogi-vs-cpu/index.html` が存在すること。`out/index.html` になっていたら `vite.config.ts` の `build.outDir` が間違っている（Global Constraints 参照）

- [ ] **Step 2: wrangler.toml を作る**

`assets.directory` はネスト前の起点 `./out` を指す。Wrangler がその中から `play/shogi-vs-cpu/*` を探す。

```toml
name = "ankardo-game-shogi-vs-cpu"
compatibility_date = "2026-08-17"

routes = [
  { pattern = "ankardo.com/play/shogi-vs-cpu/*", zone_name = "ankardo.com" }
]

[assets]
directory = "./out"
not_found_handling = "404-page"
```

- [ ] **Step 3: pin する actions の SHA を調べる**

SHA は推測せず、必ず実際に引く。

```bash
gh api repos/actions/checkout/commits/v4.2.2 --jq .sha
gh api repos/actions/setup-node/commits/v4.1.0 --jq .sha
gh api repos/cloudflare/wrangler-action/commits/v3.14.0 --jq .sha
```

- [ ] **Step 4: .github/workflows/deploy.yml を作る**

`<SHA_*>` は Step 3 の出力で置き換える。`node-version` は 22 以上、`wrangler` は Task 1 で `^4` に固定済み。どちらかを外すと wrangler-action が 3.90.0 にフォールバックし、パス付きルート + Assets のネスト構造をサポートせず `Workers which have static assets cannot be routed on a URL which has a path component` で失敗する。

```yaml
name: deploy

on:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@<SHA_CHECKOUT> # v4.2.2
      - uses: actions/setup-node@<SHA_SETUP_NODE> # v4.1.0
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: cloudflare/wrangler-action@<SHA_WRANGLER_ACTION> # v3.14.0
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

ankardo の `site.yml` にある `on.push.paths: ["site/**"]` / `defaults.run.working-directory: site` / `cache-dependency-path: site/package-lock.json` / Wrangler の `workingDirectory: site` は、`site/` サブディレクトリ構成を前提にした設定である。本リポジトリはルート直下構成なのでコピーしない。

- [ ] **Step 5: README.md を作る**

```markdown
# しょうぎ どうじょう (shogi-vs-cpu)

ブラウザで遊ぶ本将棋のCPU対戦ゲーム。自前実装のαβ探索AIと対局できる。
[ankardo](https://ankardo.com) のサブリソースとして `ankardo.com/play/shogi-vs-cpu/` で公開する。

- 設計: `docs/superpowers/specs/2026-08-17-shogi-vs-cpu-design.md`
- 実装計画: `docs/superpowers/plans/2026-08-17-shogi-vs-cpu.md`

## 開発

必要なもの: Node.js 22 以上

```bash
npm install
npm run dev     # 開発サーバ
npm test        # ユニットテスト (Vitest)
npm run build   # 型チェック + 本番ビルド (out/play/shogi-vs-cpu/)
```

## 構成

| ディレクトリ | 責務 |
|---|---|
| `src/core/` | 将棋のルール（盤表現・合法手生成・終局判定・棋譜）。純粋関数のみで DOM・Worker・タイマーを参照しない |
| `src/ai/` | 評価関数・αβ探索・難易度選択。`core` の合法手生成のみを使い、Worker 内で動く |
| `src/ui/` | DOM描画・入力・画面遷移。`core` を読み、`ai` とは Worker 経由でのみやり取りする |
| `src/app/` | 対局の状態遷移、Worker 起動、localStorage 保存/復元の統括 |

`src/core/**` は `window` / `document` / `localStorage` / タイマー / Worker を参照しない。

## デプロイ

`main` への push で GitHub Actions がビルドし、Cloudflare Workers Static Assets へデプロイする。

ビルド設定で注意する点:

- `vite.config.ts` の `base` は `/play/shogi-vs-cpu/`
- `vite.config.ts` の `build.outDir` は `out/play/shogi-vs-cpu`（`out` 直下にすると、パス付きルートの Workers では deploy が失敗する）
- `wrangler` は `^4` 系に固定し、CI の Node.js は 22 以上にする
- Worker は `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })` の形で生成する（文字列パス指定は base path 配下で 404 になる）
```

- [ ] **Step 6: ローカルで最終確認する**

Run: `npm test && npm run build`
Expected: どちらも成功。`out/play/shogi-vs-cpu/index.html` が生成される

- [ ] **Step 7: commit**

```bash
git add wrangler.toml .github/workflows/deploy.yml README.md
git commit -m "chore: add wrangler config, deploy workflow and README"
```

---

### Task 24: ankardo カタログへの登録内容と手動手順

ankardo は別リポジトリなので、このリポジトリからは**変更しない**。登録内容と手順をドキュメントとして残し、実施は別 PR で行う。

**Files:**
- Create: `docs/ankardo-registration.md`

**Interfaces:**
- Consumes: 設計書 7 章
- Produces: ankardo リポジトリ側で行う作業の手順書

- [ ] **Step 1: 手順書を書く**

`docs/ankardo-registration.md`:

```markdown
# ankardo への登録手順

このゲームを `ankardo.com/play/shogi-vs-cpu/` で公開するために、
ankardo リポジトリ側と GitHub 側で必要な作業をまとめる。
ankardo の `.claude/skills/new-game/SKILL.md` に対応する。

## 1. ankardo リポジトリに追加するファイル（別 PR）

`site/content/games/shogi-vs-cpu.json`:

```json
{
  "slug": "shogi-vs-cpu",
  "title": "しょうぎ どうじょう",
  "description": "コンピュータと対戦できる本将棋。強さは3段階から選べる。",
  "playUrl": "/play/shogi-vs-cpu/",
  "genre": "puzzle",
  "ageRange": "8歳〜",
  "players": "ひとり用",
  "difficulty": "むずかしめ"
}
```

`title` / `description` / `ageRange` / `difficulty` は設計書の案であり、公開前に調整してよい。

`site/lib/games.ts` の `getAllGames()` がこのディレクトリを自動で拾うので、コード変更は不要。
ただし必須フィールドが欠けていたり `genre` が `site/lib/genres.ts` の `GENRES` のキーでない場合、
`next build` がビルド時検証で失敗する。`puzzle` は定義済みのキー。

## 2. 人手が必要な作業

エージェントは実行しない。Cloudflare 認証情報を持つ担当者が行う。

- [ ] このリポジトリの GitHub Secrets を設定する

  ```bash
  CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
    ankardo/scripts/setup-game-secrets.sh akabee0161/shogi-vs-cpu
  ```

  `gh auth login` 済みで、対象リポジトリへの admin 権限が必要。

- [ ] このリポジトリに `production` environment の保護ルールを設定する（必須レビュアー、`main` ブランチのみ許可）
- [ ] 初回の `wrangler deploy` を承認して実行する
- [ ] ankardo 側の `site/` を再ビルド・デプロイし、カタログ一覧と詳細ページに反映されたことを確認する
- [ ] `https://ankardo.com/play/shogi-vs-cpu/` を実機（PC とスマホ縦持ち・横持ち）で開いて動作を確認する
```

- [ ] **Step 2: commit**

```bash
git add docs/ankardo-registration.md
git commit -m "docs: add ankardo catalog registration steps"
```

---

## 実装後の全体確認

すべてのタスクが終わったら、以下を通しで確認する。

- [ ] `npm test` — 全テストが PASS
- [ ] `npx tsc --noEmit` — 型エラーなし
- [ ] `npm run build` — `out/play/shogi-vs-cpu/index.html` が生成される
- [ ] `npx biome check .` — lint エラーなし
- [ ] `src/core/**` に `window` / `document` / `localStorage` / `Worker` の参照がないこと

  Run: `grep -rn "window\.\|document\.\|localStorage\|new Worker" src/core`
  Expected: 何も出力されない

- [ ] `src/ai/**`（`worker.ts` を除く）が DOM を参照しないこと

  Run: `grep -rln "document\." src/ai | grep -v worker.ts`
  Expected: 何も出力されない

- [ ] ゲーム内のボタン・メッセージ文言がひらがな中心であること（駒の漢字と棋譜表記は対象外）を目視確認する
- [ ] 深さ4までの perft テストが既知値と一致していること（Task 7 で要検証とした値が実際に一致したか再確認する）
```
