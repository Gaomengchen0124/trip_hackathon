/**
 * API 适配层 —— 前端唯一的数据入口。
 * 业务代码只 import 本文件，永远不关心数据来自 mock 还是真实后端。
 *
 * 切换方式：改 .env 里的 VITE_USE_MOCK（改完需重启 dev server）。
 * 契约细节见同目录 contract.md；改契约必须先改 contract.md 再改实现。
 */
import { httpGet, httpPost } from './client'
import * as mock from './mock/index.js'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export async function search(keyword) {
  if (USE_MOCK) return mock.search(keyword)
  return httpGet(`/search?keyword=${encodeURIComponent(keyword)}`)
}

export async function listColumns() {
  if (USE_MOCK) return mock.listColumns()
  return httpGet('/columns')
}

export async function getLineDetail(lineId) {
  if (USE_MOCK) return mock.getLineDetail(lineId)
  return httpGet(`/lines/${lineId}`)
}

export async function plan(params) {
  if (USE_MOCK) return mock.plan(params)
  return httpPost('/plan', params)
}
