import type { Bindings, ThreadData, LabEntry } from '../types'

/**
 * スレッドデータをKVに保存
 * @param env - Environment bindings
 * @param threadTs - Slack thread timestamp
 * @param data - Thread data to store
 */
export async function storeThreadData(env: Bindings, threadTs: string, data: ThreadData): Promise<void> {
  await env.THREADS_KV.put(`thread:${threadTs}`, JSON.stringify(data))
}

/**
 * スレッドデータをKVから取得
 * @param env - Environment bindings
 * @param threadTs - Slack thread timestamp
 * @returns Thread data or null if not found
 */
export async function getThreadData(env: Bindings, threadTs: string): Promise<ThreadData | null> {
  const data = await env.THREADS_KV.get(`thread:${threadTs}`)
  return data ? JSON.parse(data) : null
}

/**
 * スレッドデータをKVから削除
 * @param env - Environment bindings
 * @param threadTs - Slack thread timestamp
 */
export async function deleteThreadData(env: Bindings, threadTs: string): Promise<void> {
  await env.THREADS_KV.delete(`thread:${threadTs}`)
}

/**
 * GitHubのJSON配列から指定IDのエントリを更新
 * @param entries - Current lab entries array
 * @param entryId - Entry ID to update
 * @param updates - Partial updates to apply
 * @returns Updated entries array
 */
export function updateEntryById(entries: LabEntry[], entryId: number, updates: Partial<LabEntry>): LabEntry[] {
  return entries.map(entry => 
    entry.id === entryId ? { ...entry, ...updates } : entry
  )
}

/**
 * GitHubのJSON配列から指定IDのエントリを削除
 * @param entries - Current lab entries array
 * @param entryId - Entry ID to delete
 * @returns Updated entries array
 */
export function deleteEntryById(entries: LabEntry[], entryId: number): LabEntry[] {
  return entries.filter(entry => entry.id !== entryId)
}

/**
 * エントリIDから対応する画像ファイルパスを取得
 * @param entries - Current lab entries array
 * @param entryId - Entry ID to find
 * @returns Image file path or null if not found
 */
export function getImagePathByEntryId(entries: LabEntry[], entryId: number): string | null {
  const entry = entries.find(e => e.id === entryId)
  return entry ? entry.image : null
}