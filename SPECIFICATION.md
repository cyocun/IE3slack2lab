# Slack to GitHub 画像アップロードシステム仕様書

## 1. システム概要

Slackから投稿された画像とメタデータを受け取り、画像を適切なサイズにリサイズしてGitHubリポジトリにアップロードし、JSONファイルを更新するシステム。

## 2. システム構成

```
[Slack App] → [Cloudflare Workers] → [GitHub API]
                     ↓
              [画像リサイズ処理]
```

## 3. Slack連携仕様

### 3.1 Slack App設定

- **Event Subscriptions**: 
  - `file_shared` - ファイル共有イベント
  - `message` - メッセージイベント
  
- **OAuth Scopes**: 
  - `files:read` - ファイル読み取り
  - `channels:history` - チャンネル履歴読み取り
  - `chat:write` - メッセージ送信（処理完了通知用）

### 3.2 入力フォーマット

#### 正しい投稿形式
Slackでの投稿形式:
```
画像ファイル添付 + メッセージ本文:
タイトル: [タイトル]
日付: [YYYY-MM-DD]
リンク: [URL]
```

#### フォーマットエラー時の自動返信
投稿フォーマットが正しくない場合、以下の形式でエラーメッセージを返信:
```
❌ 投稿フォーマットが正しくありません。

正しい形式:
タイトル: [タイトル]
日付: [YYYY-MM-DD]
リンク: [URL]

検出されたエラー:
- [具体的なエラー内容]

例:
タイトル: 新商品リリース
日付: 2024-01-15
リンク: https://example.com
```

### 3.3 スレッド操作

#### 削除機能
- 投稿のスレッドに「delete」と入力すると、該当データを削除
- 削除実行前に確認メッセージを返信
- 削除完了後、完了メッセージを返信

#### 更新機能
投稿のスレッドで以下の更新が可能:
- **タイトル更新**: `タイトル: [新しいタイトル]`
- **日付更新**: `日付: [YYYY-MM-DD]`
- **リンク更新**: `リンク: [新しいURL]`
- **画像更新**: 新しい画像を添付

複数項目の同時更新も可能:
```
タイトル: 更新後のタイトル
日付: 2024-01-20
[画像添付]
```

## 4. 画像処理仕様

- **リサイズ**: 最大幅 1200px (アスペクト比維持)
- **フォーマット**: JPEG (品質85%)
- **ファイル名**: `{timestamp}_{original_name}.jpg`
- **保存先**: 環境変数で指定可能なパス

## 5. JSONデータ構造

```json
{
  "items": [
    {
      "id": "unique_id_timestamp",
      "title": "投稿タイトル",
      "date": "2024-01-15",
      "link": "https://example.com",
      "image": "path/to/image.jpg",
      "metadata": {
        "uploaded_at": "2024-01-15T10:30:00Z",
        "updated_at": "2024-01-15T10:30:00Z",
        "slack_user": "user_name",
        "slack_channel": "channel_name",
        "slack_thread_ts": "1234567890.123456",
        "slack_message_ts": "1234567890.123456"
      }
    }
  ],
  "last_updated": "2024-01-15T10:30:00Z"
}
```

## 6. Cloudflare Workers実装

### 6.1 エンドポイント

- `POST /slack/events` - Slackイベント受信
- `POST /slack/commands` - Slashコマンド対応（オプション）

### 6.2 環境変数/シークレット

```
SLACK_BOT_TOKEN      # Slack Bot Token
SLACK_SIGNING_SECRET # Slack署名検証用
GITHUB_TOKEN         # GitHub Personal Access Token
GITHUB_OWNER         # GitHubリポジトリオーナー
GITHUB_REPO          # GitHubリポジトリ名
GITHUB_BRANCH        # ブランチ名（デフォルト: main）
IMAGE_PATH           # 画像保存先パス
JSON_PATH            # JSONファイルパス
```

### 6.3 画像処理

Cloudflare Workersの画像リサイズAPI使用:

```javascript
const resizedImage = await fetch(imageUrl, {
  cf: {
    image: {
      width: 1200,
      quality: 85,
      format: "jpeg"
    }
  }
});
```

## 7. 処理フロー

### 7.1 Slackイベント受信

#### メッセージパース処理
```javascript
const parseMessage = (text) => {
  const title = text.match(/タイトル[：:]\s*(.+)/)?.[1]?.trim();
  const date = text.match(/日付[：:]\s*(\d{4}-\d{2}-\d{2})/)?.[1]?.trim();
  const link = text.match(/リンク[：:]\s*(.+)/)?.[1]?.trim();
  
  // バリデーション
  const errors = [];
  if (!title) errors.push('タイトルが未入力です');
  if (!date) errors.push('日付が未入力です');
  else if (!isValidDate(date)) errors.push('日付の形式が正しくありません (YYYY-MM-DD)');
  if (!link) errors.push('リンクが未入力です');
  else if (!isValidUrl(link)) errors.push('リンクの形式が正しくありません');
  
  return { title, date, link, errors };
};

// スレッド操作の判定
const parseThreadMessage = (text) => {
  if (text.toLowerCase() === 'delete') {
    return { action: 'delete' };
  }
  
  const updates = {};
  const title = text.match(/タイトル[：:]\s*(.+)/)?.[1]?.trim();
  const date = text.match(/日付[：:]\s*(\d{4}-\d{2}-\d{2})/)?.[1]?.trim();
  const link = text.match(/リンク[：:]\s*(.+)/)?.[1]?.trim();
  
  if (title) updates.title = title;
  if (date) updates.date = date;
  if (link) updates.link = link;
  
  if (Object.keys(updates).length > 0) {
    return { action: 'update', updates };
  }
  
  return null;
};
```

### 7.2 画像取得・リサイズ

```javascript
// Slack APIから画像URL取得
const fileInfo = await slack.files.info({ file: fileId });

// Cloudflare Image Resizingでリサイズ
const resized = await fetch(fileInfo.url_private_download, {
  headers: { 'Authorization': `Bearer ${SLACK_BOT_TOKEN}` },
  cf: { image: { width: 1200, quality: 85 } }
});
```

### 7.3 GitHub アップロード

```javascript
const uploadToGitHub = async (path, content, message) => {
  return await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: message,
        content: btoa(content),
        branch: GITHUB_BRANCH
      })
    }
  );
};

// 削除処理
const deleteFromGitHub = async (path, sha) => {
  return await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Delete image: ${path}`,
        sha: sha,
        branch: GITHUB_BRANCH
      })
    }
  );
};
```

### 7.4 JSON更新

```javascript
// 既存JSON取得
const getJSON = async () => {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${JSON_PATH}`
  );
  const data = await response.json();
  return JSON.parse(atob(data.content));
};

// JSON更新
const updateJSON = async (newItem) => {
  const json = await getJSON();
  // 新規アイテムを配列の先頭に追加
  json.items.splice(0, 0, newItem);
  json.last_updated = new Date().toISOString();
  // GitHub APIで更新処理
};
```

## 8. エラーハンドリング

### 8.1 投稿時エラー
- **フォーマットエラー**: 正しい形式を案内してスレッドに返信
- **画像未添付エラー**: 画像の添付を促すメッセージを返信
- **バリデーションエラー**: 具体的なエラー内容を明示して返信

### 8.2 処理時エラー
- **画像ダウンロード失敗時**: Slackに通知して処理中断
- **リサイズ失敗時**: オリジナル画像を使用
- **GitHub API失敗時**: リトライ (最大3回)
- **JSON parse失敗時**: エラーログを出力して処理中断

### 8.3 スレッド操作エラー
- **削除対象が見つからない**: エラーメッセージを返信
- **更新対象が見つからない**: エラーメッセージを返信
- **更新内容が無効**: バリデーションエラーを返信

## 9. セキュリティ考慮事項

- Slack署名検証の実装
- GitHub Token/Slack Tokenの安全な管理（Cloudflare Secrets使用）
- CORS設定の適切な制限
- リクエストレート制限の実装

## 10. デプロイ手順

### 10.1 Wrangler CLIインストール

```bash
npm install -g wrangler
```

### 10.2 プロジェクト作成

```bash
wrangler init slack-to-github
```

### 10.3 wrangler.toml設定

```toml
name = "slack-to-github"
main = "src/index.js"
compatibility_date = "2024-01-15"

[vars]
IMAGE_PATH = "images/"
JSON_PATH = "data.json"
```

### 10.4 シークレット設定

```bash
wrangler secret put SLACK_BOT_TOKEN
wrangler secret put SLACK_SIGNING_SECRET
wrangler secret put GITHUB_TOKEN
```

### 10.5 デプロイ

```bash
wrangler deploy
```

## 11. 運用・保守

### 11.1 ログ監視

- Cloudflare Workers Analytics でリクエスト監視
- エラーログの定期確認

### 11.2 バックアップ

- JSONファイルの定期バックアップ
- 画像ファイルのバックアップ（オプション）

### 11.3 スケーリング

- Cloudflare Workers の自動スケーリング機能を活用
- 必要に応じてWorkers KVの利用検討