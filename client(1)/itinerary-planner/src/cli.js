#!/usr/bin/env node
/**
 * 命令行入口：读 JSON 需求 -> 本地核算 -> 调 DeepSeek -> 本地校验 -> 输出 Markdown / JSON。
 *
 * main() 是纯函数式入口（stdout/stderr/env 都可注入），便于测试时不起子进程。
 */

import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { DeepSeekClient, DeepSeekError } from '../../deepseek-client/src/deepseek-client.js';
import { PlanError } from './itinerary.js';
import { PlanValidationError, checkFeasibility, planItinerary } from './planner.js';
import { renderMarkdown } from './render.js';

export const EXIT = {
  OK: 0,
  UNEXPECTED: 1,
  INVALID_INPUT: 2,
  API_ERROR: 3,
  PLAN_INVALID: 4,
  USAGE: 64,
};

export const USAGE = `用法: node src/cli.js <input.json | -> [选项]

输入 JSON（- 表示从 stdin 读取）：
  {
    "city": "上海",
    "days": 2,
    "attractions": [
      { "name": "外滩", "durationMinutes": 90 },
      { "name": "豫园", "durationMinutes": 120 }
    ],
    "dailyStart": "09:30",        // 可选，默认 09:00
    "dailyEnd": "20:00",          // 可选，默认 18:00
    "transferMinutes": 40,        // 可选，同天相邻景点间最少转场分钟数，默认 30
    "pace": "normal",             // 可选 relaxed | normal | packed
    "mustUseAll": true,           // 可选，是否必须用完所有景点，默认 true
    "allowOverflow": false,       // 可选，时间不够时是否仍要排（放不下的进 unscheduled）
    "startDate": "2026-11-01",    // 可选，仅用于展示日期
    "extraRequirements": "第 2 天晚上留 1 小时看夜景"
  }

选项：
  --check              只做本地时间预算核算，不调用 DeepSeek（不需要 API Key）
  --json               输出 plan JSON（默认输出 Markdown）
  --out <file>         同时把 plan JSON 写入文件
  --model <name>       覆盖 DEEPSEEK_MODEL
  --base-url <url>     覆盖 DEEPSEEK_BASE_URL
  --timeout-ms <n>     覆盖 DEEPSEEK_TIMEOUT_MS
  --max-repairs <n>    校验失败后的修复次数，默认 1
  -h, --help           显示本帮助

环境变量：DEEPSEEK_API_KEY（必填）、DEEPSEEK_BASE_URL、DEEPSEEK_MODEL、DEEPSEEK_TIMEOUT_MS

退出码：0 成功 / 1 未知错误 / 2 入参或时间预算不成立 / 3 API 或鉴权错误 / 4 模型输出校验不通过 / 64 用法错误（没给输入文件）`;

const MAX_REPAIRS_LIMIT = 5;

function parseArgs(argv) {
  const options = { input: null, check: false, json: false, out: null, maxRepairs: 1, help: false };
  const overrides = {};

  let index = 0;
  const takeValue = (flag) => {
    const value = argv[index + 1];
    if (value === undefined) {
      throw new PlanError('INVALID_INPUT', `${flag} 需要一个值（用 --help 查看用法）。`);
    }
    if (value !== '-' && value.startsWith('-')) {
      throw new PlanError('INVALID_INPUT', `${flag} 的值不能是另一个选项：${value}。若确实是该值，请用 ${flag}=${value} 的写法。`);
    }
    index += 1;
    return value;
  };

  for (; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--') && arg.includes('=')) {
      // 支持 --flag=value，避免值本身以 - 开头时被误判为选项
      const split = arg.indexOf('=');
      const flag = arg.slice(0, split);
      const value = arg.slice(split + 1);
      switch (flag) {
        case '--out': options.out = value; continue;
        case '--model': overrides.model = value; continue;
        case '--base-url': overrides.baseUrl = value; continue;
        case '--timeout-ms': overrides.timeoutMs = Number(value); continue;
        case '--max-repairs': options.maxRepairs = Number(value); continue;
        default: throw new PlanError('INVALID_INPUT', `未知选项：${flag}（用 --help 查看用法）`);
      }
    }
    switch (arg) {
      case '--check': options.check = true; break;
      case '--json': options.json = true; break;
      case '--help': case '-h': options.help = true; break;
      case '--out': options.out = takeValue('--out'); break;
      case '--model': overrides.model = takeValue('--model'); break;
      case '--base-url': overrides.baseUrl = takeValue('--base-url'); break;
      case '--timeout-ms': overrides.timeoutMs = Number(takeValue('--timeout-ms')); break;
      case '--max-repairs': options.maxRepairs = Number(takeValue('--max-repairs')); break;
      default:
        if (arg.startsWith('-') && arg !== '-') {
          throw new PlanError('INVALID_INPUT', `未知选项：${arg}（用 --help 查看用法）`);
        }
        if (options.input !== null) {
          throw new PlanError('INVALID_INPUT', `只能指定一个输入文件，多余参数：${arg}`);
        }
        options.input = arg;
    }
  }

  if (!Number.isInteger(options.maxRepairs) || options.maxRepairs < 0) {
    throw new PlanError('INVALID_INPUT', '--max-repairs 必须是 ≥ 0 的整数。');
  }
  if (options.maxRepairs > MAX_REPAIRS_LIMIT) {
    throw new PlanError('INVALID_INPUT', `--max-repairs 最大 ${MAX_REPAIRS_LIMIT}，避免无限消耗 API 调用。`);
  }
  if (overrides.timeoutMs !== undefined && (!Number.isFinite(overrides.timeoutMs) || overrides.timeoutMs <= 0)) {
    throw new PlanError('INVALID_INPUT', '--timeout-ms 必须是正数。');
  }
  if (options.out !== null && options.out.trim() === '') {
    throw new PlanError('INVALID_INPUT', '--out 不能为空。');
  }
  return { options, overrides };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function loadInput(source) {
  const raw = source === '-' || source === null
    ? await readStdin()
    : await readFile(source, 'utf8').catch((error) => {
      throw new PlanError('INVALID_INPUT', `无法读取输入文件 ${source}：${error.message}`);
    });

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new PlanError('INVALID_INPUT', `输入不是合法 JSON：${error.message}`);
  }
}

function exitCodeFor(error) {
  if (error instanceof PlanValidationError) return EXIT.PLAN_INVALID;
  if (error instanceof DeepSeekError) return EXIT.API_ERROR;
  if (error instanceof PlanError) {
    return error.code === 'INSUFFICIENT_TIME' || error.code === 'INVALID_INPUT'
      ? EXIT.INVALID_INPUT
      : EXIT.UNEXPECTED;
  }
  return EXIT.UNEXPECTED;
}

export async function main(argv = [], { stdout = process.stdout, stderr = process.stderr, env = process.env } = {}) {
  const write = (stream, text) => stream.write(text.endsWith('\n') ? text : `${text}\n`);

  try {
    const { options, overrides } = parseArgs(argv);

    if (options.help) {
      write(stdout, USAGE);
      return EXIT.OK;
    }
    if (options.input === null) {
      write(stderr, USAGE);
      return EXIT.USAGE;
    }

    const input = await loadInput(options.input);
    const feasibility = checkFeasibility(input);

    if (options.check) {
      write(stdout, feasibility.message);
      return feasibility.ok ? EXIT.OK : EXIT.INVALID_INPUT;
    }

    const client = new DeepSeekClient({
      apiKey: env.DEEPSEEK_API_KEY,
      baseUrl: overrides.baseUrl ?? env.DEEPSEEK_BASE_URL,
      model: overrides.model ?? env.DEEPSEEK_MODEL,
      timeoutMs: overrides.timeoutMs ?? (env.DEEPSEEK_TIMEOUT_MS ? Number(env.DEEPSEEK_TIMEOUT_MS) : undefined),
    });

    const { plan, usage } = await planItinerary(input, { client, maxRepairs: options.maxRepairs });

    if (options.out) {
      await writeFile(options.out, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
      write(stderr, `已写入 ${options.out}`);
    }
    if (options.json) {
      write(stdout, JSON.stringify(plan, null, 2));
    } else {
      write(stdout, renderMarkdown(plan));
    }
    if (usage?.total_tokens) write(stderr, `token 用量：${usage.total_tokens}`);

    return EXIT.OK;
  } catch (error) {
    if (error instanceof PlanValidationError) {
      write(stderr, `行程未通过本地校验（退出码 ${EXIT.PLAN_INVALID}）：`);
      error.errors.forEach((item) => write(stderr, `  - ${item}`));
      return EXIT.PLAN_INVALID;
    }
    write(stderr, `错误：${error.message}`);
    return exitCodeFor(error);
  }
}

const isDirectRun = (() => {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  process.exitCode = await main(process.argv.slice(2));
}
