/**
 * 模型输出的本地校验器：所有时间算术在本地重算，模型自报的数字不作为依据。
 * 校验通过才返回结构化的 plan；否则返回人类可读、可直接回传给模型的错误列表。
 */

import { formatClock, formatDuration, normalizeName, parseClock } from './itinerary.js';

const KINDS = new Set(['visit', 'transfer', 'meal', 'break']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function tryParseClock(value) {
  try {
    return parseClock(value);
  } catch {
    return null;
  }
}

function isValidDuration(value) {
  return Number.isFinite(value) && value >= 1;
}

/** 错误列表上限：避免把上万条错误塞进修复提示（会直接撑爆上下文）。 */
const MAX_REPORTED_ERRORS = 30;

function capErrors(errors) {
  if (errors.length <= MAX_REPORTED_ERRORS) return errors;
  const hidden = errors.length - MAX_REPORTED_ERRORS;
  return [...errors.slice(0, MAX_REPORTED_ERRORS), `（另有 ${hidden} 条错误未列出，请按同类问题整体修正。）`];
}

/**
 * @param {unknown} candidate 模型返回的对象
 * @param {object} request normalizeRequest() 的结果
 * @param {object} [options]
 * @param {boolean} [options.overflowAllowed] 时间确实不够时，是否允许放弃部分景点
 * @returns {{ ok: true, plan: object } | { ok: false, errors: string[] }}
 */
export function validatePlan(candidate, request, { overflowAllowed = false } = {}) {
  if (!isPlainObject(candidate)) {
    return { ok: false, errors: ['模型返回的不是 JSON 对象。'] };
  }

  const errors = [];
  const usage = new Map(); // 规范化景点名 -> 首次出现的路径
  const mustUseAll = request.requiresAllAttractions && !overflowAllowed;

  if (typeof candidate.city === 'string' && candidate.city.trim()
    && normalizeName(candidate.city) !== normalizeName(request.city)) {
    errors.push(`返回的城市是「${candidate.city.trim()}」，与要求的「${request.city}」不一致。`);
  }

  const rawDays = candidate.days;
  if (!Array.isArray(rawDays)) {
    errors.push('缺少 days 数组。');
  } else if (rawDays.length !== request.days) {
    errors.push(`days 的长度为 ${rawDays.length}，要求恰好 ${request.days} 天。`);
  }

  const days = [];
  const dayList = Array.isArray(rawDays) ? rawDays : [];

  dayList.forEach((rawDay, dayIndex) => {
    const dayPath = `days[${dayIndex}]`;
    const rawStops = isPlainObject(rawDay) && Array.isArray(rawDay.stops) ? rawDay.stops : null;
    if (!rawStops) {
      errors.push(`${dayPath}.stops 必须是数组（当天没有安排时用空数组）。`);
    }

    const stops = [];
    (rawStops ?? []).forEach((rawStop, stopIndex) => {
      const path = `${dayPath}.stops[${stopIndex}]`;
      if (!isPlainObject(rawStop)) {
        errors.push(`${path} 必须是对象。`);
        return;
      }

      const kind = typeof rawStop.kind === 'string' ? rawStop.kind.trim() : '';
      if (!KINDS.has(kind)) {
        errors.push(`${path}.kind 必须是 visit / transfer / meal / break 之一，当前为 ${JSON.stringify(rawStop.kind)}。`);
      }

      const name = typeof rawStop.name === 'string' ? rawStop.name.trim() : '';
      if (!name) errors.push(`${path}.name 不能为空。`);

      let startMinute = tryParseClock(rawStop.start);
      let endMinute = tryParseClock(rawStop.end);
      if (startMinute === null) {
        errors.push(`${path}.start 必须是 "HH:MM" 格式，当前为 ${JSON.stringify(rawStop.start)}。`);
      }

      // 时长一律由本地重算：声明值合法就用声明值校验 end，声明值缺失/非法就退回 end − start。
      // 关键是不能「跳过」对景点时长的核对，否则模型只要不写 durationMinutes 就能偷偷缩短游玩时间。
      const declaredDuration = rawStop.durationMinutes;
      const hasDeclaredDuration = declaredDuration !== undefined && declaredDuration !== null;
      const numericDuration = Number(declaredDuration);
      const declaredDurationValid = isValidDuration(numericDuration);
      let durationMinutes = declaredDurationValid ? Math.round(numericDuration) : null;

      if (hasDeclaredDuration && !declaredDurationValid) {
        errors.push(`${path}.durationMinutes 必须是 ≥ 1 的分钟数，当前为 ${JSON.stringify(declaredDuration)}。`);
      }
      if (!hasDeclaredDuration && endMinute === null) {
        errors.push(`${path} 既没有可用的 durationMinutes，也没有可用的 end，无法判断时长。`);
      }

      if (startMinute !== null && durationMinutes !== null) {
        const expectedEnd = startMinute + durationMinutes;
        if (endMinute !== null && endMinute !== expectedEnd) {
          errors.push(
            `${path}：start ${formatClock(startMinute)} + durationMinutes ${durationMinutes} 应为 ${formatClock(expectedEnd)}，`
            + `但 end 是 ${formatClock(endMinute)}。`,
          );
        }
        endMinute = expectedEnd; // 一律以 start + 时长重算
      } else if (startMinute !== null && durationMinutes === null && endMinute !== null) {
        durationMinutes = endMinute - startMinute;
        if (durationMinutes < 1) {
          errors.push(`${path}：end 必须比 start 至少晚 1 分钟。`);
          durationMinutes = null;
        }
      }

      let canonicalName = name;
      if (kind === 'visit') {
        const attraction = request.byNormalizedName.get(normalizeName(name));
        if (!attraction) {
          errors.push(`${path}：景点「${name}」不在清单中，不允许新增景点。`);
        } else {
          canonicalName = attraction.name;
          // 用「本地重算出的实际时长」比对，而不是模型自报的数字
          if (durationMinutes !== null && durationMinutes !== attraction.durationMinutes) {
            errors.push(
              `${path}：景点「${attraction.name}」的游玩时长应为 ${attraction.durationMinutes} 分钟，`
              + `实际安排了 ${durationMinutes} 分钟。`,
            );
          }
          if (usage.has(attraction.name)) {
            errors.push(`${path}：景点「${attraction.name}」重复安排，已在 ${usage.get(attraction.name)} 出现。`);
          } else {
            usage.set(attraction.name, path);
          }
        }
      } else if (request.byNormalizedName.has(normalizeName(name))) {
        // 防止把清单里的景点伪装成 transfer / meal / break 来绕开时长与去重校验
        errors.push(`${path}：「${name}」是清单中的景点，必须使用 kind "visit"，不能用 "${kind}"。`);
      }

      if (startMinute === null || endMinute === null || durationMinutes === null) return;

      stops.push({
        kind,
        name: canonicalName,
        startMinute,
        endMinute,
        durationMinutes,
        note: typeof rawStop.note === 'string' ? rawStop.note.trim() : '',
      });
    });

    stops.sort((a, b) => a.startMinute - b.startMinute);

    for (let index = 0; index < stops.length; index += 1) {
      const stop = stops[index];
      if (stop.startMinute < request.dailyStartMinute || stop.endMinute > request.dailyEndMinute) {
        const overnight = stop.endMinute > 24 * 60 ? '（结束时间已跨到次日）' : '';
        errors.push(
          `${dayPath}：「${stop.name}」安排在 ${formatClock(stop.startMinute)}–${formatClock(stop.endMinute)}${overnight}，`
          + `超出当天可用时间 ${request.dailyStart}–${request.dailyEnd}。`,
        );
      }
      const previous = stops[index - 1];
      if (previous && previous.endMinute > stop.startMinute) {
        errors.push(
          `${dayPath}：「${previous.name}」与「${stop.name}」时间重叠`
          + `（${formatClock(previous.endMinute)} 与 ${formatClock(stop.startMinute)}）。`,
        );
      }
    }

    const visits = stops.filter((stop) => stop.kind === 'visit');
    for (let index = 1; index < visits.length; index += 1) {
      const gap = visits[index].startMinute - visits[index - 1].endMinute;
      if (gap < request.transferMinutes) {
        errors.push(
          `${dayPath}：「${visits[index - 1].name}」${formatClock(visits[index - 1].endMinute)} 结束后，`
          + `「${visits[index].name}」${formatClock(visits[index].startMinute)} 就开始，间隔 ${gap} 分钟，`
          + `少于要求的 ${request.transferMinutes} 分钟转场时间（应推迟到 ${formatClock(visits[index - 1].endMinute + request.transferMinutes)} 之后）。`,
        );
      }
    }

    const totalMinutes = stops.reduce((sum, stop) => sum + stop.durationMinutes, 0);
    if (totalMinutes > request.dailyWindowMinutes) {
      errors.push(
        `${dayPath}：当天占用 ${formatDuration(totalMinutes)}，超过可用 ${formatDuration(request.dailyWindowMinutes)}。`,
      );
    }

    days.push({
      day: dayIndex + 1,
      theme: isPlainObject(rawDay) && typeof rawDay.theme === 'string' ? rawDay.theme.trim() : '',
      stops: stops.map((stop) => ({
        kind: stop.kind,
        name: stop.name,
        start: formatClock(stop.startMinute),
        end: formatClock(stop.endMinute),
        durationMinutes: stop.durationMinutes,
        note: stop.note,
      })),
      totalMinutes,
      windowMinutes: request.dailyWindowMinutes,
    });
  });

  const scheduled = new Set(usage.keys());
  const missing = request.attractions.filter((item) => !scheduled.has(item.name));

  const unscheduled = [];
  if (Array.isArray(candidate.unscheduled)) {
    candidate.unscheduled.forEach((raw) => {
      if (typeof raw !== 'string' || !raw.trim()) return;
      const attraction = request.byNormalizedName.get(normalizeName(raw));
      if (!attraction) {
        errors.push(`unscheduled 中的「${raw.trim()}」不在景点清单中。`);
        return;
      }
      if (scheduled.has(attraction.name) || unscheduled.includes(attraction.name)) return;
      unscheduled.push(attraction.name);
    });
  }

  missing.forEach((attraction) => {
    if (mustUseAll) {
      errors.push(`景点「${attraction.name}」没有被安排；当前设置要求全部 ${request.attractions.length} 个景点都安排上。`);
    } else if (!unscheduled.includes(attraction.name)) {
      unscheduled.push(attraction.name);
    }
  });

  if (errors.length > 0) return { ok: false, errors: capErrors(errors) };

  return {
    ok: true,
    plan: {
      city: request.city,
      summary: typeof candidate.summary === 'string' ? candidate.summary.trim() : '',
      startDate: request.startDate,
      days,
      unscheduled,
      tips: Array.isArray(candidate.tips) ? candidate.tips.filter((tip) => typeof tip === 'string' && tip.trim()).map((tip) => tip.trim()) : [],
    },
  };
}
