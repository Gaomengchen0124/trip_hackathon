export async function prepareAvatar(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片。')
  if (file.size > 5 * 1024 * 1024) throw new Error('图片需小于 5MB。')
  const bitmap = await createImageBitmap(file)
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40000000) throw new Error('图片尺寸过大，请选择较小的图片。')
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const context = canvas.getContext('2d')
    context.fillStyle = '#f3eddf'; context.fillRect(0, 0, 256, 256)
    const side = Math.min(bitmap.width, bitmap.height)
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256)
    const result = canvas.toDataURL('image/jpeg', .82)
    if (result.length > 180000) throw new Error('图片处理后仍过大，请更换图片。')
    return result
  } finally { bitmap.close() }
}
