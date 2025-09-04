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
3. サイドメニューの **Event Subscriptions** を開き、「Subscribe to bot events」で以下のイベントを追加
   Request URL と **Enable Events** の設定は後の手順で行います
   - `file_shared`
   - `message.channels`
4. **OAuth & Permissions** で発行された **Bot User OAuth Token** と、**Basic Information** > **App Credentials** にある **Signing Secret** を控える

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

1. Event Subscriptionsで **Enable Events** をオンにし、Request URLに`https://your-worker.workers.dev/slack/events`を設定
2. Verificationが成功したら **Save Changes** をクリック

## 使用方法

### 新規投稿

Slackで画像を添付して以下の形式で投稿:

```
date: 20240115
title: 新商品リリース
link: https://example.com
```

**日付フォーマット**:
- `YYYYMMDD`: 20241225
- `MMDD`: 1225 (現在の西暦を自動設定)

### 更新

投稿のスレッドで更新内容を送信:

```
title: 更新後のタイトル
date: 20240120
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
├── index.ts              # メインエントリーポイント（Honoアプリケーション）
├── types.ts              # 型定義
└── utils/
    ├── slack.ts          # Slack API関連ユーティリティ
    └── github.ts         # GitHub API関連ユーティリティ
```

## 技術スタック

- **フレームワーク**: [Hono](https://hono.dev/) - 軽量で高速なWebフレームワーク
- **実行環境**: Cloudflare Workers
- **言語**: TypeScript
- **API統合**: Slack Events API, GitHub Contents API

## ライセンス

MIT
