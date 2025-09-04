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
- **エンドポイント**: `/slack/events` (メッセージ処理)
- **エンドポイント**: `/slack/interactive` (ボタンインタラクション)
- **メソッド**: POST
- **認証**: Slack署名検証

#### 1.2 インタラクティブフロー
画像アップロード時、Slackでインタラクティブなフローが開始されます：

1. **初期画像アップロード**: 画像ファイル付きメッセージをSlackに投稿
2. **日付入力要求**: 「📅 日付を入力してください (YYYYMMDD)」
3. **タイトル入力要求**: 「📝 タイトルを入力してください (スキップ可能)」
4. **リンク入力要求**: 「🔗 リンクを入力してください (スキップ可能)」
5. **確認・アップロード**: すべての情報を確認してGitHubへアップロード
6. **編集・削除**: アップロード後に編集・削除ボタンが利用可能

#### 1.3 対応入力形式
**日付入力**:
- `YYYYMMDD`: 20241225 → 2024/12/25
- `MMDD`: 1225 → 2025/12/25 (現在の西暦を自動設定)
- スキップ不可（必須入力）

**タイトル・リンク入力**:
- 任意のテキスト入力
- 「スキップ」ボタンでスキップ可能

#### 1.4 画像処理
- **対応形式**: image/* MIMEタイプの画像ファイル
- **処理方法**: 画像データをそのままGitHubにアップロード
- **保存先**: `mock-dir/public/images/YYYY/MM/` 形式
- **ファイル名**: `{timestamp}_{original_filename}` 形式

### 2. インタラクティブボタン機能

#### 2.1 アップロード完了後のボタン
- **✏️ 編集**: 日付・タイトル・リンクの個別編集
- **🗑️ 削除**: エントリと画像ファイルの削除（確認ダイアログ付き）

#### 2.2 編集機能
各フィールドの編集が可能：
- **日付編集**: 既存の日付を新しい日付に変更
- **タイトル編集**: タイトルの追加・変更・削除
- **リンク編集**: リンクの追加・変更・削除

#### 2.3 削除機能
- 削除確認ダイアログ表示
- **🗑️ 削除実行**: JSONエントリと画像ファイルの両方を削除
- **❌ キャンセル**: 削除をキャンセル

### 3. GitHub統合

#### 3.1 ファイルアップロード
- **API**: GitHub Contents API & Tree API
- **同時アップロード**: 画像ファイル + JSON メタデータを1コミットで処理
- **ブランチ**: `develop` （設定可能）

#### 3.2 ファイル構成
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

### 4. データ構造

#### 4.1 JSONメタデータ形式
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

#### 4.2 配列管理
- 新しいアイテムは配列の先頭に追加
- IDは自動インクリメント
- 時系列降順で管理

#### 4.3 スレッドデータ管理
KVストレージを使用してスレッド状態を管理：
```typescript
interface FlowData {
  flowState: FlowState; // "waiting_date" | "waiting_title" | "waiting_link" | "completed" | "editing"
  imageFile?: { url: string; name: string; mimetype: string };
  collectedData: { date?: string; title?: string; link?: string };
  entryId?: number; // アップロード完了後に設定
  editingField?: "date" | "title" | "link"; // 編集中フィールド
}
```

### 5. エラーハンドリングと検証

#### 5.1 入力バリデーション
- **画像ファイル**: 画像MIMEタイプ（`image/*`）の検証
- **日付フォーマット**: 
  - 入力: `YYYYMMDD`（8桁）または `MMDD`（4桁）形式
  - 出力: `YYYY/MM/DD` 形式に自動変換
  - 検証: `YYYY/MM/DD` 形式の正規表現（`/^\d{4}\/\d{2}\/\d{2}$/`）
- **ボットメッセージ**: `bot_id`の存在チェックでボット投稿を除外
- **イベントタイプ**: `message`タイプのイベントのみ処理

#### 5.2 エラー応答
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

[[kv_namespaces]]
binding = "THREADS_KV"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-namespace-id"
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
├── constants.ts          # 定数・メッセージテンプレート
├── handlers/
│   ├── flowHandler.ts    # インタラクティブフロー処理
│   └── buttonHandler.ts  # ボタンインタラクション処理
└── utils/
    ├── slack.ts          # Slack API関連ユーティリティ
    ├── github.ts         # GitHub API関連ユーティリティ
    └── kv.ts            # KVストレージ・データ操作ユーティリティ
```

### 処理フロー

#### メインフロー
1. **Slack Webhook受信**: `/slack/events` エンドポイントでPOSTリクエスト受信
2. **署名検証**: Slack署名とタイムスタンプで認証検証
3. **URLVerification**: 初回設定時のチャレンジレスポンス処理
4. **イベント種別判定**:
   - 通常メッセージ（画像付き）→ インタラクティブフロー開始
   - スレッドメッセージ → フロー継続処理

#### インタラクティブフロー
1. **画像アップロード検出**: 画像ファイル付きメッセージを受信
2. **スレッド開始**: KVに初期フローデータを保存
3. **日付入力要求**: "waiting_date" 状態でユーザーに日付入力を求める
4. **日付バリデーション**: YYYY/MM/DD形式の検証
5. **タイトル入力要求**: "waiting_title" 状態でタイトル入力を求める（スキップ可能）
6. **リンク入力要求**: "waiting_link" 状態でリンク入力を求める（スキップ可能）
7. **GitHub同時アップロード**: 画像とJSONを1コミットでアップロード
8. **完了状態**: "completed" 状態で編集・削除ボタンを表示

#### ボタンインタラクション
1. **ボタンイベント受信**: `/slack/interactive` エンドポイントで処理
2. **アクション種別判定**: edit_date, edit_title, edit_link, delete_entry など
3. **状態更新**: フロー状態を "editing" に変更
4. **入力処理**: ユーザー入力に応じてGitHubデータを更新
5. **完了**: "completed" 状態に戻る

## セキュリティ

- Slack署名検証による認証
- GitHub Personal Access Token認証
- 環境変数でのシークレット管理
- ボットメッセージの除外処理

## 制限事項

- **単一画像処理**: 1回の投稿につき最初の画像のみ処理対象
- **画像形式**: `image/*` MIMEタイプの画像ファイルのみ対応
- **実行時間制限**: Cloudflare Workersの実行時間制限（CPU時間30秒）内での処理
- **KVストレージ**: スレッド状態管理にCloudflare KVを使用（結果整合性）
- **メタデータ拡張なし**: Slackユーザー情報やタイムスタンプの保存なし
- **同時編集制限**: 同じエントリを複数人が同時編集する場合の競合状態は未対応

## API仕様

### エンドポイント

#### `GET /`
- **用途**: ヘルスチェック
- **レスポンス**: `OK` (200)

#### `POST /slack/events`
- **用途**: Slack Events API Webhook（メッセージ処理）
- **認証**: Slack署名検証
- **Content-Type**: `application/json`
- **レスポンス**: 
  - 成功: `OK` (200)
  - 認証失敗: `Unauthorized` (401)
  - JSONパースエラー: `Invalid JSON` (400)

#### `POST /slack/interactive`
- **用途**: Slack Interactive Components（ボタン処理）
- **認証**: Slack署名検証
- **Content-Type**: `application/x-www-form-urlencoded`
- **レスポンス**:
  - 成功: `OK` (200)
  - 認証失敗: `Unauthorized` (401)

## ログ・モニタリング

- **Cloudflare Workers**: ログ有効化（`observability.logs.enabled = true`）
- **ローカル監視**: `npx wrangler tail --format pretty`
- **エラー通知**: Slackスレッドに詳細エラーメッセージ自動投稿
- **コンソールログ**: 処理エラーの詳細をWorkersコンソールに出力