import catalog from '../../data/home-catalog.json'

const previewDocs = {}
try {
  if (new URLSearchParams(globalThis.location?.search || '').get('preview') === '1') {
    const saved = JSON.parse(globalThis.sessionStorage?.getItem('preview-docs') || '{}')
    for (const [id, doc] of Object.entries(saved)) if (doc?.line?.lineId === id) previewDocs[id] = doc
  }
} catch { /* Invalid draft data must not prevent ordinary browsing. */ }
export const getPreviewDoc = id => previewDocs[id]
const entries = catalog.lines.map(summary => {
  const draft = getPreviewDoc(summary.line.lineId)
  return draft ? { ...summary, line: { ...summary.line, ...draft.line }, searchNames: [...(draft.ipStops || []), ...(draft.cityStops || [])].map(p => p.name).filter(Boolean) } : summary
})
export const lines = entries.map(entry => entry.line)
export const lineFiles = catalog.files
export const lineSummary = id => lines.find(line => line.lineId === id)

export function listColumns() {
  const groups = new Map()
  for (const line of lines) {
    const city = line.city || '其他'
    if (!groups.has(city)) groups.set(city, { label: city, lines: [] })
    groups.get(city).lines.push(line)
  }
  return { city: [...groups.values()] }
}

export function search(keyword) {
  const q = String(keyword ?? '').trim().toLowerCase()
  if (!q) return []
  const contains = value => String(value).toLowerCase().includes(q)
  return entries.map(entry => {
    const line = entry.line
    const score = contains(entry.searchTitle) ? 100
      : line.aliases.some(contains) ? 80
        : Object.values(line.tags).some(tags => tags.some(contains)) ? 60
          : entry.searchNames.some(contains) ? 40 : 0
    return { entry, score }
  }).filter(hit => hit.score).sort((a, b) => b.score - a.score || a.entry.searchTitle.localeCompare(b.entry.searchTitle)).map(hit => hit.entry.line)
}
