# Slack to GitHub Image Uploader

Slackから投稿された画像をGitHubリポジトリにアップロードし、メタデータをJSONで管理するCloudflare Workerアプリケーション（TypeScript実装）。

## 機能

- 📤 Slack投稿の画像を自動リサイズしてGitHubにアップロード
- 📝 タイトル、日付、リンクのメタデータ管理
- ✏️ スレッドでの投稿編集機能
- 🗑️ スレッドでの削除機能
- ❌ フォーマットエラー時の自動ガイド
- 🔒 TypeScriptによる型安全性

## セットアップ

### 1. Slack App作成

1. [Slack API](https://api.slack.com/apps)で「Create New App」→「From scratch」を選び、任意のアプリ名と開発用ワークスペースを指定して作成
2. サイドメニューの **OAuth & Permissions** を開き、「Scopes」>「Bot Token Scopes」に以下の権限を追加  
   追加後は **Install to Workspace** をクリックしてボットをワークスペースにインストール
   - `files:read`
   - `channels:history`
   - `chat:write`
3. サイドメニューの **Event Subscriptions** を開き、**Enable Events** をオンにして「Subscribe to bot events」で以下のイベントを追加  
   Request URL は後の手順で設定します
   - `file_shared`
   - `message`
4. **OAuth & Permissions** で発行された **Bot User OAuth Token** と、**Basic Information** > **App Credentials** にある **Signing Secret** を控える

### 2. GitHub設定

1. Personal Access Token を生成（`repo`権限）
2. 対象リポジトリを準備

### 3. Cloudflare Workersデプロイ

```bash
# 依存関係インストール
npm install

# TypeScriptビルド
npm run build

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

1. Event SubscriptionsのRequest URLに`https://your-worker.workers.dev/slack/events`を設定
2. Verificationが成功することを確認

## 使用方法

### 新規投稿

Slackで画像を添付して以下の形式で投稿:

```
タイトル: 新商品リリース
日付: 2024-01-15
リンク: https://example.com
```

### 更新

投稿のスレッドで更新内容を送信:

```
タイトル: 更新後のタイトル
日付: 2024-01-20
```

### 削除

投稿のスレッドで`delete`と送信

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
├── index.ts              # メインエントリーポイント
├── types/
│   └── index.ts          # 型定義
├── lib/
│   ├── slack.ts          # Slack API関連
│   ├── github.ts         # GitHub API関連
│   └── image.ts          # 画像処理
├── handlers/
│   ├── message.ts        # メッセージハンドリング
│   └── thread.ts         # スレッド操作
└── utils/
    └── parser.ts         # メッセージパース・バリデーション
```

## ライセンス

MIT
