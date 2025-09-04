# IE3 Slack to GitHub Lab Uploader - 技術仕様書

## 概要

SlackからGitHubリポジトリへの画像アップロードとメタデータ管理を行うCloudflare Workersアプリケーション。Slackに投稿された画像を自動でGitHubに保存し、JSON形式のメタデータを更新する。

## システム構成

### プラットフォーム
- 実行環境: Cloudflare Workers
- 言語: TypeScript
- パッケージマネージャー: npm
- Webフレームワーク: Hono

### 主要依存関係
```json
{
  "dependencies": {
    "hono": "^4.9.6",
    "@cf-wasm/photon": "^0.1.31"
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
- エンドポイント: `/slack/events`（メッセージ処理）
- エンドポイント: `/slack/interactive`（ボタン処理）
- メソッド: POST
- 認証: Slack署名検証

#### 1.2 インタラクティブフロー
1. 画像付きメッセージをSlackに投稿（最初の画像を処理）
2. 日付入力（必須）→ `YYYY/MM/DD` に整形
3. タイトル入力（任意、`no` でスキップ）
4. リンク入力（任意、`no` でスキップ・Slackハイパーリンク `<url|text>` 対応）
5. GitHubへ画像+JSONを単一コミットでアップロード
6. 完了後に編集・削除ボタンを提示

#### 1.3 入力仕様
- 日付: `YYYYMMDD` / `MMDD` を受理し、`YYYY/MM/DD` に整形（基本妥当性チェックあり）
- タイトル: 任意。`no` で空文字
- リンク: 任意。`no` で空文字。Slackハイパーリンク形式対応（`<url|text>` → `url` 抽出）

#### 1.4 画像処理
- 対応: `image/*` MIME
- 最適化: 幅800px上限でリサイズ（縦横比維持）+ WebP変換（Photon）
- 保存先（リポジトリ）: `public/images/lab/YYYY/MM/`
- 保存先（JSON/サイト）: `/images/lab/YYYY/MM/`
- ファイル名: `{timestamp}_{sanitized_original_name}.webp`

### 2. ボタン機能
- 編集（✏️）: 日付・タイトル・リンクの個別編集
- 削除（🗑️）: 画像ファイルとJSONを同時更新（確認ダイアログあり）

### 3. GitHub統合

#### 3.1 APIとブランチ
- 使用API: Blobs / Trees / Commits / Refs（Contentsは読み取り）
- 1コミット原則: 画像とJSONを単一コミットで反映
- ブランチ: `main`（`wrangler.toml` の `GITHUB_BRANCH` で指定）

#### 3.2 ファイル構成
```
public/
└── images/
    └── lab/
        └── YYYY/
            └── MM/
                └── [timestamp]_[sanitized].webp

app/
└── data/
    └── lab.json
```

### 4. データ構造

#### 4.1 JSONメタデータ
```json
{
  "id": 28,
  "image": "/images/lab/2025/09/1756924937876_20250702-2.webp",
  "title": "タイトル（optional）",
  "datetime": "2025-04-01",
  "link": "https://example.com（optional）"
}
```

#### 4.2 配列管理
- 新規は配列先頭に追加
- IDは最大値+1の採番
- 降順で時系列を維持

#### 4.3 スレッド状態（KV）
```ts
interface FlowData {
  flowState: "waiting_date" | "waiting_title" | "waiting_link" | "completed" | "editing";
  imageFile?: { url: string; name: string; mimetype: string };
  collectedData: { date?: string; title?: string; link?: string };
  entryId?: number;
  editingField?: "date" | "title" | "link";
}
```

### 5. エラーハンドリングと検証
- 署名検証: Slack署名とタイムスタンプ検証
- 入力検証: 日付・リンクを検証（Slackリンク形式対応）
- エラー通知: Slackに色付きメッセージで詳細通知 + コンソールログ
- 失敗フォールバック: Slack送信失敗時は簡易メッセージ送信

## 環境設定

### wrangler.toml（例）
```toml
[vars]
IMAGE_PATH = "public/images/lab/"
JSON_PATH = "app/data/lab.json"
GITHUB_BRANCH = "main"

[[kv_namespaces]]
binding = "slack2postlab_threads"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-namespace-id"
```

### Secrets
```bash
wrangler secret put SLACK_BOT_TOKEN
wrangler secret put SLACK_SIGNING_SECRET
wrangler secret put GITHUB_TOKEN
wrangler secret put GITHUB_OWNER
wrangler secret put GITHUB_REPO
```

## コマンド
```bash
npm run dev          # ローカル開発
npm run build        # TypeScriptビルド
npm run deploy       # デプロイ
npm run typecheck    # 型チェック
npm run format       # 整形
npm run workers-log  # ライブログ
```

## アーキテクチャ

```
src/
├── index.ts              # Honoアプリ（署名検証/ルーティング）
├── types.ts              # 型定義
├── constants.ts          # 定数/メッセージ
├── handlers/
│   ├── flowHandler.ts    # フロー開始/進行
│   └── buttonHandler.ts  # ボタン処理
├── flow/
│   ├── flowInputHandlers.ts  # 日付/タイトル/リンク処理
│   ├── editHandlers.ts       # 編集/削除
│   ├── flowStates.ts         # 状態管理
│   ├── flowMessages.ts       # メッセージ構築
│   ├── flowValidation.ts     # 入力検証
│   └── uploadProcessor.ts    # 画像最適化+アップロード
├── github/
│   ├── dataOperations.ts     # JSON取得/更新（Contents/Blobs）
│   ├── uploadOperations.ts   # Blobs → Trees → Commits → Refs
│   ├── deleteOperations.ts   # 画像削除+JSON更新を単一コミット
│   ├── githubApi.ts          # 共通ヘッダー/エラー/参照取得
│   └── urlBuilder.ts         # URL生成（owner/repo/branch）
├── utils/
│   ├── slack.ts              # 署名検証/投稿/リンク抽出
│   ├── kv.ts                 # KV CRUD/配列ヘルパー
│   ├── imageOptimizer.ts     # Photon最適化
│   ├── messageFormatter.ts   # 文面の整形
│   ├── paths.ts              # サイト⇔レポ間のパス変換
│   └── response.ts           # 共通レスポンス
└── ui/
    └── slackBlocks.ts        # Block Kitテンプレート
```

## 処理フロー（要点）
1. `/slack/events` で受信 → 署名検証
2. 画像検出 → KVへ初期状態保存 → 日付入力を促すBlockを送信
3. 日付/タイトル/リンクを段階処理（検証→保存）
4. 画像最適化 → GitHubへ画像+JSONを単一コミット
5. 完了Block（編集/削除ボタン付き）を送信
6. 編集/削除は該当部分のみ更新しつつ、整合性を維持

## セキュリティ
- Slack署名検証（タイムスタンプ鮮度もチェック）
- GitHubトークンはWrangler Secretsで管理
- ボットメッセージ除外

## パフォーマンスと制約
- Slack 3秒ルール: 3秒以内の応答が望ましい
- 対策候補: 重い処理は `waitUntil()` でバックグラウンド化（現状はインラインが多く改善余地あり）
- Cloudflare CPU制限（~30秒）に留意

## 制限事項
- 1投稿につき最初の画像のみ対象
- 競合編集（複数名同時）は未対応
- Slackユーザー/チャンネル等のメタデータはJSON保存対象外

## API仕様
- `GET /` ヘルスチェック → `OK`
- `POST /slack/events` → メイン処理
- `POST /slack/interactive` → ボタン処理

## ログ・モニタリング
- `wrangler tail`（`npm run workers-log`）でリアルタイム監視
- 重要エラーはSlack通知（色付き）+ Console出力

## よくある落とし穴
- ブランチ不整合: `wrangler.toml` の `GITHUB_BRANCH` を正とする
- パス変換忘れ: JSONはサイトパス、GitHub操作はリポ内パス（`utils/paths.ts`）
- Slackリンク形式: `<url|text>` をそのまま使わず抽出関数を通す
- ファイル名サニタイズ: 短/非英数名はハッシュ化によりリネームされる

