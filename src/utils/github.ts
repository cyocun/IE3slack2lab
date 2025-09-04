import type { Bindings, LabEntry } from '../types'

/**
 * 画像とJSONデータをGitHubリポジトリにアップロード
 * @param env - 環境変数
 * @param fileName - パス付き対象ファイル名
 * @param content - ArrayBuffer形式の画像内容
 * @param jsonData - JSONメタデータ配列
 */
export async function uploadToGitHub(
  env: Bindings,
  fileName: string,
  content: ArrayBuffer,
  jsonData: LabEntry[]
): Promise<void> {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, IMAGE_PATH, JSON_PATH } = env
  const authHeaders = {
    Authorization: `token ${GITHUB_TOKEN}`,
    'User-Agent': 'Slack-to-GitHub-Worker'
  }
  const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' }

  // 現在のコミットSHAを取得
  const branchResp = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`,
    { headers: authHeaders }
  )

  if (!branchResp.ok) {
    const errorText = await branchResp.text()
    console.error('GitHub API error (branch):', branchResp.status, errorText)
    throw new Error(`GitHub API error: ${branchResp.status} - ${errorText.substring(0, 100)}`)
  }

  const branchData = await branchResp.json() as any
  const currentCommitSha = branchData.object.sha

  // 現在のツリーを取得
  const commitResp = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/commits/${currentCommitSha}`,
    { headers: authHeaders }
  )

  if (!commitResp.ok) {
    const errorText = await commitResp.text()
    console.error('GitHub API error (commit):', commitResp.status, errorText)
    throw new Error(`GitHub API error: ${commitResp.status} - ${errorText.substring(0, 100)}`)
  }

  const commitData = await commitResp.json() as any
  const currentTreeSha = commitData.tree.sha

  // Blobを作成
  const imageBase64 = await convertArrayBufferToBase64(content)

  const imageBlob = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/blobs`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      content: imageBase64,
      encoding: 'base64'
    })
  })

  if (!imageBlob.ok) {
    const errorText = await imageBlob.text()
    console.error('GitHub API error (image blob):', imageBlob.status, errorText)
    throw new Error(`GitHub API error: ${imageBlob.status} - ${errorText.substring(0, 100)}`)
  }

  const imageBlobData = await imageBlob.json() as any

  const jsonBlob = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/blobs`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      content: btoa(JSON.stringify(jsonData, null, 2)),
      encoding: 'base64'
    })
  })

  if (!jsonBlob.ok) {
    const errorText = await jsonBlob.text()
    console.error('GitHub API error (json blob):', jsonBlob.status, errorText)
    throw new Error(`GitHub API error: ${jsonBlob.status} - ${errorText.substring(0, 100)}`)
  }

  const jsonBlobData = await jsonBlob.json() as any

  // 新しいツリーを作成
  const newTree = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      base_tree: currentTreeSha,
      tree: [
        {
          path: `${IMAGE_PATH}${fileName}`,
          mode: '100644',
          type: 'blob',
          sha: imageBlobData.sha
        },
        {
          path: JSON_PATH,
          mode: '100644',
          type: 'blob',
          sha: jsonBlobData.sha
        }
      ]
    })
  })

  if (!newTree.ok) {
    const errorText = await newTree.text()
    console.error('GitHub API error (new tree):', newTree.status, errorText)
    throw new Error(`GitHub API error: ${newTree.status} - ${errorText.substring(0, 100)}`)
  }

  const newTreeData = await newTree.json() as any

  // コミットを作成
  const newCommit = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/commits`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      message: `Add lab image: ${fileName}`,
      tree: newTreeData.sha,
      parents: [currentCommitSha]
    })
  })

  if (!newCommit.ok) {
    const errorText = await newCommit.text()
    console.error('GitHub API error (new commit):', newCommit.status, errorText)
    throw new Error(`GitHub API error: ${newCommit.status} - ${errorText.substring(0, 100)}`)
  }

  const newCommitData = await newCommit.json() as any

  // ブランチを更新
  const updateResp = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`,
    {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({
        sha: newCommitData.sha
      })
    }
  )

  if (!updateResp.ok) {
    const errorText = await updateResp.text()
    console.error('GitHub API error (update branch):', updateResp.status, errorText)
    throw new Error(`GitHub API error: ${updateResp.status} - ${errorText.substring(0, 100)}`)
  }
}

/**
 * GitHubから現在のJSONメタデータを取得
 * @param env - 環境変数
 * @returns Promise<LabEntry[]> - 現在のJSONデータ配列
 */
export async function getCurrentJsonData(env: Bindings): Promise<LabEntry[]> {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, JSON_PATH, GITHUB_BRANCH } = env
  const headers = {
    Authorization: `token ${GITHUB_TOKEN}`,
    'User-Agent': 'Slack-to-GitHub-Worker'
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${JSON_PATH}?ref=${GITHUB_BRANCH}`,
      { headers }
    )

    if (response.status === 404) {
      return []
    }

    if (!response.ok) {
      const errorText = await response.text()
      console.error('GitHub API error when fetching JSON:', response.status, errorText)
      return []
    }

    const data = await response.json() as any

    // 空ファイルまたはコンテンツの欠如を処理
    if (!data.content || data.content === '') {
      return []
    }

    // base64コンテンツから改行を除去（GitHub APIに含まれるため）
    const cleanContent = data.content.replace(/\n/g, '')

    // base64コンテンツをデコード
    const decodedContent = atob(cleanContent)

    // 空のデコードされたコンテンツを処理
    if (!decodedContent || decodedContent.trim() === '') {
      return []
    }

    try {
      const parsedData = JSON.parse(decodedContent)
      return parsedData
    } catch (parseError) {
      console.error('Failed to parse JSON content:', parseError)
      return []
    }
  } catch (error) {
    console.error('Error in getCurrentJsonData:', error)
    return []
  }
}

/**
 * ArrayBufferをbase64により効率的に変換
 * @param content - ArrayBufferコンテンツ
 * @returns Promise<string> - base64エンコード文字列
 */
async function convertArrayBufferToBase64(content: ArrayBuffer): Promise<string> {
  const uint8Array = new Uint8Array(content)
  let binaryString = ''
  const chunkSize = 0x1000 // スタックオーバーフロー回避のための小さいチャンクサイズ

  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, uint8Array.length)
    for (let j = i; j < end; j++) {
      if (typeof uint8Array[j] !== 'undefined') {
        binaryString += String.fromCharCode(uint8Array[j])
      }
    }
  }

  return btoa(binaryString)
}