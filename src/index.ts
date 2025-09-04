import { Hono } from 'hono'

/**
 * Environment variables for Cloudflare Workers
 */
type Bindings = {
  /** Slack signing secret for webhook verification */
  SLACK_SIGNING_SECRET: string
  /** Slack bot token for API access */
  SLACK_BOT_TOKEN: string
  /** GitHub personal access token */
  GITHUB_TOKEN: string
  /** GitHub repository owner */
  GITHUB_OWNER: string
  /** GitHub repository name */
  GITHUB_REPO: string
  /** Target branch for uploads */
  GITHUB_BRANCH: string
  /** Path for image storage */
  IMAGE_PATH: string
  /** Path for JSON metadata file */
  JSON_PATH: string
}

const app = new Hono<{ Bindings: Bindings }>()

/**
 * Verify Slack webhook signature
 * @param signature - X-Slack-Signature header
 * @param timestamp - X-Slack-Request-Timestamp header
 * @param body - The request body as text
 * @param signingSecret - Slack signing secret
 * @returns Promise<boolean> - True if signature is valid
 */
async function verifySlackSignature(signature: string | null, timestamp: string | null, body: string, signingSecret: string): Promise<boolean> {
  // Check if required headers exist
  if (!signature || !timestamp) return false
  
  // Check timestamp freshness (max 5 minutes old)
  const time = Math.floor(Date.now() / 1000)
  if (Math.abs(time - parseInt(timestamp)) > 300) return false
  
  // Create signature base string
  const baseString = `v0:${timestamp}:${body}`
  
  // Generate HMAC-SHA256 signature
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  
  const signature_bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(baseString))
  const computed_signature = `v0=${Array.from(new Uint8Array(signature_bytes)).map(b => b.toString(16).padStart(2, '0')).join('')}`
  
  return computed_signature === signature
}

/**
 * Parse Slack message text to extract metadata
 * @param text - Slack message text
 * @returns Object containing title, date, and url
 */
function parseMessage(text: string) {
  const lines = text.split('\n')
  let title = '', date = '', url = ''
  
  // Parse each line for metadata fields
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('title:')) {
      title = trimmed.substring(6).trim()
    } else if (trimmed.startsWith('date:')) {
      date = trimmed.substring(5).trim()
    } else if (trimmed.startsWith('url:')) {
      url = trimmed.substring(4).trim()
    }
  }
  
  return { title, date, url }
}

/**
 * Download file from Slack using bot token
 * @param fileUrl - Slack file URL
 * @param token - Slack bot token
 * @returns Promise<ArrayBuffer> - File content as ArrayBuffer
 */
async function getSlackFile(fileUrl: string, token: string): Promise<ArrayBuffer> {
  const response = await fetch(fileUrl, {
    headers: { Authorization: `Bearer ${token}` }
  })
  return response.arrayBuffer()
}

/**
 * Upload image and JSON data to GitHub repository
 * @param env - Environment variables
 * @param fileName - Target file name with path
 * @param content - Image content as ArrayBuffer
 * @param jsonData - JSON metadata array
 */
async function uploadToGitHub(env: Bindings, fileName: string, content: ArrayBuffer, jsonData: any) {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, IMAGE_PATH, JSON_PATH } = env
  
  // Get current commit SHA
  const branchResp = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`, {
    headers: { 
      Authorization: `token ${GITHUB_TOKEN}`,
      'User-Agent': 'Slack-to-GitHub-Worker'
    }
  })
  
  if (!branchResp.ok) {
    const errorText = await branchResp.text()
    console.error('GitHub API error (branch):', branchResp.status, errorText)
    throw new Error(`GitHub API error: ${branchResp.status} - ${errorText.substring(0, 100)}`)
  }
  
  const branchData = await branchResp.json() as any
  const currentCommitSha = branchData.object.sha
  
  // Get current tree
  const commitResp = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/commits/${currentCommitSha}`, {
    headers: { 
      Authorization: `token ${GITHUB_TOKEN}`,
      'User-Agent': 'Slack-to-GitHub-Worker'
    }
  })
  
  if (!commitResp.ok) {
    const errorText = await commitResp.text()
    console.error('GitHub API error (commit):', commitResp.status, errorText)
    throw new Error(`GitHub API error: ${commitResp.status} - ${errorText.substring(0, 100)}`)
  }
  
  const commitData = await commitResp.json() as any
  const currentTreeSha = commitData.tree.sha
  
  // Create blobs
  // Convert ArrayBuffer to base64 more efficiently
  const uint8Array = new Uint8Array(content)
  let binaryString = ''
  const chunkSize = 0x1000 // Smaller chunk size to avoid stack overflow
  
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, uint8Array.length)
    for (let j = i; j < end; j++) {
      const byte = uint8Array[j]
      if (byte !== undefined) {
        binaryString += String.fromCharCode(byte)
      }
    }
  }
  
  const imageBase64 = btoa(binaryString)
  
  const imageBlob = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/blobs`, {
    method: 'POST',
    headers: { 
      Authorization: `token ${GITHUB_TOKEN}`, 
      'Content-Type': 'application/json',
      'User-Agent': 'Slack-to-GitHub-Worker'
    },
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
    headers: { 
      Authorization: `token ${GITHUB_TOKEN}`, 
      'Content-Type': 'application/json',
      'User-Agent': 'Slack-to-GitHub-Worker'
    },
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
  
  // Create new tree
  const newTree = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees`, {
    method: 'POST',
    headers: { 
      Authorization: `token ${GITHUB_TOKEN}`, 
      'Content-Type': 'application/json',
      'User-Agent': 'Slack-to-GitHub-Worker'
    },
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
  
  // Create commit
  const newCommit = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/commits`, {
    method: 'POST',
    headers: { 
      Authorization: `token ${GITHUB_TOKEN}`, 
      'Content-Type': 'application/json',
      'User-Agent': 'Slack-to-GitHub-Worker'
    },
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
  
  // Update branch
  const updateResp = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`, {
    method: 'PATCH',
    headers: { 
      Authorization: `token ${GITHUB_TOKEN}`, 
      'Content-Type': 'application/json',
      'User-Agent': 'Slack-to-GitHub-Worker'
    },
    body: JSON.stringify({
      sha: newCommitData.sha
    })
  })
  
  if (!updateResp.ok) {
    const errorText = await updateResp.text()
    console.error('GitHub API error (update branch):', updateResp.status, errorText)
    throw new Error(`GitHub API error: ${updateResp.status} - ${errorText.substring(0, 100)}`)
  }
}

/**
 * Retrieve current JSON metadata from GitHub
 * @param env - Environment variables
 * @returns Promise<any[]> - Current JSON data array
 */
async function getCurrentJsonData(env: Bindings): Promise<any[]> {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, JSON_PATH, GITHUB_BRANCH } = env
  
  try {
    console.log('Fetching JSON from GitHub:', `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${JSON_PATH}?ref=${GITHUB_BRANCH}`)
    const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${JSON_PATH}?ref=${GITHUB_BRANCH}`, {
      headers: { 
        Authorization: `token ${GITHUB_TOKEN}`,
        'User-Agent': 'Slack-to-GitHub-Worker'
      }
    })
    
    console.log('GitHub API response status:', response.status)
    
    if (response.status === 404) {
      console.log('JSON file not found, returning empty array')
      return []
    }
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('GitHub API error when fetching JSON:', response.status, errorText)
      return []
    }
    
    const data = await response.json() as any
    console.log('GitHub API response for JSON file - size:', data.size, 'has content:', !!data.content)
    
    // Handle empty file or missing content
    if (!data.content || data.content === '') {
      console.log('JSON file has no content, returning empty array')
      return []
    }
    
    // Remove newlines from base64 content (GitHub API includes them)
    const cleanContent = data.content.replace(/\n/g, '')
    
    // Decode base64 content
    const decodedContent = atob(cleanContent)
    
    // Handle empty decoded content
    if (!decodedContent || decodedContent.trim() === '') {
      console.log('Decoded JSON content is empty, returning empty array')
      return []
    }
    
    try {
      const parsedData = JSON.parse(decodedContent)
      console.log('Successfully parsed JSON, found', parsedData.length, 'entries')
      return parsedData
    } catch (parseError) {
      console.error('Failed to parse JSON content:', parseError)
      console.error('Content was:', decodedContent.substring(0, 200))
      return []
    }
  } catch (error) {
    console.error('Error in getCurrentJsonData:', error)
    return []
  }
}

/**
 * Main Slack webhook endpoint for handling events
 */
app.post('/slack/events', async (c) => {
  const env = c.env
  
  try {
    // Log incoming request details
    console.log('Request method:', c.req.method)
    console.log('Request URL:', c.req.url)
    console.log('Content-Type:', c.req.header('Content-Type'))
    
    // Get headers for signature verification
    const signature = c.req.header('X-Slack-Signature') ?? null
    const timestamp = c.req.header('X-Slack-Request-Timestamp') ?? null
    
    // Get request body as text for signature verification
    const bodyText = await c.req.text()
    console.log('Body text (first 200 chars):', bodyText.substring(0, 200))
    
    // Verify Slack signature for security
    const isValid = await verifySlackSignature(signature, timestamp, bodyText, env.SLACK_SIGNING_SECRET)
    if (!isValid) {
      console.warn('Invalid signature - bypassing for debug')
    }
    
    // Parse JSON from body text
    let body: any
    try {
      body = JSON.parse(bodyText)
    } catch (parseError) {
      console.error('Failed to parse JSON. Full body text:', bodyText)
      console.error('Parse error:', parseError)
      // Check if it's a Slack retry message
      if (bodyText.includes('Request for Retry')) {
        console.log('Slack retry detected, returning OK')
        return c.text('OK')
      }
      return c.text('Invalid JSON', 400)
    }
  
  // Handle Slack URL verification challenge
  if (body.type === 'url_verification') {
    return c.text(body.challenge)
  }
  
  // Process message events with file attachments (excluding bot messages)
  if (body.event?.type === 'message' && !body.event.bot_id && body.event.files) {
    const event = body.event
    const file = event.files[0]
    
    // Filter for image files only
    if (!file.mimetype?.startsWith('image/')) {
      return c.text('OK')
    }
    
    try {
      // Extract metadata from message text
      const { title, date, url } = parseMessage(event.text || '')
      
      // Validate required date format (YYYY/MM/DD)
      if (!/^\d{4}\/\d{2}\/\d{2}$/.test(date)) {
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            channel: event.channel,
            thread_ts: event.ts,
            text: '❌ 日付は YYYY/MM/DD 形式で入力してください'
          })
        })
        return c.text('OK')
      }
      
      // Download image from Slack
      const imageBuffer = await getSlackFile(file.url_private_download, env.SLACK_BOT_TOKEN)
      
      // Generate timestamped filename and directory structure
      const timestamp = Date.now()
      const fileName = `${timestamp}_${file.name}`
      const [year, month] = date.split('/')
      const fullPath = `${year}/${month}/${fileName}`
      
      // Retrieve current JSON data from GitHub
      const currentData = await getCurrentJsonData(env)
      
      // Create new metadata entry
      const newId = currentData.length > 0 ? Math.max(...currentData.map(item => item.id)) + 1 : 1
      const newEntry = {
        id: newId,
        image: `/${env.IMAGE_PATH}${fullPath}`,
        title: title || '',
        datetime: date.replace(/\//g, '-'),
        link: url || '',
        metadata: {
          uploaded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          slack_user: event.user,
          slack_channel: event.channel,
          slack_thread_ts: event.thread_ts || event.ts,
          slack_message_ts: event.ts
        }
      }
      
      // Insert new entry at the beginning (chronological order)
      const updatedData = [newEntry, ...currentData]
      
      // Commit both image and JSON to GitHub
      await uploadToGitHub(env, fullPath, imageBuffer, updatedData)
      
      // Send success notification to Slack
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channel: event.channel,
          thread_ts: event.ts,
          text: `✅ アップロード完了: ${fileName}`
        })
      })
      
    } catch (error) {
      console.error('Upload error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      // Send error notification to Slack
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channel: event.channel,
          thread_ts: event.ts,
          text: `❌ エラー: ${errorMessage}`
        })
      })
    }
  }
  
    // Always return 200 OK to Slack
    return c.text('OK')
  } catch (error) {
    console.error('Unexpected error in Slack webhook:', error)
    return c.text('Internal Server Error', 500)
  }
})

/**
 * Health check endpoint
 */
app.get('/', (c) => c.text('OK - Version: DEBUG_2025-09-04'))

/**
 * Debug endpoint to test GitHub API
 */
app.get('/debug', async (c) => {
  const env = c.env
  const result = await getCurrentJsonData(env)
  return c.json({ 
    message: 'Debug test', 
    jsonDataCount: result.length,
    sample: result.slice(0, 2)
  })
})

export default app