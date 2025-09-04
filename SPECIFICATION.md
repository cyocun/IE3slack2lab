# IE3 Slack to GitHub Lab Uploader - 技術仕様書

## 概要

SlackからGitHubリポジトリへの画像アップロードとメタデータ管理を行うCloudflare Workers アプリケーション。Slackに投稿された画像を自動的にGitHubにアップロードし、JSON形式でメタデータを管理する。

## システム構成

### プラットフォーム
- **実行環境**: Cloudflare Workers
- **言語**: TypeScript
- **パッケージマネージャー**: npm
- **Webフレームワーク**: Hono

### 主要依存関係
```json
{
  "dependencies": {
    "hono": "^4.9.6"
  },
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
date: YYYYMMDD または MMDD (required)
title: [タイトル] (optional)  
link: [URL] (optional)
```

**日付フォーマット**:
- `YYYYMMDD`: 20241225 → 2024/12/25
- `MMDD`: 1225 → 2025/12/25 (現在の西暦を自動設定)

#### 1.3 画像処理
- **対応形式**: image/* MIMEタイプの画像ファイル
- **処理方法**: 画像データをそのままGitHubにアップロード
- **保存先**: `mock-dir/public/images/YYYY/MM/` 形式
- **ファイル名**: `{timestamp}_{original_filename}` 形式

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
  "link": "https://example.com（optional）"
}
```

注意: 現在の実装では、Slackメタデータ（アップロード日時、ユーザー情報、チャンネル情報等）の保存は含まれていません。

#### 3.2 配列管理
- 新しいアイテムは配列の先頭に追加
- IDは自動インクリメント
- 時系列降順で管理

### 4. エラーハンドリングと検証

#### 4.1 入力バリデーション
- **画像ファイル**: 画像MIMEタイプ（`image/*`）の検証
- **日付フォーマット**: 
  - 入力: `YYYYMMDD`（8桁）または `MMDD`（4桁）形式
  - 出力: `YYYY/MM/DD` 形式に自動変換
  - 検証: `YYYY/MM/DD` 形式の正規表現（`/^\d{4}\/\d{2}\/\d{2}$/`）
- **ボットメッセージ**: `bot_id`の存在チェックでボット投稿を除外
- **イベントタイプ**: `message`タイプのイベントのみ処理

#### 4.2 エラー応答
- **フォーマットエラー**: Slackスレッドに詳細なエラーメッセージを投稿
- **処理エラー**: エラー詳細とスタックトレースをSlackに通知
- **認証エラー**: 401 Unauthorizedを返却

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
├── index.ts              # メインエントリポイント（Honoアプリケーション）
├── types.ts              # 型定義
└── utils/
    ├── slack.ts          # Slack API関連ユーティリティ
    └── github.ts         # GitHub API関連ユーティリティ
```

### 処理フロー
1. **Slack Webhook受信**: `/slack/events` エンドポイントでPOSTリクエスト受信
2. **署名検証**: Slack署名とタイムスタンプで認証検証
3. **URLVerification**: 初回設定時のチャレンジレスポンス処理
4. **イベントフィルタリング**: ボットメッセージや非画像メッセージを除外
5. **メッセージパース**: 英語形式（date、title、link）のパース
6. **日付バリデーション**: YYYY/MM/DD形式の検証
7. **画像ダウンロード**: Slack API経由で画像データ取得
8. **メタデータ生成**: 新規IDとLabEntryオブジェクト作成
9. **GitHub同時アップロード**: Contents APIで画像とJSONを1コミットでアップロード
10. **Slack応答**: 成功/エラーメッセージをスレッドに投稿

## セキュリティ

- Slack署名検証による認証
- GitHub Personal Access Token認証
- 環境変数でのシークレット管理
- ボットメッセージの除外処理

## 制限事項

- **単一画像処理**: 1回の投稿につき最初の画像のみ処理対象
- **画像形式**: `image/*` MIMEタイプの画像ファイルのみ対応
- **実行時間制限**: Cloudflare Workersの実行時間制限（CPU時間30秒）内での処理
- **スレッド機能なし**: 現在の実装では削除・更新機能は未実装
- **メタデータ拡張なし**: Slackユーザー情報やタイムスタンプの保存なし

## API仕様

### エンドポイント

#### `GET /`
- **用途**: ヘルスチェック
- **レスポンス**: `OK` (200)

#### `POST /slack/events`
- **用途**: Slack Events API Webhook
- **認証**: Slack署名検証
- **Content-Type**: `application/json`
- **レスポンス**: 
  - 成功: `OK` (200)
  - 認証失敗: `Unauthorized` (401)
  - JSONパースエラー: `Invalid JSON` (400)

## ログ・モニタリング

- **Cloudflare Workers**: ログ有効化（`observability.logs.enabled = true`）
- **ローカル監視**: `npx wrangler tail --format pretty`
- **エラー通知**: Slackスレッドに詳細エラーメッセージ自動投稿
- **コンソールログ**: 処理エラーの詳細をWorkersコンソールに出力