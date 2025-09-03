# IE3 Slack to GitHub Lab Uploader - 現在の仕様書

## 概要

SlackからGitHubリポジトリへの画像アップロードとメタデータ管理を行うCloudflare Workers アプリケーション。Slackに投稿された画像を自動的にGitHubにアップロードし、JSON形式でメタデータを管理する。

## システム構成

### プラットフォーム
- **実行環境**: Cloudflare Workers
- **言語**: TypeScript
- **パッケージマネージャー**: npm

### 主要依存関係
```json
{
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240117.0",
    "@types/node": "^20.11.5",
    "prettier": "^3.2.4",
    "typescript": "^5.3.3",
    "vitest": "^3.2.4",
    "wrangler": "^4.33.2"
  }
}
```

## 機能仕様

### 1. Slackメッセージ処理

#### 1.1 基本投稿処理
- **エンドポイント**: `/slack/events`
- **メソッド**: POST
- **認証**: Slack署名検証

#### 1.2 対応メッセージ形式
```
title: [タイトル] (optional)
date: YYYY/MM/DD (required)
url: [URL] (optional)
```

#### 1.3 画像処理
- **対応形式**: 画像ファイル（詳細な形式は実装に依存）
- **リサイズ処理**: 自動リサイズ機能有り
- **保存先**: `mock-dir/public/images/YYYY/MM/` 形式

### 2. GitHub統合

#### 2.1 ファイルアップロード
- **API**: GitHub Contents API & Tree API
- **同時アップロード**: 画像ファイル + JSON メタデータを1コミットで処理
- **ブランチ**: `develop` （設定可能）

#### 2.2 ファイル構成
```
mock-dir/
├── public/
│   └── images/
│       └── YYYY/
│           └── MM/
│               └── [timestamp_filename]
└── app/
    └── data/
        └── lab.json
```

### 3. データ構造

#### 3.1 JSONメタデータ形式
```json
{
  "id": 28,
  "image": "/mock-dir/public/images/2025/09/1756924937876_20250702-2.jpg",
  "title": "タイトル（optional）",
  "datetime": "2025-04-01",
  "link": "https://example.com（optional）",
  "metadata": {
    "uploaded_at": "2025-09-03T18:42:18.081Z",
    "updated_at": "2025-09-03T18:42:18.081Z",
    "slack_user": "U8QAVGL07",
    "slack_channel": "C09CY145CFR",
    "slack_thread_ts": "1756924936.200809",
    "slack_message_ts": "1756924936.200809"
  }
}
```

#### 3.2 配列管理
- 新しいアイテムは配列の先頭に追加
- IDは自動インクリメント
- 時系列降順で管理

### 4. スレッド機能

#### 4.1 スレッド操作
- **削除**: スレッドでの特定コマンドで既存アイテム削除可能
- **更新**: スレッドでのメタデータ更新機能

### 5. エラーハンドリング

#### 5.1 バリデーション
- 画像添付必須チェック
- 日付フォーマット検証
- メッセージ形式検証

#### 5.2 エラー応答
- フォーマットエラー時の詳細メッセージ
- Slack上でのリアルタイムエラー通知

### 6. 文字エンコーディング対応

#### 6.1 UTF-8/絵文字対応
- JSON更新時の絵文字文字化け問題を解決
- base64エンコード/デコード時のUTF-8適切処理
- `encodeURIComponent/decodeURIComponent` + `escape/unescape` パターン使用

## 環境設定

### 環境変数 (wrangler.toml)
```toml
[vars]
IMAGE_PATH = "mock-dir/public/images/"
JSON_PATH = "mock-dir/app/data/lab.json"
GITHUB_BRANCH = "develop"
```

### シークレット設定
```bash
wrangler secret put SLACK_BOT_TOKEN
wrangler secret put SLACK_SIGNING_SECRET
wrangler secret put GITHUB_TOKEN
wrangler secret put GITHUB_OWNER
wrangler secret put GITHUB_REPO
```

## コマンド

### 開発・デプロイ
```bash
npm run dev          # ローカル開発
npm run build        # TypeScriptビルド
npm run deploy       # Cloudflareにデプロイ
npm run typecheck    # 型チェック
npm run format       # コード整形
npm run test         # テスト実行
```

### Slackコマンド
- `/format`: 投稿フォーマットヘルプを表示

## アーキテクチャ

### ファイル構成
```
src/
├── index.ts              # メインエントリポイント
├── handlers/
│   ├── message.ts        # メッセージ処理
│   └── thread.ts         # スレッド操作
├── lib/
│   ├── slack.ts          # Slack API客户端
│   ├── github.ts         # GitHub API客户端
│   └── image.ts          # 画像処理
├── utils/
│   └── parser.ts         # メッセージパース
└── types/
    └── index.ts          # 型定義
```

### 処理フロー
1. Slack Webhook受信
2. 署名検証
3. メッセージ/スレッド判定
4. パース & バリデーション
5. 画像ダウンロード & リサイズ
6. GitHub同時アップロード（画像 + JSON）
7. Slack応答

## セキュリティ

- Slack署名検証による認証
- GitHub Personal Access Token認証
- 環境変数でのシークレット管理
- ボットメッセージの除外処理

## 制限事項

- 1回の投稿につき1画像のみ対応
- 画像形式制限有り（詳細は実装依存）
- Cloudflare Workers実行時間制限内での処理
- メモリベースの重複イベント防止（再起動でリセット）

## 最近の修正

### 絵文字対応改善 (2025-09-03)
- JSON更新時の絵文字文字化け問題を修正
- UTF-8エンコーディング/デコーディング処理を改善
- base64変換時のUnicode文字適切処理を実装

## ログ・モニタリング

- Cloudflare Workers ログ有効化
- `npx wrangler tail --format pretty` でリアルタイムログ監視可能
- Slackメッセージでの処理状況通知