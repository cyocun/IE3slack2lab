import type { Context } from 'hono'
import type { Bindings } from '../types'
import { 
  getThreadData, 
  storeThreadData, 
  deleteThreadData 
} from '../utils/kv'
import { sendSlackMessage, sendInteractiveMessage } from '../utils/slack'
import {
  FlowData,
  FLOW_STATE,
  completeUpload,
  handleEditSelection,
  handleDeleteEntry,
  confirmDelete
} from './flowHandler'

/**
 * ボタンインタラクション処理
 */
export async function handleButtonInteraction(
  c: Context, 
  env: Bindings, 
  payload: any
): Promise<Response> {
  try {
    const action = payload.actions[0]
    const actionId = action.action_id
    const channel = payload.channel.id
    const threadTs = payload.message.thread_ts || payload.message.ts
    
    const flowData = await getThreadData(env, threadTs) as FlowData
    
    if (!flowData) {
      await sendSlackMessage(
        env.SLACK_BOT_TOKEN, 
        channel, 
        threadTs, 
        'データがない🤔'
      )
      return c.text('OK')
    }
    
    // アクションIDに基づく処理
    switch (actionId) {
      case 'cancel_upload':
        await handleCancelUpload(env, flowData, threadTs)
        break
        
      case 'skip_title':
        await handleSkipTitle(env, flowData, threadTs)
        break
        
      case 'skip_link':
        await handleSkipLink(env, flowData, threadTs)
        break
        
      case 'post_now':
        await completeUpload(env, flowData, threadTs)
        break
        
      case 'edit_entry':
        await handleEditSelection(env, flowData, threadTs)
        break
        
      case 'edit_date':
      case 'edit_title':
      case 'edit_link':
        await handleEditFieldSelection(env, flowData, threadTs, actionId)
        break
        
      case 'cancel_edit':
        await handleCancelEdit(env, flowData, threadTs)
        break
        
      case 'delete_entry':
        await handleDeleteEntry(env, flowData, threadTs)
        break
        
      case 'confirm_delete':
        await confirmDelete(env, flowData, threadTs)
        break
        
      case 'cancel_delete':
        await handleCancelDelete(env, flowData, threadTs)
        break
    }
    
    return c.text('OK')
  } catch (error) {
    console.error('Button interaction error:', error)
    return c.text('OK')
  }
}

/**
 * アップロード取り消し処理
 */
async function handleCancelUpload(
  env: Bindings, 
  flowData: FlowData, 
  threadTs: string
): Promise<void> {
  await deleteThreadData(env, threadTs)
  await sendSlackMessage(
    env.SLACK_BOT_TOKEN,
    flowData.channel,
    threadTs,
    'キャンセル👌'
  )
}

/**
 * タイトルスキップ処理
 */
async function handleSkipTitle(
  env: Bindings,
  flowData: FlowData,
  threadTs: string
): Promise<void> {
  flowData.collectedData = { ...flowData.collectedData, title: '' }
  flowData.flowState = FLOW_STATE.WAITING_LINK
  await storeThreadData(env, threadTs, flowData)
  
  // リンク入力を促す（ボタン付き）
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `日付: ${flowData.collectedData?.date} ✅\n` +
              `タイトル: なし ✅\n\n` +
              `🔗 *リンクは？*\n「no」か投稿ボタンでスキップ`
      }
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "💾 投稿"
          },
          style: "primary",
          action_id: "post_now"
        }
      ]
    }
  ]
  
  await sendInteractiveMessage(
    env.SLACK_BOT_TOKEN,
    flowData.channel,
    threadTs,
    '',
    blocks
  )
}

/**
 * リンクスキップ処理
 */
async function handleSkipLink(
  env: Bindings,
  flowData: FlowData,
  threadTs: string
): Promise<void> {
  flowData.collectedData = { ...flowData.collectedData, link: '' }
  await completeUpload(env, flowData, threadTs)
}

/**
 * 編集フィールド選択処理
 */
async function handleEditFieldSelection(
  env: Bindings,
  flowData: FlowData,
  threadTs: string,
  actionId: string
): Promise<void> {
  const field = actionId.replace('edit_', '') as 'date' | 'title' | 'link'
  
  flowData.flowState = FLOW_STATE.EDITING
  flowData.editingField = field
  await storeThreadData(env, threadTs, flowData)
  
  const prompts = {
    date: '📅 新しい日付（YYYY/MM/DD、YYYYMMDD、MMDD）',
    title: '📝 新しいタイトル（「no」でなし）',
    link: '🔗 新しいリンク（「no」でなし）'
  }
  
  await sendSlackMessage(
    env.SLACK_BOT_TOKEN,
    flowData.channel,
    threadTs,
    prompts[field]
  )
}

/**
 * 編集キャンセル処理
 */
async function handleCancelEdit(
  env: Bindings,
  flowData: FlowData,
  threadTs: string
): Promise<void> {
  flowData.flowState = FLOW_STATE.COMPLETED
  delete flowData.editingField
  await storeThreadData(env, threadTs, flowData)
  
  await sendSlackMessage(
    env.SLACK_BOT_TOKEN,
    flowData.channel,
    threadTs,
    'キャンセル👌'
  )
}

/**
 * 削除キャンセル処理
 */
async function handleCancelDelete(
  env: Bindings,
  flowData: FlowData,
  threadTs: string
): Promise<void> {
  await sendSlackMessage(
    env.SLACK_BOT_TOKEN,
    flowData.channel,
    threadTs,
    'キャンセル👌'
  )
}