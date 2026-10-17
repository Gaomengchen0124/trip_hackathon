/**
 * DeepSeek API 传输层（OpenAI 兼容的 /chat/completions）。
 * 只依赖内置 fetch，无第三方 SDK；支持超时、可重试状态码退避、JSON 输出模式。
 */

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const REASONER_PATTERN = /^deepseek-reasoner/;
const MAX_RETRY_AFTER_MS = 30_000;
const MAX_DETAIL_LENGTH = 300;

export class DeepSeekError extends Error {
  constructor(message, { code = 'DEEPSEEK_ERROR', status, retryable = false, detail } = {}) {
    super(message);
    this.name = 'DeepSeekError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.detail = detail;
  }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** baseUrl 可以是 https://api.deepseek.com 或 https://api.deepseek.com/v1。 */
export function resolveEndpoint(baseUrl) {
  const trimmed = String(baseUrl ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) throw new DeepSeekError('baseUrl 不能为空。', { code: 'INVALID_BASE_URL' });
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`;
}

/**
 * 从模型文本中解析 JSON。
 * 兼容三种常见返回：纯 JSON、```json 代码块、JSON 前后夹带解释文字。
 */
export function parseJsonContent(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new DeepSeekError('模型返回内容为空。', { code: 'EMPTY_RESPONSE' });
  }
  let candidate = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(candidate);
  if (fenced) candidate = fenced[1].trim();

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        /* 落到下面的统一报错 */
      }
    }
  }
  throw new DeepSeekError('模型返回内容不是合法 JSON。', { code: 'INVALID_JSON', detail: { preview: candidate.slice(0, MAX_DETAIL_LENGTH) } });
}

/**
 * 抹掉上游文本里可能被回显的凭据。
 * 我们的代码只在 Authorization 头里放 Key，但代理/网关可能把请求头回显到错误信息里。
 */
export function redactSecrets(text, apiKey = '') {
  let result = String(text ?? '');
  if (apiKey) result = result.split(apiKey).join('[redacted]');
  return result
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{6,}/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9._-]{6,}/gi, '[redacted]');
}

/** Retry-After 既可能是秒数，也可能是 HTTP-date。 */
function parseRetryAfter(value) {
  if (!value) return undefined;
  const text = String(value).trim();
  const seconds = Number(text);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  const date = Date.parse(text);
  if (Number.isFinite(date)) {
    const delta = date - Date.now();
    if (delta > 0) return Math.min(delta, MAX_RETRY_AFTER_MS);
  }
  return undefined;
}

async function readErrorDetail(response, apiKey) {
  const retryAfterMs = parseRetryAfter(response.headers?.get?.('retry-after'));

  let message = '';
  try {
    const raw = await response.text();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.error?.message === 'string') message = parsed.error.message;
      } catch {
        /* 非 JSON 错误体不直接回显，避免把上游内容写进日志 */
      }
    }
  } catch {
    /* 读取失败时退化为无细节 */
  }
  return { message: redactSecrets(message, apiKey).slice(0, MAX_DETAIL_LENGTH), retryAfterMs };
}

export class DeepSeekClient {
  #apiKey;
  #endpoint;
  #model;
  #timeoutMs;
  #maxAttempts;
  #temperature;
  #retryBaseMs;
  #fetchImpl;
  #sleep;

  constructor({
    apiKey,
    baseUrl = DEFAULT_BASE_URL,
    endpoint,
    model = DEFAULT_MODEL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    temperature = 0.3,
    retryBaseMs = 500,
    fetchImpl = globalThis.fetch,
    sleep = defaultSleep,
  } = {}) {
    const key = typeof apiKey === 'string' ? apiKey.trim() : '';
    if (!key) {
      throw new DeepSeekError('缺少 DeepSeek API Key：请设置环境变量 DEEPSEEK_API_KEY，或显式传入 apiKey。', {
        code: 'MISSING_API_KEY',
      });
    }
    if (typeof fetchImpl !== 'function') {
      throw new DeepSeekError('当前运行环境不提供 fetch，请使用 Node.js 22+ 或传入 fetchImpl。', { code: 'NO_FETCH' });
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new DeepSeekError('timeoutMs 必须是正数。', { code: 'INVALID_OPTION' });
    }
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new DeepSeekError('maxAttempts 必须是 ≥ 1 的整数。', { code: 'INVALID_OPTION' });
    }

    this.#apiKey = key;
    this.#endpoint = endpoint ?? resolveEndpoint(baseUrl);
    this.#model = model;
    this.#timeoutMs = timeoutMs;
    this.#maxAttempts = maxAttempts;
    this.#temperature = temperature;
    this.#retryBaseMs = retryBaseMs;
    this.#fetchImpl = fetchImpl;
    this.#sleep = sleep;
  }

  get endpoint() {
    return this.#endpoint;
  }

  get model() {
    return this.#model;
  }

  /**
   * 调用 /chat/completions，返回 { content, model, usage, finishReason }。
   *
   * jsonMode 默认关闭：普通对话不需要（也不应该）带 response_format: json_object，
   * 否则 DeepSeek 会因为提示词里没有 "json" 字样直接返回 HTTP 400。
   * 需要结构化输出时用 chatJson()，或显式传 jsonMode: true（此时请确保提示词里出现 "json"）。
   * deepseek-reasoner 不接受 response_format / temperature，传它时会自动省略。
   */
  async chat({ messages, model = this.#model, temperature, maxTokens, jsonMode = false } = {}) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new DeepSeekError('messages 不能为空数组。', { code: 'INVALID_MESSAGES' });
    }

    const isReasoner = REASONER_PATTERN.test(model);
    const body = { model, messages, stream: false };
    if (!isReasoner) {
      const effectiveTemperature = temperature ?? this.#temperature;
      if (Number.isFinite(effectiveTemperature)) body.temperature = effectiveTemperature;
    }
    if (Number.isFinite(maxTokens) && maxTokens > 0) body.max_tokens = maxTokens;
    if (jsonMode && !isReasoner) body.response_format = { type: 'json_object' };

    let lastError;
    for (let attempt = 1; attempt <= this.#maxAttempts; attempt += 1) {
      let response;
      try {
        response = await this.#fetchImpl(this.#endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.#apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.#timeoutMs),
        });
      } catch (error) {
        lastError = new DeepSeekError(
          error?.name === 'TimeoutError'
            ? `调用 DeepSeek 超时（> ${this.#timeoutMs} ms）。`
            : '调用 DeepSeek 失败：网络连接异常。',
          { code: 'NETWORK_ERROR', retryable: true },
        );
        if (attempt < this.#maxAttempts) {
          await this.#sleep(this.#backoff(attempt));
          continue;
        }
        throw lastError;
      }

      if (!response.ok) {
        const detail = await readErrorDetail(response, this.#apiKey);
        lastError = new DeepSeekError(
          `DeepSeek 返回 HTTP ${response.status}${detail.message ? `：${detail.message}` : ''}`,
          { code: 'HTTP_ERROR', status: response.status, retryable: RETRYABLE_STATUS.has(response.status), detail },
        );
        if (lastError.retryable && attempt < this.#maxAttempts) {
          await this.#sleep(this.#backoff(attempt, detail.retryAfterMs));
          continue;
        }
        throw lastError;
      }

      let payload;
      try {
        payload = await response.json();
      } catch (error) {
        // 200 之后读 body 时超时/中断：这是可重试的超时，不是「响应不是 JSON」
        if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
          lastError = new DeepSeekError(`读取 DeepSeek 响应超时（> ${this.#timeoutMs} ms）。`, {
            code: 'NETWORK_ERROR',
            retryable: true,
          });
          if (attempt < this.#maxAttempts) {
            await this.#sleep(this.#backoff(attempt));
            continue;
          }
          throw lastError;
        }
        throw new DeepSeekError('DeepSeek 响应不是合法 JSON。', { code: 'INVALID_RESPONSE', status: response.status });
      }

      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim() === '') {
        throw new DeepSeekError('DeepSeek 响应中没有文本内容。', {
          code: 'EMPTY_RESPONSE',
          detail: { finishReason: payload?.choices?.[0]?.finish_reason ?? null },
        });
      }

      return {
        content,
        model: payload?.model ?? model,
        usage: payload?.usage ?? null,
        finishReason: payload?.choices?.[0]?.finish_reason ?? null,
      };
    }

    throw lastError;
  }

  /**
   * 调用并解析 JSON，返回 { value, content, model, usage, finishReason }。
   * 会自动开启 jsonMode（deepseek-reasoner 除外），调用方需保证提示词里出现 "json" 字样。
   */
  async chatJson({ messages, jsonMode = true, ...options } = {}) {
    const result = await this.chat({ messages, jsonMode, ...options });
    return { value: parseJsonContent(result.content), ...result };
  }

  #backoff(attempt, retryAfterMs) {
    if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) return retryAfterMs;
    const base = this.#retryBaseMs * 2 ** (attempt - 1);
    return Math.round(base * (0.8 + Math.random() * 0.4));
  }
}
