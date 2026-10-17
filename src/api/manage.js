// 管理后台 API 封装：同源 cookie 会话，统一错误抛出（err.message = 服务端的 error 字段）
export class ManageError extends Error {
  constructor(message, { status, issues } = {}) {
    super(message)
    this.status = status
    this.issues = issues ?? null
  }
}

export async function manage(path, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ManageError('无法连接服务，请确认内容服务已启动。', { status: 0 })
  }
  const value = await res.json().catch(() => ({}))
  if (!res.ok) throw new ManageError(value.error || `请求失败（HTTP ${res.status}）`, { status: res.status, issues: value.issues })
  return value
}

/** 压缩并上传一张 JPEG，返回 /api/content/img/<uuid>.jpg */
export async function uploadImage(file) {
  const dataUrl = await compressImage(file)
  const { url } = await manage('/api/manage/content/img', { method: 'POST', body: { dataUrl } })
  return url
}

function compressImage(file, maxEdge = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new ManageError('图片读取失败', { status: 0 })) }
    img.src = url
  })
}
