export const DEMO_CODE = '123456'
export function createLoginForm({ now = Date.now } = {}) {
  let challenge = null
  let resendAt = 0
  function validate(method, account) {
    const value = account.trim()
    if (method === 'phone') return /^1[3-9]\d{9}$/.test(value) ? '' : '请输入正确的中国大陆 11 位手机号。'
    if (method === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254 ? '' : '请输入正确的邮箱地址。'
    return '请选择登录方式。'
  }
  return {
    validate,
    remaining: () => Math.max(0, Math.ceil((resendAt - now()) / 1000)),
    send(method, account) {
      const error = validate(method, account)
      if (error) return error
      if (now() < resendAt) return '请在倒计时结束后重新获取。'
      challenge = { method, account: account.trim(), expiresAt: now() + 300000 }
      resendAt = now() + 60000
      return ''
    },
    verify(method, account, code) {
      const error = validate(method, account)
      if (error) return error
      if (!challenge) return '请先获取演示验证码。'
      if (challenge.method !== method || challenge.account !== account.trim()) return '账号已变更，请为当前账号重新获取验证码。'
      if (now() >= challenge.expiresAt) return '验证码已过期，请重新获取。'
      if (!/^\d{6}$/.test(code.trim())) return '请输入 6 位数字验证码。'
      if (code.trim() !== DEMO_CODE) return '验证码不正确，请使用演示验证码 123456。'
      challenge = null
      return ''
    },
  }
}
