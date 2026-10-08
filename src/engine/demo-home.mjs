// 首页数据层演示。用法：node src/demo-home.mjs
// 只读 data/lines/*.json，不碰网络。前端做 S1 / S2 时逻辑完全一样，把 readFile 换成 fetch 即可。
import { readFileSync } from 'node:fs';
import {
  buildHomepage,
  searchLines,
  lineReadiness,
  toPlanInput,
  EMPTY_SEARCH_HINT,
} from './catalog.mjs';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const BAR = '━'.repeat(60);

const index = read('data/lines/index.json');
const docs = Object.fromEntries(index.lines.map((l) => [l.lineId, read(l.file)]));

let failed = 0;
const check = (label, cond, extra = '') => {
  console.log(`  ${cond ? '✅' : '❌'} ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) failed++;
};

// ===============================================================
console.log('\n' + BAR);
console.log(' 首页 S1 —— 数据层演示');
console.log(BAR);

const home = buildHomepage(index, docs);
console.log(`\n主推线路：${home.primary}   （首页默认落在这里）\n`);

for (const sec of home.sections) {
  console.log(`【${sec.label}】共 ${sec.total} 张`);
  for (const c of sec.cards) {
    const tag = c.ready ? '' : '  ⏳ 筹备中';
    console.log(`   ┌─ ${c.title}${tag}`);
    console.log(`   │  封面：${c.cover}`);
    console.log(`   │  命中：${c.matched.join('、') || '—'}`);
    if (c.note) console.log(`   └─ ${c.note}`);
    else console.log(`   └─ 可点进定制页`);
  }
  if (sec.omitted) console.log(`   ⋯ 还有 ${sec.omitted} 张（点省略号 → S2 栏目全部列表页）`);
  console.log('');
}

// ===============================================================
console.log(BAR);
console.log(' 搜索框');
console.log(BAR + '\n');

for (const q of ['繁花', '黄河路', '汪小姐', '龙族', '东京', '北京', '东方明珠', '原神']) {
  const hits = searchLines(q, index, docs);
  if (!hits.length) {
    console.log(`"${q}" → ${EMPTY_SEARCH_HINT}`);
  } else {
    console.log(`"${q}" → ${hits.map((h) => h.title).join('、')}   [${hits[0].reasons.join(' / ')}]`);
  }
}

// ===============================================================
console.log('\n' + BAR);
console.log(' 各线路数据就绪度');
console.log(BAR + '\n');

for (const l of index.lines) {
  const r = lineReadiness(docs[l.lineId]);
  const flag = r.ready ? '✅ 可演示' : '⏳ 待填内容';
  console.log(`  ${l.title}  ${flag}`);
  console.log(`     IP 点位 ${r.ipDone}/${r.ipTotal} · 城市景点 ${r.spDone}/${r.spTotal}`);
}

// ===============================================================
console.log('\n' + BAR);
console.log(' 自检');
console.log(BAR + '\n');

check('主推是繁花·上海', home.primary === 'fanhua-shanghai');
check('首页三栏都有卡片', home.sections.every((s) => s.cards.length > 0));
check('每栏最多显示 3 张', home.sections.every((s) => s.cards.length <= 3));
check('「繁花」搜得到', searchLines('繁花', index, docs)[0]?.lineId === 'fanhua-shanghai');
check('「黄河路」搜得到', searchLines('黄河路', index, docs)[0]?.lineId === 'fanhua-shanghai');
check('「龙族」保留在库里', searchLines('龙族', index, docs).length === 2);
check('搜不到时给固定文案', searchLines('原神', index, docs).length === 0);
check('未填完的线路标为不可演示', lineReadiness(docs['fanhua-shanghai']).ready === false);

// 引擎接口：勾选 → plan() 的输入
const input = toPlanInput(docs['fanhua-shanghai'], {
  ipIds: ['sh-ip-01', 'sh-ip-02'],
  spIds: ['sh-sp-01'],
});
check(
  'toPlanInput 能拼出引擎输入',
  input.pois.length === 3 && input.allPois.length === 23,
  `选中 ${input.pois.length} 个 / 池子 ${input.allPois.length} 个`
);

console.log('\n' + BAR);
console.log(failed ? ` ❌ ${failed} 项没过` : ' ✅ 全部通过');
console.log(BAR + '\n');
process.exit(failed ? 1 : 0);
