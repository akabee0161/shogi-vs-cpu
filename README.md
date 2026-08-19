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
