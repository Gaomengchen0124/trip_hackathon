let cataloguePromise
export async function resolveEntityNames(keys) {
  cataloguePromise ||= fetch('/data/lines/index.json').then(r=>{if(!r.ok)throw Error();return r.json()}).catch(()=>{cataloguePromise=null;return {lines:[]}})
  const catalogue=await cataloguePromise
  const names=Object.fromEntries(catalogue.lines.map(line=>[`line:${line.lineId}`,line.title]))
  if(keys.some(key=>key.startsWith('poi:'))) {
    const docs=await Promise.allSettled(catalogue.lines.map(line=>{
      if(!/^data\/lines\/[a-zA-Z0-9_-]+\.json$/.test(line.file))return null
      return fetch('/'+line.file).then(r=>r.ok?r.json():null)
    }))
    for(const doc of docs)if(doc.status==='fulfilled'&&doc.value)for(const poi of [...(doc.value.ipStops||[]),...(doc.value.cityStops||[])])names[`poi:${poi.poiId}`]=poi.name
  }
  return names
}
