export const PROFILE_KEY = 'book-travel.demo-profile.v1'
// Kept only to read old demo profiles; no longer offered in the UI.
export const AVATARS = Object.freeze(['书', '山', '行', '叶'])
export function isAvatarImage(avatar) {
  return typeof avatar === 'string' && avatar.length <= 180000 && /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(avatar)
}
export function avatarInitial(nickname) { return Array.from(nickname?.trim() || '游客')[0] }
export function validateProfile({ nickname, avatar } = {}) {
  if (typeof nickname !== 'string' || !nickname.trim()) return '请输入昵称。'
  const length = Array.from(nickname.trim()).length
  if (length < 2 || length > 20) return '昵称需为 2–20 个字符。'
  if (/[\u0000-\u001f\u007f<>]/u.test(nickname)) return '昵称不能包含换行、控制字符或尖括号。'
  if (avatar !== null && avatar !== '' && !AVATARS.includes(avatar) && !isAvatarImage(avatar)) return '头像格式不正确，请重新选择图片。'
  return ''
}
