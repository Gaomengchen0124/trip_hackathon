import { getAuthSession } from './session.mjs'
import { createLoginForm, DEMO_CODE } from './login-form.mjs'

const model = createLoginForm()
let activeDialog = null
let closeObservers = []

const serverMarkup = [
  '<p class="login-demo">选择账号密码登录，或使用邮箱验证码登录。</p>',
  '<div class="login-methods" role="tablist" aria-label="登录方式">',
  '<button id="travel-password-tab" type="button" role="tab" data-method="password" aria-selected="true" aria-controls="travel-password-panel">账号密码登录</button>',
  '<button id="travel-email-tab" type="button" role="tab" data-method="email" aria-selected="false" aria-controls="travel-email-panel" tabindex="-1">邮箱验证码登录</button>',
  '</div>',
  '<form id="travel-password-panel" role="tabpanel" aria-labelledby="travel-password-tab" data-password-form novalidate>',
  '<label for="travel-login-account">账号（邮箱）</label>',
  '<input id="travel-login-account" name="account" type="email" autocomplete="username" inputmode="email" maxlength="254" placeholder="请输入账号邮箱" aria-describedby="travel-password-error" autofocus>',
  '<label for="travel-login-password">密码</label>',
  '<input id="travel-login-password" name="password" type="password" autocomplete="current-password" minlength="8" maxlength="128" placeholder="请输入密码" aria-describedby="travel-password-error">',
  '<p class="login-feedback" id="travel-password-error" role="alert"></p>',
  '<button class="login-submit" type="submit">登录</button>',
  '</form>',
  '<form id="travel-email-panel" role="tabpanel" aria-labelledby="travel-email-tab" data-code-form hidden novalidate>',
  '<label for="travel-login-email">邮箱地址</label>',
  '<input id="travel-login-email" name="account" type="email" autocomplete="email" inputmode="email" maxlength="254" placeholder="请输入邮箱地址" aria-describedby="travel-email-error">',
  '<label for="travel-login-code">验证码</label>',
  '<div class="login-code-row"><input id="travel-login-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 位数字" aria-describedby="travel-email-error"><button type="button" data-send>获取验证码</button></div>',
  '<p class="login-feedback" id="travel-email-error" role="alert"></p>',
  '<p class="login-feedback" data-notice role="status"></p>',
  '<button class="login-submit" type="submit">登录</button>',
  '</form>',
].join('')

const demoMarkup = [
  '<p class="login-demo">演示模式：不会发送短信或邮件，也不会保存或上传输入的账号。所有账号进入同一演示身份。</p>',
  '<div class="login-methods" role="group" aria-label="登录方式">',
  '<button type="button" data-method="phone" aria-pressed="true">手机号</button>',
  '<button type="button" data-method="email" aria-pressed="false">邮箱</button>',
  '</div>',
  '<form data-code-form novalidate>',
  '<label for="travel-login-account" data-account-label>手机号（中国大陆 +86）</label>',
  '<input id="travel-login-account" name="account" type="tel" autocomplete="tel" inputmode="tel" maxlength="254" placeholder="请输入 11 位手机号" aria-describedby="travel-login-error" autofocus>',
  '<label for="travel-login-code">验证码</label>',
  '<div class="login-code-row"><input id="travel-login-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 位数字" aria-describedby="travel-login-error"><button type="button" data-send>获取演示验证码</button></div>',
  '<p class="login-feedback" id="travel-login-error" role="alert"></p>',
  '<p class="login-feedback" data-notice role="status"></p>',
  '<button class="login-submit" type="submit">登录（演示）</button>',
  '</form>',
].join('')

export function openLoginDialog({ onClose } = {}) {
  if (onClose) closeObservers.push(onClose)
  if (activeDialog) { activeDialog.focus(); return }
  const auth = getAuthSession()
  const live = auth.getSnapshot().mode === 'server'
  const opener = document.activeElement
  const previousOverflow = document.body.style.overflow
  const dialog = document.createElement('dialog')
  dialog.className = 'login-dialog'
  dialog.setAttribute('aria-label', live ? '登录' : '登录（演示）')
  dialog.innerHTML = '<div class="login-heading"><h2>登录，继续你的巡礼</h2><button type="button" data-close aria-label="关闭登录弹窗">×</button></div>' + (live ? serverMarkup : demoMarkup)

  const tabs = [...dialog.querySelectorAll('[data-method]')]
  const codeForm = dialog.querySelector('[data-code-form]')
  const passwordForm = dialog.querySelector('[data-password-form]')
  const account = codeForm.elements.account
  const code = codeForm.elements.code
  const send = codeForm.querySelector('[data-send]')
  const notice = codeForm.querySelector('[data-notice]')
  let method = live ? 'password' : 'phone'
  let resendAt = 0, sending = false, verifying = false

  function clearError(form) {
    form.querySelector('[role="alert"]').textContent = ''
    for (const input of form.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid')
  }
  function fail(form, message, input) {
    form.querySelector('[role="alert"]').textContent = message
    if (input) { input.setAttribute('aria-invalid', 'true'); input.focus() }
  }
  function tick() {
    const remaining = live ? Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)) : model.remaining()
    send.disabled = sending || verifying || remaining > 0
    send.textContent = sending ? '发送中…' : remaining ? remaining + ' 秒后重新获取' : live ? '获取验证码' : '获取演示验证码'
  }
  function setBusy() {
    for (const tab of tabs) tab.disabled = sending || verifying
    for (const form of dialog.querySelectorAll('form')) {
      form.querySelector('[type="submit"]').disabled = sending || verifying
    }
    account.readOnly = sending
    tick()
  }
  function selectMethod(button) {
    if (sending || verifying) return
    method = button.dataset.method
    for (const tab of tabs) {
      tab.setAttribute(live ? 'aria-selected' : 'aria-pressed', String(tab === button))
      if (live) tab.tabIndex = tab === button ? 0 : -1
    }
    for (const form of dialog.querySelectorAll('form')) clearError(form)
    notice.textContent = ''
    if (live) {
      const isPassword = method === 'password'
      const destination = isPassword ? passwordForm : codeForm
      const previous = isPassword ? codeForm : passwordForm
      if (!destination.elements.account.value) destination.elements.account.value = previous.elements.account.value
      passwordForm.hidden = !isPassword
      codeForm.hidden = isPassword
      passwordForm.elements.password.value = ''
      destination.elements.account.focus()
    } else {
      account.value = ''; code.value = ''
      account.type = method === 'phone' ? 'tel' : 'email'
      account.inputMode = method === 'phone' ? 'tel' : 'email'
      account.autocomplete = method === 'phone' ? 'tel' : 'email'
      account.placeholder = method === 'phone' ? '请输入 11 位手机号' : '请输入邮箱地址'
      dialog.querySelector('[data-account-label]').textContent = method === 'phone' ? '手机号（中国大陆 +86）' : '邮箱'
      account.focus()
    }
  }
  for (const button of tabs) {
    button.onclick = () => selectMethod(button)
    if (live) button.onkeydown = event => {
      const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : ['ArrowLeft', 'ArrowRight'].includes(event.key) ? tabs.find(tab => tab !== button) : null
      if (next && !next.disabled) { event.preventDefault(); selectMethod(next); next.focus() }
    }
  }
  for (const form of dialog.querySelectorAll('form')) {
    form.addEventListener('input', () => clearError(form))
  }
  account.addEventListener('input', () => { code.value = ''; notice.textContent = '' })
  send.onclick = async () => {
    if (sending || verifying || send.disabled) return
    clearError(codeForm)
    const validation = model.validate(live ? 'email' : method, account.value)
    if (validation) return fail(codeForm, validation, account)
    sending = true; setBusy()
    try {
      if (live) { await auth.sendCode(account.value.trim()); resendAt = Date.now() + 60000 }
      else { const message = model.send(method, account.value); if (message) throw new Error(message) }
      if (!dialog.isConnected) return
      notice.textContent = live ? '验证码已发送，请检查邮箱，5 分钟内有效。' : '演示验证码：' + DEMO_CODE + '，5 分钟内有效。未发送短信或邮件。'
      code.focus()
    } catch (failure) { if (dialog.isConnected) fail(codeForm, failure.message) }
    finally { sending = false; setBusy() }
  }
  codeForm.onsubmit = async event => {
    event.preventDefault()
    if (sending || verifying) return
    clearError(codeForm)
    const validation = model.validate(live ? 'email' : method, account.value)
    if (validation) return fail(codeForm, validation, account)
    if (!/^\d{6}$/.test(code.value.trim())) return fail(codeForm, '请输入 6 位数字验证码。', code)
    verifying = true; setBusy()
    try {
      if (live) await auth.loginEmail(account.value.trim(), code.value.trim())
      else { const message = model.verify(method, account.value, code.value); if (message) throw new Error(message); auth.loginDemo() }
      if (dialog.open) dialog.close()
    } catch (failure) { if (dialog.isConnected) fail(codeForm, failure.message, code) }
    finally { verifying = false; setBusy() }
  }
  if (live) passwordForm.onsubmit = async event => {
    event.preventDefault()
    if (sending || verifying) return
    clearError(passwordForm)
    const email = passwordForm.elements.account
    const password = passwordForm.elements.password
    const validation = model.validate('email', email.value)
    if (validation) return fail(passwordForm, validation, email)
    if (password.value.length < 8 || password.value.length > 128) return fail(passwordForm, '请输入 8–128 位密码。', password)
    verifying = true; setBusy()
    try {
      await auth.loginPassword(email.value.trim(), password.value)
      if (dialog.open) dialog.close()
    } catch (failure) { if (dialog.isConnected) fail(passwordForm, failure.message, password) }
    finally { verifying = false; setBusy() }
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
  const unsubscribe = auth.subscribe(state => { if (state.isLoggedIn && dialog.open) dialog.close() })
  dialog.addEventListener('close', () => {
    clearInterval(timer); unsubscribe(); dialog.remove(); activeDialog = null
    document.body.style.overflow = previousOverflow
    if (opener?.isConnected) opener.focus()
    const callbacks = closeObservers
    closeObservers = []
    for (const callback of callbacks) callback(auth.getSnapshot().isLoggedIn)
  }, { once: true })
  tick()
  dialog.showModal()
  return () => { if (dialog.open) dialog.close() }
}

export function requestDemoLogin() {
  if (getAuthSession().getSnapshot().isLoggedIn) return Promise.resolve(true)
  return new Promise(resolve => openLoginDialog({ onClose: resolve }))
}
