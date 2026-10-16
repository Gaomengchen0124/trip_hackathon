import { listColumns, getLineDetail } from '../api/adapter.js'
export async function resolveEntityNames(keys) {
  const columns = await listColumns()
  const lines = Object.values(columns).flatMap(groups => groups.flatMap(group => group.lines || []))
  const names = Object.fromEntries(lines.map(line => [`line:${line.lineId}`, line.title]))
  if (keys.some(key => key.startsWith('poi:'))) {
    const docs = await Promise.allSettled(lines.map(line => getLineDetail(line.lineId)))
    for (const doc of docs) if (doc.status === 'fulfilled') {
      for (const poi of doc.value.pois || []) names[`poi:${poi.poiId}`] = poi.name
    }
  }
  return names
}
