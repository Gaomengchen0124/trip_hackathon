/** 把校验通过的 plan 渲染成可读的 Markdown。 */

import { describeBudget, formatDuration, parseDateOnly } from './itinerary.js';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function escapeCell(text) {
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

/** startDate 为 YYYY-MM-DD 时，返回第 index 天的 { date, weekday }；非法日期返回 null。 */
export function dayLabel(startDate, index) {
  const parsed = parseDateOnly(startDate);
  if (!parsed) return null;
  const date = new Date(Date.UTC(2000, parsed.month - 1, parsed.day));
  date.setUTCFullYear(parsed.year);
  date.setUTCDate(date.getUTCDate() + index);
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return { date: `${year}-${month}-${day}`, weekday: `周${WEEKDAYS[date.getUTCDay()]}` };
}

export function renderMarkdown(plan) {
  const lines = [];
  lines.push(`# ${plan.city} ${plan.days.length} 天行程`);
  if (plan.summary) lines.push('', `> ${plan.summary}`);
  if (plan.budget) lines.push('', `时间预算：${describeBudget({ days: plan.days.length, city: plan.city }, plan.budget)}`);

  plan.days.forEach((day, index) => {
    const label = dayLabel(plan.startDate, index);
    const datePart = label ? `（${label.date} ${label.weekday}）` : '';
    const themePart = day.theme ? ` · ${day.theme}` : '';
    lines.push('', `## 第 ${day.day} 天${datePart}${themePart}`, '');

    if (day.stops.length === 0) {
      lines.push('_当天未安排景点。_');
      return;
    }
    lines.push('| 时间 | 安排 | 时长 | 备注 |', '| --- | --- | --- | --- |');
    day.stops.forEach((stop) => {
      lines.push(
        `| ${stop.start}–${stop.end} | ${escapeCell(stop.name)} | ${formatDuration(stop.durationMinutes)} | ${escapeCell(stop.note)} |`,
      );
    });
    lines.push('', `当天占用 ${formatDuration(day.totalMinutes)}，可用 ${formatDuration(day.windowMinutes)}。`);
  });

  if (plan.unscheduled?.length) {
    lines.push('', '## 未安排', '');
    plan.unscheduled.forEach((name) => lines.push(`- ${name}`));
  }
  if (plan.tips?.length) {
    lines.push('', '## 提示', '');
    plan.tips.forEach((tip) => lines.push(`- ${tip}`));
  }
  return `${lines.join('\n')}\n`;
}
