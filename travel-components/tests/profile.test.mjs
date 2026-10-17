import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuthSession, SESSION_KEY } from '../src/auth/session.mjs'
import { PROFILE_KEY, validateProfile } from '../src/auth/profile.mjs'
function memory() {
  const map = new Map()
  return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) }
}
test('rejects invalid nicknames and arbitrary avatar URLs', () => {
  for (const nickname of ['', ' ', '一', '一'.repeat(21), '名字\n换行', '<script>']) assert.ok(validateProfile({ nickname, avatar: '书' }))
  assert.ok(validateProfile({ nickname: '旅行读者', avatar: 'https://example.com/avatar' }))
  assert.equal(validateProfile({ nickname: ' 旅行读者 ', avatar: '山' }), '')
})
test('requires login and persists profile independently from session without extending session', () => {
  const storage = memory()
  let time = 1000
  const auth = createAuthSession({ storage, now: () => time })
  assert.equal(auth.updateProfile({ nickname: '旅行读者', avatar: '山' }).ok, false)
  auth.loginDemo()
  const sessionBefore = storage.getItem(SESSION_KEY)
  time += 1000
  assert.equal(auth.updateProfile({ nickname: ' 旅行读者 ', avatar: '山' }).ok, true)
  assert.equal(storage.getItem(SESSION_KEY), sessionBefore)
  const restored = createAuthSession({ storage, now: () => time })
  assert.equal(restored.getSnapshot().user.nickname, '旅行读者')
  assert.equal(restored.getSnapshot().user.avatar, '山')
  assert.equal(restored.getSnapshot().user.id, 'demo-reader')
  auth.logout(); auth.loginDemo()
  assert.equal(auth.getSnapshot().user.nickname, '旅行读者')
})
test('invalid or failed updates leave prior profile intact', () => {
  const storage = memory()
  const auth = createAuthSession({ storage })
  auth.loginDemo()
  auth.updateProfile({ nickname: '旅行读者', avatar: '山' })
  assert.equal(auth.updateProfile({ nickname: '', avatar: '书' }).ok, false)
  storage.setItem = () => { throw new Error('quota') }
  assert.equal(auth.updateProfile({ nickname: '另一读者', avatar: '叶' }).ok, false)
  assert.equal(auth.getSnapshot().user.nickname, '旅行读者')
})
test('corrupt stored profile cannot set identity or arbitrary avatar', () => {
  const storage = memory()
  const auth = createAuthSession({ storage })
  auth.loginDemo()
  for (const raw of ['{', 'null', JSON.stringify({ version: 1, nickname: '恶意昵称', avatar: 'javascript:bad', id: 'admin' })]) {
    storage.setItem(PROFILE_KEY, raw)
    const user = createAuthSession({ storage }).getSnapshot().user
    assert.equal(user.id, 'demo-reader')
    assert.equal(user.nickname, '巡礼体验官')
  }
})
test('profile changes in another tab update current user', () => {
  const storage = memory(), events = new EventTarget()
  const auth = createAuthSession({ storage, events })
  auth.loginDemo()
  const other = createAuthSession({ storage })
  other.updateProfile({ nickname: '跨页读者', avatar: '叶' })
  const event = new Event('storage'); event.key = PROFILE_KEY; events.dispatchEvent(event)
  assert.equal(auth.getSnapshot().user.nickname, '跨页读者')
  auth.destroy()
})
test('supports nickname initial and photo avatars without forcing preset symbols', async () => {
  const { avatarInitial, isAvatarImage } = await import('../src/auth/profile.mjs')
  const { prepareAvatar } = await import('../src/auth/avatar-upload.mjs')
  assert.equal(avatarInitial('肉桂妹妹'), '肉')
  assert.equal(validateProfile({ nickname: '肉桂妹妹', avatar: null }), '')
  assert.equal(isAvatarImage('data:image/svg+xml;base64,PHN2Zz4='), false)
  assert.equal(isAvatarImage('javascript:alert(1)'), false)
  await assert.rejects(prepareAvatar({ type: 'image/svg+xml', size: 100 }), /JPG/)
  await assert.rejects(prepareAvatar({ type: 'image/png', size: 6 * 1024 * 1024 }), /5MB/)
})
