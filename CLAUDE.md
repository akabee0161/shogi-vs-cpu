# CLAUDE.md

shogi-vs-cpu で作業する際の指針。

## ブランチとプレビュー

- 機能ブランチから `develop` への PR を最初に作る。`develop` にマージすると、Cloudflare Access の受付の後ろに確認用のプレビューが固定の URL に自動で上がる（`.github/workflows/preview.yml`）
- 本番に出すときは、`develop` から `main` への PR をマージする（`deploy.yml` が本番に出す）
- `preview.yml` は `develop` への push だけで動き、`wrangler deploy` は書かない。`wrangler.toml` の `preview_urls = true` は確認用プレビューのためで、本番の `workers.dev` は開かない
- `develop` ができるまでの最初の PR（プレビューの導入そのもの）だけは `main` に向ける
