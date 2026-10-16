export function itineraryText(title, result, pois) {
  const names = new Map(pois.map(p => [p.poiId, p.name]))
  const lines = [`${title || '我的巡礼'} · 行程单`, '']
  for (const day of result?.days || []) {
    lines.push(`第 ${day.day} 天 · ${day.date || ''}`)
    for (const item of day.items || []) {
      if (item.legMinutes) lines.push(`  路上约 ${item.legMinutes} 分钟`)
      lines.push(`${item.arrive || '待定'}–${item.leave || '待定'}  ${names.get(item.poiId) || '待补充景点'}${item.mode === 'rush' ? '（快速打卡）' : ''}`)
    }
    lines.push('')
  }
  if (result?.message) lines.push(result.message)
  return lines.join('\n')
}
export async function downloadItinerary(text, title) {
  await document.fonts?.ready
  const probe = document.createElement('canvas').getContext('2d')
  probe.font = '22px sans-serif'
  const lines = []
  for (const line of text.split('\n')) {
    let part = ''
    for (const character of line) {
      if (probe.measureText(part + character).width > 800 && part) { lines.push(part); part = '' }
      part += character
    }
    lines.push(part)
  }
  // Long journeys are split into readable PNG pages rather than truncated.
  const perPage = 46
  for (let start = 0; start < lines.length; start += perPage) {
    const page = lines.slice(start, start + perPage)
    const canvas = document.createElement('canvas')
    const height = Math.max(260, page.length * 34 + 120)
    canvas.width = 1840; canvas.height = height * 2
    const ctx = canvas.getContext('2d'); ctx.scale(2, 2)
    ctx.fillStyle = '#faf7f0'; ctx.fillRect(0, 0, 920, height)
    ctx.fillStyle = '#493d29'; ctx.font = '22px sans-serif'; ctx.textBaseline = 'top'
    page.forEach((line, i) => ctx.fillText(line, 60, 50 + i * 34))
    ctx.fillStyle = '#7a7168'; ctx.font = '16px sans-serif'
    ctx.fillText(`我的圣地巡礼 · ${Math.floor(start / perPage) + 1} / ${Math.ceil(lines.length / perPage)}`, 60, height - 40)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('图片生成失败，请重试。')
    const url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = `${(title || '巡礼行程').replace(/[\\/:*?"<>|]/g, '_')}-${Math.floor(start / perPage) + 1}.png`
    document.body.append(link); link.click(); link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
}
