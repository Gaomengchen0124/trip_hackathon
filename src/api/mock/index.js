// Home uses generated summaries; individual documents and planning code are lazy.
import { lineFiles, lineSummary, getPreviewDoc } from './catalog.js'
export { search, listColumns, lines } from './catalog.js'

const documents = import.meta.glob('../../../data/lines/*.json', { import: 'default' })
async function loadDocument(lineId) {
  const draft = getPreviewDoc(lineId)
  if (draft) return draft
  const load = documents[`../../../data/lines/${lineFiles[lineId]}`]
  if (!load) throw new Error(`路线不存在: ${lineId}`)
  return load()
}

export async function getLineDetail(lineId) {
  const doc = await loadDocument(lineId)
  return {
    line: { aliases: [], tags: {}, ...lineSummary(lineId), lineId, ipId: doc.line.ipId, title: doc.line.title, city: doc.line.city, cover: doc.line.cover, recommendDays: doc.line.recommendDays },
    ip: doc.ip,
    pois: [...doc.ipStops, ...doc.cityStops],
  }
}

export async function plan({ lineId, poiIds = [], timeRange, hoursPerDay = 8, protectedIds = [] }) {
  const doc = await loadDocument(lineId)
  if (!timeRange?.startDate || !timeRange?.endDate) throw new Error('还没选日期区间')
  const [{ toPlanInput }, { runPlan }] = await Promise.all([
    import('../../engine/catalog.mjs'), import('../../engine/plan-result.mjs'),
  ])
  const { pois: picked, allPois } = toPlanInput(doc, { poiIds })
  return runPlan({ pois: picked, allPois, timeRange, hoursPerDay, protectedIds })
}

// Debug tools explicitly request the complete data; normal pages never call this.
export async function getDiagnostics() {
  const docs = await Promise.all(Object.keys(lineFiles).map(loadDocument))
  const { lineReadiness } = await import('../../engine/catalog.mjs')
  return {
    ips: docs.map(doc => doc.ip),
    pois: docs.flatMap(doc => [...doc.ipStops, ...doc.cityStops]),
    readiness: Object.fromEntries(docs.map(doc => [doc.line.lineId, lineReadiness(doc)])),
  }
}
