import { mountProfileLibrary } from './profile-library.mjs'
import { getAuthSession } from './session.mjs'
import { isAvatarImage, avatarInitial } from './profile.mjs'
import { prepareAvatar } from './avatar-upload.mjs'
let active = null
export function openProfileDialog() {
  if (active) { active.focus(); return }
  const auth = getAuthSession()
  const user = auth.getSnapshot().user
  if (!user) return
  const opener = document.activeElement
  const previousOverflow = document.body.style.overflow
  const dialog = document.createElement('dialog')
  dialog.className = 'login-dialog profile-dialog'
  dialog.setAttribute('aria-label', auth.getSnapshot().mode === 'demo' ? '个人中心（演示）' : '个人中心')
  dialog.innerHTML = `
    <div class="login-heading"><h2>我的巡礼档案</h2><button type="button" data-close aria-label="关闭个人中心">×</button></div>
    <form novalidate>
      <label for="travel-profile-nickname">昵称</label>
      <input id="travel-profile-nickname" name="nickname" type="text" placeholder="2–20 个字符" aria-describedby="profile-error" autofocus>
      <div class="profile-upload">
        <p class="profile-avatar-title">头像</p>
        <div class="profile-avatar-row">
          <div class="profile-preview" data-preview aria-label="头像预览"></div>
          <label class="profile-upload-button" for="travel-profile-photo">上传图片</label>
          <input class="profile-file-input" id="travel-profile-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" aria-label="上传图片" aria-describedby="profile-error">
        </div>
      </div>
      <p class="login-feedback" id="profile-error" role="alert"></p>
      <p class="login-feedback" data-result role="status"></p>
      <button class="login-submit" type="submit">保存资料</button>
    </form>`
  const interestButton = document.createElement('button')
  interestButton.type = 'button'; interestButton.className = 'login-submit'; interestButton.textContent = '编辑我的内容兴趣'
  interestButton.onclick = () => {
    dialog.addEventListener('close', () => window.dispatchEvent(new Event('travel-edit-interests')), { once:true })
    dialog.close()
  }
  dialog.append(interestButton)
  const form = dialog.querySelector('form')
  const input = form.elements.nickname
  const error = dialog.querySelector('#profile-error')
  const result = dialog.querySelector('[data-result]')
  input.value = user.nickname
  let avatar = isAvatarImage(user.avatar) ? user.avatar : null
  let dirty = false, processing = false, uploadVersion = 0
  const photo = form.elements.photo
  const submit = form.querySelector('[type="submit"]')
  function preview() {
    const container = dialog.querySelector('[data-preview]')
    if (isAvatarImage(avatar)) {
      const image = document.createElement('img'); image.src = avatar; image.alt = '当前头像'
      container.replaceChildren(image)
    } else container.textContent = avatarInitial(input.value)
  }
  preview()
  form.oninput = () => { dirty = true; error.textContent = ''; result.textContent = ''; input.removeAttribute('aria-invalid'); preview() }
  photo.onchange = async () => {
    const file = photo.files[0]
    if (!file) return
    const version = ++uploadVersion
    processing = true; submit.disabled = true
    result.textContent = '正在处理头像…'
    try {
      const value = await prepareAvatar(file)
      if (version !== uploadVersion || !dialog.isConnected) return
      avatar = value; dirty = true; preview(); result.textContent = ''; error.textContent = ''
    } catch (failure) {
      if (version === uploadVersion) { error.textContent = failure.name === 'InvalidStateError' ? '图片无法读取，请换一张 JPG、PNG 或 WebP 图片。' : (failure.message || '图片无法读取，请换一张图片。'); result.textContent = '' }
    } finally {
      if (version === uploadVersion) { processing = false; submit.disabled = false; photo.value = '' }
    }
  }
  form.onsubmit = async event => {
    event.preventDefault()
    if (processing) return
    submit.disabled = true
    const outcome = await auth.updateProfile({ nickname: input.value, avatar })
    submit.disabled = false
    if (!dialog.isConnected) return
    error.textContent = outcome.error
    if (outcome.ok) { dirty = false; input.value = auth.getSnapshot().user.nickname; result.textContent = auth.getSnapshot().mode === 'server' ? '资料已保存。' : '资料已保存到当前浏览器。'; preview() }
    else { input.setAttribute('aria-invalid', 'true'); input.focus() }
  }
  dialog.querySelector('[data-close]').onclick = () => dialog.close()
  dialog.onclick = event => {
    if (event.target !== dialog) return
    const box = dialog.getBoundingClientRect()
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close()
  }
  document.body.append(dialog); active = dialog
  document.body.style.overflow = 'hidden'
  const cleanupLibrary = mountProfileLibrary(dialog, auth)
  const unsubscribe = auth.subscribe(state => {
    if (!state.user) { if (dialog.open) dialog.close(); return }
    if (!dirty) {
      input.value = state.user.nickname
      avatar = isAvatarImage(state.user.avatar) ? state.user.avatar : null
      preview()
    }
  })
  dialog.addEventListener('close', () => {
    uploadVersion++; cleanupLibrary(); unsubscribe(); dialog.remove(); active = null
    document.body.style.overflow = previousOverflow
    if (opener?.isConnected) opener.focus()
  }, { once: true })
  dialog.showModal()
  return () => { if (dialog.open) dialog.close() }
}
