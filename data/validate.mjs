#!/usr/bin/env node
// 点位库校验器（人 A · 子步骤 1-3）
//   node data/validate.mjs --rules                        查看规则表
//   node data/validate.mjs data/lines/longzu-beijing.json 校验单个
//   node data/validate.mjs --all                          校验全部
// 规则实现在 data/line-rules.mjs（纯函数），服务端校验（server/content-validate.mjs）复用同一份。
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { RULES, validateLineDoc } from './line-rules.mjs';

const C = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yel: (s) => `\x1b[33m${s}\x1b[0m`,
  grn: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};

if (process.argv.includes('--rules')) {
  console.log(C.b('\n校验规则表\n'));
  for (const [id, level, desc] of RULES) {
    const tag = level === 'error' ? C.red('错误') : C.yel('警告');
    console.log(`  ${id}  ${tag}  ${desc}`);
  }
  const ne = RULES.filter((r) => r[1] === 'error').length;
  console.log(C.dim(`\n  共 ${RULES.length} 条：${ne} 条错误、${RULES.length - ne} 条警告\n`));
  process.exit(0);
}

// 数据里写 img/x.jpg，文件实际在 public/img/x.jpg
const imgExists = (f) =>
  [f, `public/${f}`, `public/img/${f.split('/').pop()}`].some((c) => c && existsSync(c));

function validate(file) {
  let data;
  if (!existsSync(file)) {
    console.log(`\n${C.red('❌ 错误（1）')}\n  ${C.dim('S01')}  文件不存在\n`);
    return 1;
  }
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.log(`\n${C.red('❌ 错误（1）')}\n  ${C.dim('S01')}  JSON 解析失败：${e.message}\n`);
    return 1;
  }
  const issues = validateLineDoc(data, imgExists);
  return report(file, data, issues);
}

// ===============================================================
function report(file, data, issues) {
  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');
  const nIp = (data.ipStops || []).length;
  const nCity = (data.cityStops || []).length;

  console.log('\n' + C.b('━'.repeat(60)));
  console.log(C.b(` ${data.line?.title ?? file}`) + C.dim(`   ${file}`));
  console.log(C.dim(` IP 点位 ${nIp} 个 · 城市景点 ${nCity} 个 · 片区 ${(data.clusters || []).length} 个`));
  console.log(C.b('━'.repeat(60)));

  const show = (arr, color, label) => {
    if (!arr.length) return;
    console.log('\n' + color(`${label}（${arr.length}）`));
    const grouped = {};
    for (const i of arr) (grouped[i.ruleId] ||= []).push(i);
    for (const [rid, list] of Object.entries(grouped)) {
      console.log(`  ${C.dim(rid)}  ${list[0].msg.split('：')[0]}`);
      for (const i of list.slice(0, 5)) {
        console.log(`      ${C.dim('·')} ${i.where ? C.dim(`[${i.where}] `) : ''}${i.msg}`);
      }
      if (list.length > 5) console.log(`      ${C.dim(`… 另有 ${list.length - 5} 条同类`)}`);
    }
  };

  show(errors, C.red, '❌ 错误 — 必须修');
  show(warns, C.yel, '⚠️  警告 — 建议改');

  if (!errors.length && !warns.length) console.log(C.grn('\n✅ 全部通过\n'));
  else console.log(`\n${C.b('结论：')}${errors.length ? C.red(errors.length + ' 个错误') : C.grn('0 错误')} · ${warns.length ? C.yel(warns.length + ' 个警告') : '0 警告'}\n`);

  return errors.length;
}

// ===============================================================
const argv = process.argv.slice(2).filter((a) => !a.startsWith('--'));
let files = argv;
if (process.argv.includes('--all') || !files.length) {
  files = existsSync('data/lines')
    ? readdirSync('data/lines')
        .filter((f) => f.endsWith('.json') && f !== 'index.json')
        .map((f) => `data/lines/${f}`)
    : [];
}

let totalErrors = 0;
for (const f of files) totalErrors += validate(f) || 0;

if (files.length > 1) {
  console.log(C.b('━'.repeat(60)));
  console.log(totalErrors ? C.red(` 合计 ${totalErrors} 个错误`) : C.grn(' 合计 0 个错误'));
  console.log(C.b('━'.repeat(60)) + '\n');
}
process.exit(totalErrors ? 1 : 0);
