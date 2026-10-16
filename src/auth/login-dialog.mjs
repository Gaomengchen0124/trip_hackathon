import { getAuthSession } from './session.mjs'
import { createLoginForm, DEMO_CODE } from './login-form.mjs'
const model = createLoginForm()
let activeDialog = null
let closeObservers = []

// Shared by the standalone demo and Vue entry; no real credentials are transmitted.
export function openLoginDialog({ onClose } = {}) {
  if (onClose) closeObservers.push(onClose)
  if (activeDialog) { activeDialog.focus(); return }
  const auth = getAuthSession()
  const live = auth.getSnapshot().mode === 'server'
  let resendAt = 0, sending = false, verifying = false
  const opener = document.activeElement
  const previousOverflow = document.body.style.overflow
  const dialog = document.createElement('dialog')
  dialog.className = 'login-dialog'
  dialog.setAttribute('aria-label', live ? '邮箱登录' : '登录（演示）')
  dialog.innerHTML = `
    <div class="login-heading"><h2>登录，继续你的巡礼</h2><button type="button" data-close aria-label="关闭登录弹窗">×</button></div>
    <p class="login-demo">演示模式：不会发送短信或邮件，也不会保存或上传输入的账号。所有账号进入同一演示身份。</p>
    <div class="login-methods" role="group" aria-label="登录方式">
      <button type="button" data-method="phone" aria-pressed="true">手机号</button>
      <button type="button" data-method="email" aria-pressed="false">邮箱</button>
    </div>
    <form novalidate>
      <label for="travel-login-account" data-account-label>手机号（中国大陆 +86）</label>
      <input id="travel-login-account" name="account" type="tel" autocomplete="tel" inputmode="tel" maxlength="254" placeholder="请输入 11 位手机号" aria-describedby="travel-login-error" autofocus>
      <label for="travel-login-code">验证码</label>
      <div class="login-code-row"><input id="travel-login-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 位数字" aria-describedby="travel-login-error"><button type="button" data-send>获取演示验证码</button></div>
      <p class="login-feedback" id="travel-login-error" role="alert"></p>
      <p class="login-feedback" data-notice role="status"></p>
      <button class="login-submit" type="submit">登录（演示）</button>
    </form>`
  const form = dialog.querySelector('form')
  const account = form.elements.account
  const code = form.elements.code
  const send = dialog.querySelector('[data-send]')
  const error = dialog.querySelector('#travel-login-error')
  const notice = dialog.querySelector('[data-notice]')
  let method = live ? 'email' : 'phone'
  if (live) {
    dialog.querySelector('.login-demo').textContent = '使用邮箱验证码登录。'
    dialog.querySelector('.login-methods').hidden = true
    dialog.querySelector('[data-account-label]').textContent = '邮箱'
    account.type = 'email'; account.inputMode = 'email'; account.autocomplete = 'email'; account.placeholder = '请输入邮箱地址'
    form.querySelector('[type="submit"]').textContent = '登录'
  }
  const clearError = () => {
    error.textContent = ''
    account.removeAttribute('aria-invalid')
    code.removeAttribute('aria-invalid')
  }
  function tick() {
    const remaining = live ? Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)) : model.remaining()
    send.disabled = sending || remaining > 0
    send.textContent = remaining ? `${remaining} 秒后重新获取` : live ? '获取验证码' : '获取演示验证码'
  }
  for (const button of dialog.querySelectorAll('[data-method]')) {
    button.onclick = () => {
      method = button.dataset.method
      for (const tab of dialog.querySelectorAll('[data-method]')) tab.setAttribute('aria-pressed', String(tab === button))
      account.value = ''; code.value = ''; notice.textContent = ''; clearError()
      account.type = method === 'phone' ? 'tel' : 'email'
      account.inputMode = method === 'phone' ? 'tel' : 'email'
      account.autocomplete = method === 'phone' ? 'tel' : 'email'
      account.placeholder = method === 'phone' ? '请输入 11 位手机号' : '请输入邮箱地址'
      dialog.querySelector('[data-account-label]').textContent = method === 'phone' ? '手机号（中国大陆 +86）' : '邮箱'
      account.focus()
    }
  }
  account.oninput = () => { clearError(); code.value = ''; notice.textContent = '' }
  code.oninput = clearError
  send.onclick = async () => {
    if (sending) return
    clearError()
    const validation = model.validate(method, account.value)
    if (validation) { error.textContent = validation; account.focus(); return }
    sending = true; tick()
    const email = account.value.trim()
    try {
      if (live) { await auth.sendCode(email); resendAt = Date.now() + 60000 }
      else { const message = model.send(method, email); if (message) throw new Error(message) }
      if (!dialog.isConnected) return
      notice.textContent = live ? '验证码已发送，请检查邮箱，5 分钟内有效。' : `演示验证码：${DEMO_CODE}，5 分钟内有效。未发送短信或邮件。`
      code.focus()
    } catch (failure) { if (dialog.isConnected) error.textContent = failure.message }
    finally { sending = false; tick() }
  }
  form.onsubmit = async event => {
    event.preventDefault(); clearError()
    if (verifying) return
    const validation = model.validate(method, account.value)
    if (validation) { error.textContent = validation; account.focus(); return }
    verifying = true
    const submit = form.querySelector('[type="submit"]'); submit.disabled = true
    try {
      if (live) await auth.loginEmail(account.value.trim(), code.value.trim())
      else { const message = model.verify(method, account.value, code.value); if (message) throw new Error(message); auth.loginDemo() }
      if (dialog.open) dialog.close()
    } catch (failure) { if (dialog.isConnected) { error.textContent = failure.message; code.focus() } }
    finally { verifying = false; submit.disabled = false }
  }
  dialog.querySelector('[data-close]').onclick = () => dialog.close()
  dialog.onclick = event => {
    if (event.target !== dialog) return
    const rect = dialog.getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close()
  }
  document.body.append(dialog)
  activeDialog = dialog
  document.body.style.overflow = 'hidden'
  const timer = setInterval(tick, 1000)
  const unsubscribe = getAuthSession().subscribe(state => { if (state.isLoggedIn && dialog.open) dialog.close() })
  dialog.addEventListener('close', () => {
    clearInterval(timer); unsubscribe(); dialog.remove(); activeDialog = null
    document.body.style.overflow = previousOverflow
    if (opener?.isConnected) opener.focus()
    const callbacks = closeObservers
    closeObservers = []
    for (const callback of callbacks) callback(getAuthSession().getSnapshot().isLoggedIn)
  }, { once: true })
  tick()
  dialog.showModal()
  return () => { if (dialog.open) dialog.close() }
}

export function requestDemoLogin() {
  if (getAuthSession().getSnapshot().isLoggedIn) return Promise.resolve(true)
  return new Promise(resolve => openLoginDialog({ onClose: resolve }))
}
