import { randomInt, createHmac, randomBytes } from 'node:crypto'
export function createEmailLogin({ store, sendEmail, secret = randomBytes(32).toString('hex') }) {
  const key = secret || randomBytes(32).toString('hex')
  const digest = (email, code) => createHmac('sha256', key).update(`${email}\0${code}`).digest('hex')
  const normalize = email => {
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw Object.assign(new Error('请输入正确的邮箱地址。'), { status: 400 })
    return email.trim().toLowerCase()
  }
  return {
    configured: !!sendEmail,
    async send(value, ip) {
      const email = normalize(value)
      if (!sendEmail) throw Object.assign(new Error('邮箱服务尚未配置，请联系管理员。'), { status: 503 })
      if (!store.rateLimit(`send-ip:${ip}`, 20, 3600000) || !store.rateLimit(`send-mail:${email}`, 6, 3600000)) throw Object.assign(new Error('发送过于频繁，请稍后重试。'), { status: 429 })
      const code = String(randomInt(0, 1000000)).padStart(6, '0')
      const codeDigest = digest(email, code)
      if (!store.reserveCode(email, codeDigest)) throw Object.assign(new Error('请在 60 秒后重新获取。'), { status: 429 })
      try { await sendEmail(email, code) }
      catch (error) { store.discardCode(email, codeDigest); throw Object.assign(new Error(error.deliveryMessage || '邮件发送失败，请稍后重试。'), { status: 502 }) }
    },
    verify(value, code, ip) {
      const email = normalize(value)
      if (!store.rateLimit(`verify:${ip}`, 30, 60000)) throw Object.assign(new Error('尝试过于频繁，请稍后重试。'), { status: 429 })
      if (typeof code !== 'string' || !/^\d{6}$/.test(code) || !store.consumeCode(email, digest(email, code))) throw Object.assign(new Error('验证码错误或已过期，请重新获取。'), { status: 400 })
      const user = store.verifiedIdentity('email', email)
      return { user, ...store.issueSession(user.id) }
    },
  }
}
export function configuredEmailSender(env = process.env, transport = fetch) {
  const apiKey = env.RESEND_API_KEY?.trim()
  const from = env.AUTH_EMAIL_FROM?.trim()
  if (!apiKey || !from) return undefined
  return async (email, code) => {
    let response
    try { response = await transport('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email], subject: '巡礼登录验证码', text: `您的登录验证码是 ${code}，5 分钟内有效。如非本人操作，请忽略。` }),
    })
    } catch { throw Object.assign(new Error('Email network failure'), { deliveryMessage: '暂时无法连接邮件服务，请稍后重新获取验证码。' }) }
    // Never include provider response bodies, credentials or verification codes in errors.
    if (!response.ok) {
      let code = ''
      try { code = (await response.json()).name } catch {}
      const messages = {
        monthly_quota_exceeded: '邮件服务本月发送额度已用完，请联系管理员。',
        daily_quota_exceeded: '邮件服务今日发送额度已用完，请稍后再试。',
        rate_limit_exceeded: '邮件服务请求过于频繁，请稍后重新获取。',
        invalid_api_key: '邮件服务配置失效，请联系管理员。',
        validation_error: '邮件服务拒绝发送，请联系管理员检查发件域名和收件地址。',
      }
      throw Object.assign(new Error(`Email delivery rejected (${response.status})`), { deliveryMessage: messages[code] })
    }
    const receipt = await response.json()
    if (typeof receipt.id !== 'string' || !receipt.id) throw new Error('Email delivery receipt missing')
  }
}
