import { Hono } from 'hono'
import type { Bindings, LabEntry, ThreadData } from './types'
import { verifySlackSignature, parseMessage, getSlackFile, sendSlackMessage, detectThreadCommand, sanitizeFileName, sendInteractiveMessage, createEditButtons, formatDateInput } from './utils/slack'
import { uploadToGitHub, getCurrentJsonData, updateJsonOnGitHub } from './utils/github'
import { storeThreadData, getThreadData, deleteThreadData, updateEntryById, deleteEntryById } from './utils/kv'

const app = new Hono<{ Bindings: Bindings }>()

/**
 * イベント処理用メインSlack Webhookエンドポイント
 */
app.post('/slack/events', async (c) => {
  const env = c.env

  try {
    const signature = c.req.header('X-Slack-Signature') ?? ''
    const timestamp = c.req.header('X-Slack-Request-Timestamp') ?? ''
    const bodyText = await c.req.text()

    if (!(await verifySlackSignature(signature, timestamp, bodyText, env.SLACK_SIGNING_SECRET))) {
      return c.text('Unauthorized', 401)
    }

    let body: any
    try {
      body = JSON.parse(bodyText)
    } catch {
      return bodyText.includes('Request for Retry') ? c.text('OK') : c.text('Invalid JSON', 400)
    }

    if (body.type === 'url_verification') {
      return c.text(body.challenge)
    }

    const event = body.event

    // ボットメッセージを除外
    if (event.bot_id || event.type !== 'message') {
      return c.text('OK')
    }

    // スレッドメッセージの場合
    if (event.thread_ts) {
      return handleThreadMessage(c, env, event)
    }

    // 通常メッセージ（画像付き）の場合
    const file = event?.files?.[0]
    if (!file || !file.mimetype?.startsWith('image/')) {
      return c.text('OK')
    }

    try {
      const { title, date, url } = parseMessage(event.text || '')

      // エラー時にもスレッドデータを保存（修正投稿用）
      if (!date || !/^\d{4}\/\d{2}\/\d{2}$/.test(date)) {
        const threadData: ThreadData = {
          messageTs: event.ts,
          channel: event.channel,
          createdAt: new Date().toISOString(),
          pendingFile: {
            url: file.url_private_download,
            name: file.name,
            mimetype: file.mimetype
          },
          metadata: { title, date, url }
        }
        await storeThreadData(env, event.ts, threadData)

        if (!date) {
          const formatExample = `📅 **いつの画像？** 🤔
• \`date: 20241225\` (YYYYMMDD or MMDD)

✨ **Example** :
\`\`\`
date: 20241225
title: The new beginning
link: https://ie3.jp
\`\`\`

😊 下のボタンから編集するか、このスレッドに投稿してもらえれば、すぐに画像をアップロードします！`
          
          const pendingButtons = createEditButtons(undefined, true)
          await sendInteractiveMessage(env.SLACK_BOT_TOKEN, event.channel, event.ts, formatExample, pendingButtons)
          return c.text('OK')
        }

        const formatExample = `📅 日付の形式がちょっと違うようです

🔍 **受け取った値**: \`${date}\`

😊 **正しい書き方**:
• \`date: 20241225\` (YYYYMMDD形式)
• \`date: 1225\` (MMDD形式、年は今年になります)

✨ **Example** :
\`\`\`
date: 20241225
title: The new beginning
link: https://ie3.jp
\`\`\`

🚀 下のボタンから編集するか、正しい形式で投稿していただければ、すぐに画像をアップロードします！`
        
        const pendingButtons = createEditButtons(undefined, true)
        await sendInteractiveMessage(env.SLACK_BOT_TOKEN, event.channel, event.ts, formatExample, pendingButtons)
        return c.text('OK')
      }

      const imageBuffer = await getSlackFile(file.url_private_download, env.SLACK_BOT_TOKEN)
      const timestamp = Date.now()
      const [year, month] = date.split('/')
      const sanitizedName = sanitizeFileName(file.name)
      const fileName = `${timestamp}_${sanitizedName}`
      const fullPath = `${year}/${month}/${fileName}`

      const currentData = await getCurrentJsonData(env)
      const newId = currentData.length ? Math.max(...currentData.map(item => item.id)) + 1 : 1
      const newEntry: LabEntry = {
        id: newId,
        image: `/${env.IMAGE_PATH}${fullPath}`,
        title: title || '',
        datetime: date.replace(/\//g, '-'),
        link: url || ''
      }

      await uploadToGitHub(env, fullPath, imageBuffer, [newEntry, ...currentData])

      // スレッドデータを保存（編集・削除用）
      const threadData: ThreadData = {
        entryId: newId,
        messageTs: event.ts,
        channel: event.channel,
        createdAt: new Date().toISOString()
      }
      await storeThreadData(env, event.ts, threadData)

      const successText = `🎉 画像のアップロードが完了しました！\n\n` +
        `📸 **ファイル名**: \`${fileName}\`\n` +
        `🔢 **エントリID**: ${newId}\n` +
        `📅 **日付**: ${date}\n` +
        `${title ? `📝 **タイトル**: ${title}\n` : ''}` +
        `${url ? `🔗 **リンク**: ${url}\n` : ''}` +
        `\n✏️ 修正が必要な場合は、このスレッドで **\`edit\`** または **\`修正\`** と入力してください。`
      
      await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.ts, successText)
    } catch (error) {
      console.error('Upload error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorStack = error instanceof Error ? error.stack : undefined
      let detailedError = `❌ エラー: ${errorMessage}`
      if (errorStack) {
        const stackLines = errorStack.split('\n').slice(0, 3)
        detailedError += `\n\`\`\`\n${stackLines.join('\n')}\n\`\`\``
      }
      await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.ts, detailedError)
    }

    return c.text('OK')
  } catch (error) {
    console.error('Unexpected error in Slack webhook:', error)
    return c.text('Internal Server Error', 500)
  }
})

/**
 * 編集入力処理
 */
async function handleEditInput(c: any, env: Bindings, event: any, threadData: ThreadData): Promise<Response> {
  if (!threadData.waitingForEdit) {
    return c.text('OK')
  }

  const editType = threadData.waitingForEdit.type
  const inputValue = event.text?.trim() || ''

  try {
    if (editType === 'date') {
      // 日付処理
      const formattedDate = formatDateInput(inputValue)
      if (!formattedDate || !/^\d{4}\/\d{2}\/\d{2}$/.test(formattedDate)) {
        await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts,
          '❌ 日付形式が正しくありません\n\n例: `20241225` または `1225`\n（YYYYMMDD または MMDD 形式で入力してください）')
        return c.text('OK')
      }

      if (threadData.pendingFile) {
        // 保留中の画像をアップロード
        await handlePendingImageUpload(env, threadData, formattedDate, event.thread_ts)
      } else if (threadData.entryId) {
        // 既存エントリの日付更新
        await updateExistingEntry(env, threadData, { datetime: formattedDate.replace(/\//g, '-') }, event.thread_ts)
      }
    } else if (editType === 'title') {
      // タイトル処理
      if (threadData.pendingFile) {
        // 保留中データのタイトル更新
        const updatedMetadata = { ...threadData.metadata, title: inputValue }
        const { waitingForEdit, ...baseThreadData } = threadData
        const updatedThreadData: ThreadData = {
          ...baseThreadData,
          metadata: updatedMetadata
        }
        await storeThreadData(env, event.thread_ts, updatedThreadData)
        await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts,
          `✅ タイトルを更新しました${inputValue ? `: ${inputValue}` : '（削除）'}`)
      } else if (threadData.entryId) {
        // 既存エントリのタイトル更新
        await updateExistingEntry(env, threadData, { title: inputValue }, event.thread_ts)
      }
    } else if (editType === 'link') {
      // リンク処理
      if (threadData.pendingFile) {
        // 保留中データのリンク更新
        const updatedMetadata = { ...threadData.metadata, url: inputValue }
        const { waitingForEdit, ...baseThreadData } = threadData
        const updatedThreadData: ThreadData = {
          ...baseThreadData,
          metadata: updatedMetadata
        }
        await storeThreadData(env, event.thread_ts, updatedThreadData)
        await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts,
          `✅ リンクを更新しました${inputValue ? `: ${inputValue}` : '（削除）'}`)
      } else if (threadData.entryId) {
        // 既存エントリのリンク更新
        await updateExistingEntry(env, threadData, { link: inputValue }, event.thread_ts)
      }
    }

    return c.text('OK')
  } catch (error) {
    console.error('Edit input error:', error)
    await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts,
      `❌ エラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`)
    return c.text('OK')
  }
}

/**
 * 保留中画像のアップロード処理
 */
async function handlePendingImageUpload(env: Bindings, threadData: ThreadData, formattedDate: string, threadTs: string): Promise<void> {
  if (!threadData.pendingFile) return

  const imageBuffer = await getSlackFile(threadData.pendingFile.url, env.SLACK_BOT_TOKEN)
  const timestamp = Date.now()
  const [year, month] = formattedDate.split('/')
  const sanitizedName = sanitizeFileName(threadData.pendingFile.name)
  const fileName = `${timestamp}_${sanitizedName}`
  const fullPath = `${year}/${month}/${fileName}`

  const currentData = await getCurrentJsonData(env)
  const newId = currentData.length ? Math.max(...currentData.map(item => item.id)) + 1 : 1

  const newEntry: LabEntry = {
    id: newId,
    image: `/${env.IMAGE_PATH}${fullPath}`,
    title: threadData.metadata?.title || '',
    datetime: formattedDate.replace(/\//g, '-'),
    link: threadData.metadata?.url || ''
  }

  await uploadToGitHub(env, fullPath, imageBuffer, [newEntry, ...currentData])

  // スレッドデータを更新（編集待ち状態をクリア）
  const { pendingFile, waitingForEdit, ...baseThreadData } = threadData
  const updatedThreadData: ThreadData = {
    ...baseThreadData,
    entryId: newId
  }
  await storeThreadData(env, threadTs, updatedThreadData)

  // 成功メッセージを送信
  const successText = `🎉 お待たせしました！アップロード完了です\n\n` +
    `📸 **ファイル名**: \`${fileName}\`\n` +
    `🔢 **エントリID**: ${newId}\n` +
    `📅 **日付**: ${formattedDate}\n` +
    `${newEntry.title ? `📝 **タイトル**: ${newEntry.title}\n` : ''}` +
    `${newEntry.link ? `🔗 **リンク**: ${newEntry.link}\n` : ''}` +
    `\n✏️ 修正が必要な場合は、このスレッドで **\`edit\`** または **\`修正\`** と入力してください。`

  await sendSlackMessage(env.SLACK_BOT_TOKEN, threadData.channel, threadTs, successText)
}

/**
 * 既存エントリの更新処理
 */
async function updateExistingEntry(env: Bindings, threadData: ThreadData, updates: Partial<LabEntry>, threadTs: string): Promise<void> {
  if (!threadData.entryId) return

  const currentData = await getCurrentJsonData(env)
  const updatedData = updateEntryById(currentData, threadData.entryId, updates)

  await updateJsonOnGitHub(env, updatedData, `Update lab entry ID: ${threadData.entryId}`)

  // 編集待ち状態をクリア
  const { waitingForEdit, ...baseThreadData } = threadData
  await storeThreadData(env, threadTs, baseThreadData)

  const updateSummary = Object.entries(updates)
    .map(([key, value]) => `• ${key}: ${value || '（削除）'}`)
    .join('\n')

  await sendSlackMessage(env.SLACK_BOT_TOKEN, threadData.channel, threadTs,
    `🔄 更新完了しました！\n\n` +
    `🔢 **エントリID**: ${threadData.entryId}\n` +
    `📝 **更新内容**:\n${updateSummary}`)
}

/**
 * スレッドメッセージ処理
 */
async function handleThreadMessage(c: any, env: Bindings, event: any) {
  try {
    // スレッドデータを取得
    const threadData = await getThreadData(env, event.thread_ts)
    if (!threadData) {
      // スレッドが見つからない場合は何もしない
      return c.text('OK')
    }

    // 編集待ち状態をチェック
    if (threadData.waitingForEdit) {
      return handleEditInput(c, env, event, threadData)
    }

    const command = detectThreadCommand(event.text || '')

    if (command === 'edit') {
      // 編集モード（インタラクティブボタンを表示）
      if (threadData.entryId || threadData.pendingFile) {
        const editButtons = createEditButtons(threadData.entryId, !threadData.entryId)
        await sendInteractiveMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts,
          '🔧 **何を修正しますか？**', editButtons)
      } else {
        await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts,
          '❌ 修正できるデータが見つかりません。')
      }
      return c.text('OK')
      
    } else if (command === 'delete') {
      if (!threadData.entryId) {
        // アップロード前の削除（保留データの削除）
        await deleteThreadData(env, event.thread_ts)
        await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts,
          `🗑️ 了解しました！保留中の画像アップロードをキャンセルしました`)
        return c.text('OK')
      }

      // アップロード済みエントリの削除処理
      const currentData = await getCurrentJsonData(env)
      const updatedData = deleteEntryById(currentData, threadData.entryId)

      await updateJsonOnGitHub(env, updatedData, `Delete lab entry ID: ${threadData.entryId}`)
      await deleteThreadData(env, event.thread_ts)

      await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts,
        `🗑️ 完了しました！エントリID ${threadData.entryId} を削除しました`)

    } else if (command === 'update') {
      // 更新処理
      const { title, date, url } = parseMessage(event.text || '')

      // 保留中の画像アップロードの場合
      if (!threadData.entryId && threadData.pendingFile) {
        if (!date) {
          await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts,
            '❌ 画像をアップロードするには日付が必要です。`date: YYYYMMDD` または `date: MMDD` を指定してください。')
          return c.text('OK')
        }

        if (!/^\d{4}\/\d{2}\/\d{2}$/.test(date)) {
          const formatExample = `❌ 日付フォーマットが正しくありません

**受け取った値**: \`${date}\`

**正しい形式**:
• \`date: 20241225\` (YYYYMMDD形式)
• \`date: 1225\` (MMDD形式、現在年自動設定)`
          await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts, formatExample)
          return c.text('OK')
        }

        // 保留中の画像をアップロード
        try {
          const imageBuffer = await getSlackFile(threadData.pendingFile.url, env.SLACK_BOT_TOKEN)
          const timestamp = Date.now()
          const [year, month] = date.split('/')
          const sanitizedName = sanitizeFileName(threadData.pendingFile.name)
          const fileName = `${timestamp}_${sanitizedName}`
          const fullPath = `${year}/${month}/${fileName}`

          const currentData = await getCurrentJsonData(env)
          const newId = currentData.length ? Math.max(...currentData.map(item => item.id)) + 1 : 1

          const newEntry: LabEntry = {
            id: newId,
            image: `/${env.IMAGE_PATH}${fullPath}`,
            title: title || threadData.metadata?.title || '',
            datetime: date.replace(/\//g, '-'),
            link: url || threadData.metadata?.url || ''
          }

          await uploadToGitHub(env, fullPath, imageBuffer, [newEntry, ...currentData])

          // スレッドデータを更新（entryIdを追加、pendingFileを削除）
          const { pendingFile, ...baseThreadData } = threadData
          const updatedThreadData: ThreadData = {
            ...baseThreadData,
            entryId: newId
          }
          await storeThreadData(env, event.thread_ts, updatedThreadData)

          await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts,
            `🎉 お待たせしました！アップロード完了です\n\n` +
            `📸 **ファイル名**: \`${fileName}\`\n` +
            `🔢 **エントリID**: ${newId}\n` +
            `📅 **日付**: ${date}\n` +
            `${title ? `📝 **タイトル**: ${title}\n` : ''}` +
            `${url ? `🔗 **リンク**: ${url}\n` : ''}` +
            `\n✏️ 修正が必要な場合は、このスレッドで **\`edit\`** または **\`修正\`** と入力してください。`)
          return c.text('OK')
        } catch (error) {
          console.error('Pending upload error:', error)
          await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts,
            `❌ アップロードエラー: ${error instanceof Error ? error.message : 'Unknown error'}`)
          return c.text('OK')
        }
      }

      // 既存エントリの更新処理
      if (!threadData.entryId) {
        await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts,
          '❌ 更新対象のエントリが見つかりません。')
        return c.text('OK')
      }

      const updates: Partial<LabEntry> = {}

      if (title) updates.title = title
      if (date) {
        if (!/^\d{4}\/\d{2}\/\d{2}$/.test(date)) {
          const formatExample = `❌ 日付フォーマットが正しくありません

**受け取った値**: \`${date}\`

**正しい形式**:
• \`date: 20241225\` (YYYYMMDD形式)
• \`date: 1225\` (MMDD形式、現在年自動設定)`
          await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts, formatExample)
          return c.text('OK')
        }
        updates.datetime = date.replace(/\//g, '-')
      }
      if (url) updates.link = url

      if (Object.keys(updates).length === 0) {
        await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts,
          '❌ 更新する内容が見つかりません。date、title、linkのいずれかを指定してください。')
        return c.text('OK')
      }

      const currentData = await getCurrentJsonData(env)
      const updatedData = updateEntryById(currentData, threadData.entryId, updates)

      await updateJsonOnGitHub(env, updatedData, `Update lab entry ID: ${threadData.entryId}`)

      const updateSummary = Object.entries(updates)
        .map(([key, value]) => `• ${key}: ${value}`)
        .join('\n')

      await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts,
        `🔄 更新完了しました！\n\n` +
        `🔢 **エントリID**: ${threadData.entryId}\n` +
        `📝 **更新内容**:\n${updateSummary}`)
    }

    return c.text('OK')
  } catch (error) {
    console.error('Thread message error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts,
      `❌ エラーが発生しました: ${errorMessage}`)
    return c.text('OK')
  }
}

/**
 * Slackインタラクティブエンドポイント（ボタン処理）
 */
app.post('/slack/interactive', async (c) => {
  const env = c.env
  
  try {
    const signature = c.req.header('X-Slack-Signature') ?? ''
    const timestamp = c.req.header('X-Slack-Request-Timestamp') ?? ''
    const bodyText = await c.req.text()
    
    if (!(await verifySlackSignature(signature, timestamp, bodyText, env.SLACK_SIGNING_SECRET))) {
      return c.text('Unauthorized', 401)
    }
    
    const payloadParam = bodyText.split('payload=')[1]
    if (!payloadParam) {
      return c.text('Bad Request', 400)
    }
    const payload = JSON.parse(decodeURIComponent(payloadParam))
    
    if (payload.type === 'block_actions') {
      return handleButtonInteraction(c, env, payload)
    }
    
    
    return c.text('OK')
  } catch (error) {
    console.error('Interactive endpoint error:', error)
    return c.text('Internal Server Error', 500)
  }
})

/**
 * ボタンインタラクション処理
 */
async function handleButtonInteraction(c: any, env: Bindings, payload: any): Promise<Response> {
  try {
    const action = payload.actions[0]
    const actionId = action.action_id
    const channel = payload.channel.id
    const threadTs = payload.message.thread_ts || payload.message.ts
    
    // キャンセル処理
    if (actionId.endsWith('_cancel')) {
      await sendSlackMessage(env.SLACK_BOT_TOKEN, channel, threadTs, 
        '❌ キャンセルしました')
      return c.text('OK')
    }
    
    // 削除処理
    if (actionId.endsWith('_delete')) {
      const threadData = await getThreadData(env, threadTs)
      if (!threadData) {
        await sendSlackMessage(env.SLACK_BOT_TOKEN, channel, threadTs, 
          '❌ データが見つかりません')
        return c.text('OK')
      }
      
      if (threadData.entryId) {
        // 既存エントリの削除
        const currentData = await getCurrentJsonData(env)
        const updatedData = deleteEntryById(currentData, threadData.entryId)
        await updateJsonOnGitHub(env, updatedData, `Delete lab entry ID: ${threadData.entryId}`)
        await deleteThreadData(env, threadTs)
        await sendSlackMessage(env.SLACK_BOT_TOKEN, channel, threadTs, 
          `🗑️ 完了しました！エントリID ${threadData.entryId} を削除しました`)
      } else {
        // 保留データの削除
        await deleteThreadData(env, threadTs)
        await sendSlackMessage(env.SLACK_BOT_TOKEN, channel, threadTs, 
          '🗑️ 了解しました！保留中の画像アップロードをキャンセルしました')
      }
      return c.text('OK')
    }
    
    // 編集処理（日付、タイトル、リンク）
    const editType = actionId.split('_')[1] as 'date' | 'title' | 'link'
    console.log('Button clicked:', actionId, 'editType:', editType, 'threadTs:', threadTs)
    
    // スレッドデータを取得
    const threadData = await getThreadData(env, threadTs)
    if (!threadData) {
      await sendSlackMessage(env.SLACK_BOT_TOKEN, channel, threadTs, '❌ データが見つかりません')
      return c.text('OK')
    }
    
    // 編集待ち状態を設定
    const editPrompts = {
      date: '📅 **日付を入力してください**\n\n例: `20241225` または `1225`\n（YYYYMMDD または MMDD 形式）',
      title: '📝 **新しいタイトルを入力してください**\n\n空欄で送信するとタイトルが削除されます',
      link: '🔗 **新しいリンクを入力してください**\n\n例: `https://example.com`\n空欄で送信するとリンクが削除されます'
    }
    
    const updatedThreadData: ThreadData = {
      ...threadData,
      waitingForEdit: {
        type: editType,
        message: editPrompts[editType]
      }
    }
    
    await storeThreadData(env, threadTs, updatedThreadData)
    await sendSlackMessage(env.SLACK_BOT_TOKEN, channel, threadTs, editPrompts[editType])
    
    return c.text('OK')
  } catch (error) {
    console.error('Button interaction error:', error)
    return c.text('OK')
  }
}

/**
 * モーダル送信処理
 */
async function handleModalSubmission(c: any, env: Bindings, payload: any): Promise<Response> {
  try {
    const callbackId = payload.view.callback_id
    const inputValue = payload.view.state.values.edit_input.edit_value.value || ''
    
    // callback_idから情報を抽出: edit_{type}_{pending|existing}_{threadTs}
    const [, editType, status, threadTs] = callbackId.split('_')
    const isPending = status === 'pending'
    
    if (isPending) {
      // 保留中の画像アップロード処理
      return await handlePendingEdit(env, threadTs, editType, inputValue, payload.user.id)
    } else {
      // 既存エントリの更新処理
      return await handleExistingEdit(env, threadTs, editType, inputValue, payload.user.id)
    }
  } catch (error) {
    console.error('Modal submission error:', error)
    return c.json({ response_action: 'errors', errors: { edit_input: 'エラーが発生しました' } })
  }
}

/**
 * 保留中画像の編集処理
 */
async function handlePendingEdit(env: Bindings, threadTs: string, editType: string, inputValue: string, userId: string): Promise<Response> {
  const threadData = await getThreadData(env, threadTs)
  if (!threadData || !threadData.pendingFile) {
    return new Response(JSON.stringify({ 
      response_action: 'errors', 
      errors: { edit_input: 'データが見つかりません' } 
    }), { headers: { 'Content-Type': 'application/json' } })
  }
  
  // 日付の場合は即座にアップロード処理
  if (editType === 'date') {
    const formattedDate = formatDateInput(inputValue)
    if (!formattedDate || !/^\d{4}\/\d{2}\/\d{2}$/.test(formattedDate)) {
      return new Response(JSON.stringify({ 
        response_action: 'errors', 
        errors: { edit_input: '日付形式が正しくありません（YYYYMMDD または MMDD）' } 
      }), { headers: { 'Content-Type': 'application/json' } })
    }
    
    // 画像をアップロード
    try {
      const imageBuffer = await getSlackFile(threadData.pendingFile.url, env.SLACK_BOT_TOKEN)
      const timestamp = Date.now()
      const [year, month] = formattedDate.split('/')
      const sanitizedName = sanitizeFileName(threadData.pendingFile.name)
      const fileName = `${timestamp}_${sanitizedName}`
      const fullPath = `${year}/${month}/${fileName}`
      
      const currentData = await getCurrentJsonData(env)
      const newId = currentData.length ? Math.max(...currentData.map(item => item.id)) + 1 : 1
      
      const newEntry: LabEntry = {
        id: newId,
        image: `/${env.IMAGE_PATH}${fullPath}`,
        title: threadData.metadata?.title || '',
        datetime: formattedDate.replace(/\//g, '-'),
        link: threadData.metadata?.url || ''
      }
      
      await uploadToGitHub(env, fullPath, imageBuffer, [newEntry, ...currentData])
      
      // スレッドデータを更新
      const { pendingFile, ...baseThreadData } = threadData
      const updatedThreadData: ThreadData = {
        ...baseThreadData,
        entryId: newId
      }
      await storeThreadData(env, threadTs, updatedThreadData)
      
      // 成功メッセージを送信
      const successText = `🎉 お待たせしました！アップロード完了です\n\n` +
        `📸 **ファイル名**: \`${fileName}\`\n` +
        `🔢 **エントリID**: ${newId}\n` +
        `📅 **日付**: ${formattedDate}\n` +
        `${newEntry.title ? `📝 **タイトル**: ${newEntry.title}\n` : ''}` +
        `${newEntry.link ? `🔗 **リンク**: ${newEntry.link}\n` : ''}` +
        `\n✏️ 修正が必要な場合は、このスレッドで **\`edit\`** または **\`修正\`** と入力してください。`
      
      await sendSlackMessage(env.SLACK_BOT_TOKEN, threadData.channel, threadTs, successText)
      
    } catch (error) {
      console.error('Pending upload error:', error)
      return new Response(JSON.stringify({ 
        response_action: 'errors', 
        errors: { edit_input: 'アップロードエラーが発生しました' } 
      }), { headers: { 'Content-Type': 'application/json' } })
    }
  } else {
    // タイトルまたはリンクの場合はメタデータを更新
    const updatedMetadata = { ...threadData.metadata }
    if (editType === 'title') {
      updatedMetadata.title = inputValue
    } else if (editType === 'link') {
      updatedMetadata.url = inputValue
    }
    
    const updatedThreadData: ThreadData = {
      ...threadData,
      metadata: updatedMetadata
    }
    await storeThreadData(env, threadTs, updatedThreadData)
    
    await sendSlackMessage(env.SLACK_BOT_TOKEN, threadData.channel, threadTs,
      `✅ ${editType === 'title' ? 'タイトル' : 'リンク'}を更新しました${inputValue ? `: ${inputValue}` : '（削除）'}`)
  }
  
  return new Response('', { status: 200 })
}

/**
 * 既存エントリの編集処理
 */
async function handleExistingEdit(env: Bindings, threadTs: string, editType: string, inputValue: string, userId: string): Promise<Response> {
  const threadData = await getThreadData(env, threadTs)
  if (!threadData || !threadData.entryId) {
    return new Response(JSON.stringify({ 
      response_action: 'errors', 
      errors: { edit_input: 'データが見つかりません' } 
    }), { headers: { 'Content-Type': 'application/json' } })
  }
  
  const updates: Partial<LabEntry> = {}
  
  if (editType === 'date') {
    const formattedDate = formatDateInput(inputValue)
    if (!formattedDate || !/^\d{4}\/\d{2}\/\d{2}$/.test(formattedDate)) {
      return new Response(JSON.stringify({ 
        response_action: 'errors', 
        errors: { edit_input: '日付形式が正しくありません（YYYYMMDD または MMDD）' } 
      }), { headers: { 'Content-Type': 'application/json' } })
    }
    updates.datetime = formattedDate.replace(/\//g, '-')
  } else if (editType === 'title') {
    updates.title = inputValue
  } else if (editType === 'link') {
    updates.link = inputValue
  }
  
  if (Object.keys(updates).length > 0) {
    const currentData = await getCurrentJsonData(env)
    const updatedData = updateEntryById(currentData, threadData.entryId, updates)
    
    await updateJsonOnGitHub(env, updatedData, `Update lab entry ID: ${threadData.entryId}`)
    
    const updateSummary = Object.entries(updates)
      .map(([key, value]) => `• ${key}: ${value || '（削除）'}`)
      .join('\n')
    
    await sendSlackMessage(env.SLACK_BOT_TOKEN, threadData.channel, threadTs,
      `🔄 更新完了しました！\n\n` +
      `🔢 **エントリID**: ${threadData.entryId}\n` +
      `📝 **更新内容**:\n${updateSummary}`)
  }
  
  return new Response('', { status: 200 })
}

/**
 * 編集用モーダルを開く
 */
async function openEditModal(token: string, triggerId: string, editType: string, threadTs: string, isPending: boolean): Promise<void> {
  const modalConfig = getModalConfig(editType, threadTs, isPending)
  
  await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      trigger_id: triggerId,
      view: modalConfig
    })
  })
}

/**
 * モーダル設定を取得
 */
function getModalConfig(editType: string, threadTs: string, isPending: boolean): any {
  const typeConfig: Record<string, { title: string; placeholder: string; hint: string }> = {
    date: { 
      title: '📅 日付を編集', 
      placeholder: '20241225 または 1225',
      hint: 'YYYYMMDD または MMDD 形式で入力してください'
    },
    title: { 
      title: '📝 タイトルを編集', 
      placeholder: 'タイトルを入力（空欄で削除）',
      hint: '空欄にするとタイトルが削除されます'
    },
    link: { 
      title: '🔗 リンクを編集', 
      placeholder: 'https://example.com（空欄で削除）',
      hint: '空欄にするとリンクが削除されます'
    }
  }
  
  const config = typeConfig[editType] || typeConfig.title
  
  return {
    type: 'modal',
    callback_id: `edit_${editType}_${isPending ? 'pending' : 'existing'}_${threadTs}`,
    title: {
      type: 'plain_text',
      text: config!.title
    },
    submit: {
      type: 'plain_text',
      text: '保存'
    },
    cancel: {
      type: 'plain_text',
      text: 'キャンセル'
    },
    blocks: [
      {
        type: 'input',
        block_id: 'edit_input',
        element: {
          type: 'plain_text_input',
          action_id: 'edit_value',
          placeholder: {
            type: 'plain_text',
            text: config!.placeholder
          }
        },
        label: {
          type: 'plain_text',
          text: config!.title
        },
        hint: {
          type: 'plain_text',
          text: config!.hint
        }
      }
    ]
  }
}

/**
 * ヘルスチェックエンドポイント
 */
app.get('/', (c) => c.text('OK'))

export default app
