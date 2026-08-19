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
  read -r -s -p 'CLOUDFLARE_API_TOKEN: ' CLOUDFLARE_API_TOKEN
  printf '\n'
  read -r -p 'CLOUDFLARE_ACCOUNT_ID: ' CLOUDFLARE_ACCOUNT_ID
  export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
  ankardo/scripts/setup-game-secrets.sh akabee0161/shogi-vs-cpu
  ```

  `gh auth login` 済みで、対象リポジトリへの admin 権限が必要。

- [ ] このリポジトリに `production` environment の保護ルールを設定する（必須レビュアー、`main` ブランチのみ許可）
- [ ] 初回の `wrangler deploy` を承認して実行する
- [ ] ankardo 側の `site/` を再ビルド・デプロイし、カタログ一覧と詳細ページに反映されたことを確認する
- [ ] `https://ankardo.com/play/shogi-vs-cpu/` を実機（PC とスマホ縦持ち・横持ち）で開いて動作を確認する
