# Slack to GitHub Image Uploader

Slackから投稿された画像をGitHubリポジトリにアップロードし、メタデータをJSONで管理するCloudflare Workerアプリケーション（TypeScript実装）。

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
wrangler kv:namespace create "THREADS_KV"
wrangler kv:namespace create "THREADS_KV" --preview

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

1. **Event Subscriptions** で **Enable Events** をオンにし、Request URLに`https://your-worker.workers.dev/slack/events`を設定
2. **Interactivity & Shortcuts** で Request URLに`https://your-worker.workers.dev/slack/interactive`を設定
3. 両方のVerificationが成功したら **Save Changes** をクリック

## 使用方法

### インタラクティブフロー

1. **画像アップロード**: 
   Slackチャンネルに画像ファイルをアップロード（テキストは不要）

2. **日付入力**:
   ```
   📅 日付を入力してください (YYYYMMDD)
   ```
   - `YYYYMMDD`: 20241225 → 2024/12/25
   - `MMDD`: 1225 → 2025/12/25 (現在の西暦を自動設定)
   - **必須入力**（スキップ不可）

3. **タイトル入力**:
   ```
   📝 タイトルを入力してください (スキップ可能)
   ```
   - 任意のテキストを入力
   - 「📝 スキップ」ボタンで省略可能

4. **リンク入力**:
   ```
   🔗 リンクを入力してください (スキップ可能)
   ```
   - URL形式のリンクを入力
   - 「🔗 スキップ」ボタンで省略可能

5. **アップロード完了**:
   緑色のサイドバー付きで完了メッセージが表示され、以下のボタンが利用可能：
   - **✏️ 編集**: 個別フィールドの編集
   - **🗑️ 削除**: エントリと画像ファイルの削除

### 編集・削除操作

**編集**:
- ✏️ボタンをクリック後、編集したいフィールド（日付/タイトル/リンク）を選択
- 新しい値を入力してエンター

**削除**:
- 🗑️ボタンをクリック
- 確認ダイアログで「🗑️ 削除実行」を選択
- JSONエントリと画像ファイルの両方が削除されます

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
├── constants.ts          # 定数・メッセージテンプレート
├── handlers/
│   ├── flowHandler.ts    # インタラクティブフロー処理
│   └── buttonHandler.ts  # ボタンインタラクション処理
└── utils/
    ├── slack.ts          # Slack API関連ユーティリティ
    ├── github.ts         # GitHub API関連ユーティリティ
    └── kv.ts            # KVストレージ・データ操作ユーティリティ
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

## ライセンス

MIT
