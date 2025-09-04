# Slack to GitHub Image Uploader

Slackから投稿された画像をGitHubリポジトリにアップロードし、メタデータをJSONで管理するCloudflare Workerアプリケーション（TypeScript実装）。


https://api.slack.com/apps/A09DDERQ746/event-subscriptions


## 機能

- 📤 **インタラクティブ画像アップロード**: Slackで画像投稿後、ステップバイステップでメタデータ入力
- 💬 **チャット形式フロー**: 日付→タイトル→リンクの順で対話的に入力
- ✏️ **リアルタイム編集**: 投稿完了後にボタンで個別フィールドを編集
- 🗑️ **安全な削除**: 確認ダイアログ付きで画像ファイルとメタデータを完全削除
- 🎯 **スキップ機能**: タイトルとリンクは任意入力（スキップボタンで省略可能）
- 🔒 **TypeScript型安全性**: 完全な型定義とコンパイル時エラー検出

## セットアップ

### 1. Slack App作成

1. [Slack API](https://api.slack.com/apps)で「Create New App」→「From scratch」を選び、任意のアプリ名と開発用ワークスペースを指定して作成
2. サイドメニューの **OAuth & Permissions** を開き、「Scopes」>「Bot Token Scopes」に以下の権限を追加
   追加後は **Install to Workspace** をクリックしてボットをワークスペースにインストール
   - `files:read`
   - `channels:history`
   - `chat:write`
3. サイドメニューの **Event Subscriptions** を開き、「Subscribe to bot events」で以下のイベントを追加
   Request URL と **Enable Events** の設定は後の手順で行います
   - `file_shared`
   - `message.channels`
4. サイドメニューの **Interactivity & Shortcuts** を開き、「Interactivity」をオンに設定
   Request URL は後の手順で設定します
5. **OAuth & Permissions** で発行された **Bot User OAuth Token** と、**Basic Information** > **App Credentials** にある **Signing Secret** を控える

### 2. GitHub設定

1. Personal Access Token を生成
   - GitHub右上のプロフィールアイコン → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**
   - Note(メモ)と有効期限を設定し、**Select scopes** で **repo** にチェックを入れて作成
   - 表示されたトークンを控える
2. 画像を保存するリポジトリを準備
   - GitHub右上の **+** → **New repository** から新規リポジトリを作成するか、既存リポジトリを使用
   - リポジトリのオーナー名とリポジトリ名を控える（例: `username/repository-name`）
     これらは後の `GITHUB_OWNER` と `GITHUB_REPO` シークレット設定で使用します

### 3. Cloudflare Workersデプロイ

```bash
# 依存関係インストール
npm install

# TypeScriptビルド
npm run build

# KVネームスペース作成
wrangler kv namespace create "slack2postlab-threads"
wrangler kv namespace create "slack2postlab-threads" --preview

# シークレット設定
wrangler secret put SLACK_BOT_TOKEN
wrangler secret put SLACK_SIGNING_SECRET
wrangler secret put GITHUB_TOKEN
wrangler secret put GITHUB_OWNER
wrangler secret put GITHUB_REPO

# デプロイ
wrangler deploy
```

### 4. Slack App設定更新

1. **Event Subscriptions** で **Enable Events** をオンにし、Request URLに`https://slack2postlab.ie3.workers.dev/slack/events`を設定
2. **Interactivity & Shortcuts** で Request URLに`https://slack2postlab.ie3.workers.dev/slack/interactive`を設定
3. 両方のVerificationが成功したら **Save Changes** をクリック

## 開発

```bash
# 型チェック
npm run typecheck

# TypeScriptビルド
npm run build

# 開発サーバー起動
npm run dev

# フォーマット
npm run format
```

## プロジェクト構造

```
src/
├── index.ts              # メインエントリーポイント（Honoアプリケーション）
├── types.ts              # 型定義
├── constants.ts          # 定数・メッセージテンプレート（一元管理）
├── handlers/
│   ├── flowHandler.ts    # インタラクティブフロー処理
│   └── buttonHandler.ts  # ボタンインタラクション処理
├── flow/
│   ├── editHandlers.ts   # 編集・削除操作
│   ├── flowStates.ts     # フロー状態管理
│   ├── flowMessages.ts   # メッセージフォーマット
│   ├── flowValidation.ts # 入力バリデーション
│   └── uploadProcessor.ts # アップロード処理ロジック
├── github/
│   ├── dataOperations.ts # JSONデータ操作
│   ├── uploadOperations.ts # ファイルアップロード操作
│   ├── deleteOperations.ts # ファイル削除操作
│   ├── githubApi.ts      # GitHub APIヘルパー
│   └── urlBuilder.ts     # GitHub URL構築
├── utils/
│   ├── slack.ts          # Slack API関連ユーティリティ
│   ├── kv.ts            # KVストレージ・データ操作ユーティリティ
│   ├── imageOptimizer.ts # 画像処理（Photon WebAssembly）
│   └── messageFormatter.ts # メッセージフォーマットユーティリティ
└── ui/
    └── slackBlocks.ts    # Slack Block Kitテンプレート
```

## 技術スタック

- **フレームワーク**: [Hono](https://hono.dev/) - 軽量で高速なWebフレームワーク
- **実行環境**: Cloudflare Workers
- **言語**: TypeScript
- **ストレージ**: Cloudflare KV（スレッド状態管理）
- **API統合**:
  - Slack Events API（メッセージ処理）
  - Slack Interactive Components（ボタン処理）
  - GitHub Contents API（ファイル管理）
  - GitHub Tree API（一括コミット）

## 開発の流儀・守るべきこと

### 📋 Constants管理
- **硬直化の原則**: 全ての文字列・設定値は `constants.ts` に集約すること
- **カテゴリ分類**: `MESSAGES`, `BUTTONS`, `LOG_MESSAGES` 等で論理的にグループ化
- **型安全性**: `as const` を使用して型安全な定数定義

### 🏗️ アーキテクチャ原則
- **単一責任**: 各ファイルは明確な単一の目的を持つ
- **関心の分離**: ビジネスロジック、UI、外部API呼び出しを分離
- **再利用性**: 共通処理はユーティリティとして抽出

### ⚡ パフォーマンス制約
- **Slack 3秒ルール**: 重い処理は `waitUntil()` でバックグラウンド実行
- **即座のレスポンス**: Slackには必ず3秒以内に200 OKを返却
- **ユーザーフィードバック**: 処理中メッセージ → 完了メッセージの2段階通知

### 🔐 セキュリティ要件
- **署名検証**: 全SlackリクエストでSignature検証実施
- **入力検証**: ユーザー入力は必ずバリデーション
- **シークレット管理**: 認証情報はWrangler secretsで管理（hardcode禁止）

### 🐙 GitHub API使用原則
- **ブランチ指定必須**: 全API呼び出しでブランチを明示的に指定
- **一貫性**: urlBuilderヘルパーを必ず使用
- **エラーハンドリング**: GitHub API失敗時の詳細ログ出力

### 📝 TypeScript要件
- **Strict Mode**: TypeScript strict mode必須
- **型定義**: 全データ構造にinterface定義
- **any禁止**: `any` 型の使用禁止

### 🛠️ 開発時の注意点
- **デプロイ前確認**: `npm run typecheck` → `npm run build` → テスト実行
- **ログ監視**: `wrangler tail` でリアルタイム監視
- **エラー処理**: try-catch漏れがないか必ず確認

詳細な開発規約は [`CLAUDE.md`](./CLAUDE.md) を参照してください。

## ライセンス

MIT
