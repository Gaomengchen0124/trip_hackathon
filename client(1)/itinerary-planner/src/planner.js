/**
 * 规划编排：本地核算预算 -> 请求 DeepSeek -> 本地校验 -> 不通过则带错误回传修复。
 *
 * 设计取舍：时间算术不交给模型，模型只负责「怎么排」，本地负责「排得对不对」。
 */

import { DeepSeekClient, DeepSeekError } from '../../deepseek-client/src/deepseek-client.js';
import {
  computeBudget,
  formatDuration,
  insufficientTimeMessage,
  normalizeRequest,
  PlanError,
} from './itinerary.js';
import {
  SYSTEM_PROMPT,
  buildJsonRepairPrompt,
  buildRepairPrompt,
  buildUserPrompt,
} from './prompt.js';
import { validatePlan } from './validate.js';

export class PlanValidationError extends Error {
  constructor(message, { errors = [], raw = null, attempts = 0 } = {}) {
    super(message);
    this.name = 'PlanValidationError';
    this.code = 'INVALID_PLAN';
    this.errors = errors;
    this.raw = raw;
    this.attempts = attempts;
  }
}

/**
 * @param {object} input { city, days, attractions: [{ name, durationMinutes }], ...可选配置 }
 * @param {object} options { client, maxRepairs = 1, now = () => new Date() }
 * @returns {Promise<{ plan: object, request: object, budget: object, attempts: number, usage: object|null }>}
 */
export async function planItinerary(input, { client, maxRepairs = 1, now = () => new Date() } = {}) {
  if (!client || typeof client.chatJson !== 'function') {
    throw new PlanError('INVALID_INPUT', 'planItinerary 需要传入实现了 chatJson() 的 client，例如 new DeepSeekClient({ apiKey })。');
  }
  if (!Number.isInteger(maxRepairs) || maxRepairs < 0) {
    throw new PlanError('INVALID_INPUT', 'maxRepairs 必须是 ≥ 0 的整数。');
  }

  const request = normalizeRequest(input);
  const budget = computeBudget(request);

  if (!budget.fits && !request.allowOverflow) {
    throw new PlanError('INSUFFICIENT_TIME', insufficientTimeMessage(request, budget), { budget, request });
  }

  // 只有「时间确实不够」时，allowOverflow 才允许放弃景点；预算放得下时仍然要求用完所有景点。
  const overflowAllowed = request.allowOverflow && !budget.fits;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(request, budget) },
  ];

  let lastErrors = [];
  let lastRaw = null;
  let usage = null;
  let attempts = 0;

  for (let attempt = 0; attempt <= maxRepairs; attempt += 1) {
    attempts = attempt + 1;

    let response;
    try {
      response = await client.chatJson({ messages });
    } catch (error) {
      const isJsonError = error instanceof DeepSeekError && error.code === 'INVALID_JSON';
      if (isJsonError && attempt < maxRepairs) {
        lastErrors = [error.message];
        lastRaw = error.detail?.preview ?? null;
        messages.push(
          { role: 'assistant', content: '(上一次回复不是合法 JSON)' },
          { role: 'user', content: buildJsonRepairPrompt(error.detail?.preview) },
        );
        continue;
      }
      throw error;
    }

    usage = response.usage ?? usage;
    lastRaw = response.value;
    const result = validatePlan(response.value, request, { overflowAllowed });

    if (result.ok) {
      return {
        plan: {
          ...result.plan,
          budget,
          meta: {
            generatedAt: now().toISOString(),
            model: response.model ?? null,
            attempts,
            repaired: attempt > 0,
            request: {
              city: request.city,
              days: request.days,
              dailyStart: request.dailyStart,
              dailyEnd: request.dailyEnd,
              transferMinutes: request.transferMinutes,
              pace: request.pace,
              mustUseAll: request.mustUseAll,
              startDate: request.startDate,
              attractions: request.attractions.map(({ name, durationMinutes }) => ({ name, durationMinutes })),
            },
          },
        },
        request,
        budget,
        attempts,
        usage,
      };
    }

    lastErrors = result.errors;
    if (attempt < maxRepairs) {
      messages.push(
        { role: 'assistant', content: JSON.stringify(response.value) },
        { role: 'user', content: buildRepairPrompt(result.errors, request) },
      );
    }
  }

  throw new PlanValidationError(
    `模型输出未通过本地校验（共尝试 ${attempts} 次）：${lastErrors.join(' ')}`,
    { errors: lastErrors, raw: lastRaw, attempts },
  );
}

/** 只做本地预算核算，不调用 DeepSeek。便于在花钱之前确认需求是否成立。 */
export function checkFeasibility(input) {
  const request = normalizeRequest(input);
  const budget = computeBudget(request);
  // 景点数超过精确搜索上限时只是下界估算，结论需要提示可能偏乐观
  const caveat = budget.exact ? '' : '（景点数超过 14，最少天数为下界估算，实际可能需要更多天）';
  return {
    request,
    budget,
    ok: budget.fits,
    message: budget.fits
      ? `${request.city}：${request.days} 天，${budget.attractionCount} 个景点，${formatDuration(budget.requiredMinutes)} 需求 / ${formatDuration(budget.capacityMinutes)} 可用，可以排得下。${caveat}`
      : `${insufficientTimeMessage(request, budget)}${caveat}`,
  };
}

export { DeepSeekClient };
