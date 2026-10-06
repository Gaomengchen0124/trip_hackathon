// 规划引擎自测 + 演示。用法：node src/demo.mjs
//
// ⚠️ 这里的点位是**假数据**，只用来验证算法，不是真实内容。
//    坐标是公开地标的真实经纬度，所以算出来的交通时间是可信的。
//    正式内容请看 data/lines/*.json（由人 A 逐条核对原著后填写）。
import { plan, buildDays, fmtHours, TIER_WEIGHT } from './planner.mjs';

// ---------------------------------------------------------------
// 假数据：北京 8 个片区
// ---------------------------------------------------------------
const ip = (poiId, name, lng, lat, cluster, tier, durationNormal) => ({
  poiId, name, type: 'ip', lineId: 'longzu-beijing', lng, lat, cluster, tier,
  durationNormal, durationRush: Math.round(durationNormal / 2),
});
const sp = (poiId, name, lng, lat, cluster, popularity, durationNormal) => ({
  poiId, name, type: 'classic', lineId: 'longzu-beijing', lng, lat, cluster, popularity,
  durationNormal, durationRush: Math.round(durationNormal / 2),
});

const POOL = [
  // IP 打卡点（假）
  ip('bj-ip-01', '中关村某处', 116.3166, 39.9836, '海淀·中关村', 'S', 90),
  ip('bj-ip-02', '五道口某处', 116.3379, 39.9927, '海淀·中关村', 'A', 60),
  ip('bj-ip-03', '后海某处', 116.3837, 39.9427, '西城·什刹海', 'S', 90),
  ip('bj-ip-04', '国贸某处', 116.4600, 39.9088, '朝阳·三里屯', 'A', 60),
  ip('bj-ip-05', '王府井某处', 116.4109, 39.9145, '东城·故宫', 'B', 45),
  ip('bj-ip-06', '慕田峪某处', 116.5700, 40.4319, '怀柔·长城', 'S', 120),
  ip('bj-ip-07', '环球影城某处', 116.6735, 39.8567, '通州·环球影城', 'B', 120),
  ip('bj-ip-08', '古北水镇某处', 117.2724, 40.6883, '密云·古北水镇', 'B', 150),
  // 城市景点（真实地标）
  sp('bj-sp-01', '故宫博物院', 116.3970, 39.9180, '东城·故宫', 5, 180),
  sp('bj-sp-02', '天安门广场', 116.3975, 39.9055, '东城·故宫', 5, 60),
  sp('bj-sp-03', '景山公园', 116.3967, 39.9247, '东城·故宫', 4, 60),
  sp('bj-sp-04', '什刹海·后海', 116.3864, 39.9403, '西城·什刹海', 4, 90),
  sp('bj-sp-05', '恭王府', 116.3832, 39.9372, '西城·什刹海', 4, 90),
  sp('bj-sp-06', '三里屯太古里', 116.4551, 39.9367, '朝阳·三里屯', 4, 90),
  sp('bj-sp-07', '798 艺术区', 116.4959, 39.9844, '朝阳·三里屯', 3, 120),
  sp('bj-sp-08', '颐和园', 116.2755, 39.9999, '海淀·中关村', 5, 180),
  sp('bj-sp-09', '圆明园', 116.2977, 40.0089, '海淀·中关村', 4, 120),
  sp('bj-sp-10', '卢沟桥', 116.2129, 39.8492, '丰台·城南', 3, 90),
  sp('bj-sp-11', '慕田峪长城', 116.5700, 40.4319, '怀柔·长城', 5, 240),
  sp('bj-sp-12', '红螺寺', 116.6191, 40.3747, '怀柔·长城', 3, 120),
  sp('bj-sp-13', '北京环球影城', 116.6735, 39.8567, '通州·环球影城', 5, 480),
  sp('bj-sp-14', '古北水镇', 117.2724, 40.6883, '密云·古北水镇', 4, 240),
  sp('bj-sp-15', '天坛公园', 116.4109, 39.8822, '东城·故宫', 5, 120),
];

const pick = (...ids) => POOL.filter((p) => ids.includes(p.poiId));
const BAR = '━'.repeat(60);

// ---------------------------------------------------------------
// 断言小工具
// ---------------------------------------------------------------
let failed = 0;
const check = (label, cond, extra = '') => {
  console.log(`  ${cond ? '✅' : '❌'} ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) failed++;
};

const showDays = (res) => {
  for (const d of res.days) {
    const head = `${d.date}  可用 ${fmtHours(d.available)}  用掉 ${fmtHours(d.used)}`;
    if (!d.stops.length) {
      console.log(`    ${head}  （空）`);
      continue;
    }
    console.log(`    ${head}`);
    for (const s of d.stops) {
      const tag = s.mode === 'rush' ? '压缩' : '正常';
      console.log(
        `       ${s.arrive}-${s.leave}  ${s.name}  [${s.cluster}]  ` +
          `停留 ${s.stayMinutes}分 · 路上 ${s.legMinutes}分 · ${tag}`
      );
    }
  }
};

console.log('\n' + BAR);
console.log(' 引擎自测 —— 假数据，只验算法');
console.log(BAR);

// ===============================================================
// 场景 1：2 天 8 小时，5 个点 → 应该装得下，且不需要压缩
// ===============================================================
console.log('\n【场景 1】2 天 × 8h，勾 5 个点 —— 期望：正常档装下');
const s1Selected = pick('bj-ip-01', 'bj-ip-03', 'bj-sp-01', 'bj-sp-04', 'bj-sp-15');
const s1 = plan({
  pois: s1Selected, allPois: POOL, dayHours: 8,
  startDate: '2026-11-01', startSlot: '上午',
  endDate: '2026-11-02', endSlot: '晚上',
});
showDays(s1);
check('装得下', s1.ok === true, `使用率 ${(s1.usage * 100).toFixed(0)}%`);
check('没有触发压缩', s1.compressed === false);
check('日期折算 2 天共 960 分钟', s1.totalAvailable === 960, `实际 ${s1.totalAvailable}`);

// ===============================================================
// 场景 2：1 天，8 个点 → 应该触发 rush 降级后装下
// ===============================================================
console.log('\n【场景 2】1 天 × 10h，勾 8 个点 —— 期望：先降级压缩，再装下');
const s2Selected = pick(
  'bj-ip-01', 'bj-ip-02', 'bj-ip-03', 'bj-ip-04',
  'bj-sp-01', 'bj-sp-02', 'bj-sp-04', 'bj-sp-15'
);
const s2 = plan({
  pois: s2Selected, allPois: POOL, dayHours: 10,
  startDate: '2026-11-01', startSlot: '上午',
  endDate: '2026-11-01', endSlot: '晚上',
});
showDays(s2);
check('最终装得下', s2.ok === true, `使用率 ${(s2.usage * 100).toFixed(0)}%`);
check('确实做了压缩降级', s2.compressed === true && s2.degraded.length > 0,
  `压缩了 ${s2.degraded.length} 个点`);
const tierOrder = [...s2Selected]
  .sort((a, b) => (TIER_WEIGHT[a.tier] ?? 50) - (TIER_WEIGHT[b.tier] ?? 50))
  .slice(0, s2.degraded.length)
  .map((p) => p.poiId)
  .sort();
check('压缩的正好是优先级最低的那几个（B → A → S，不跳级）',
  JSON.stringify(tierOrder) === JSON.stringify([...s2.degraded].sort()),
  `压缩：${s2.degraded.join(', ')}`);

// ===============================================================
// 场景 3：1 天，全选 23 个点 → 应该超载并给舍弃清单
// ===============================================================
console.log('\n【场景 3】1 天 × 8h，全选 23 个点 —— 期望：超载 + 舍弃清单');
const s3 = plan({
  pois: POOL, allPois: POOL, dayHours: 8,
  startDate: '2026-11-01', startSlot: '上午',
  endDate: '2026-11-01', endSlot: '晚上',
});
check('判定为超载', s3.overload === true);
check('给的是舍弃建议', s3.suggestion?.kind === 'drop');
check('缺口为正', s3.shortage > 0, `还差 ${fmtHours(s3.shortage)}`);
check('标出了必砍的点', (s3.suggestion?.items ?? []).some((i) => i.mustDrop));
console.log('    前 5 个建议放弃：');
for (const it of (s3.suggestion?.items ?? []).slice(0, 5)) {
  console.log(`       ${it.mustDrop ? '必砍' : '可选'}  ${it.name}  ${it.reason}`);
}

// ===============================================================
// 场景 4：1 天，只勾 2 个近点 → 使用率 < 70%，建议追加
// ===============================================================
console.log('\n【场景 4】1 天 × 8h，只勾 2 个点 —— 期望：建议追加');
const s4 = plan({
  pois: pick('bj-sp-01', 'bj-sp-02'), allPois: POOL, dayHours: 8,
  startDate: '2026-11-01', startSlot: '上午',
  endDate: '2026-11-01', endSlot: '晚上',
});
check('装得下', s4.ok === true);
check('使用率低于 70%', s4.usage < 0.7, `实际 ${(s4.usage * 100).toFixed(0)}%`);
check('给的是追加建议', s4.suggestion?.kind === 'add');
console.log('    建议追加：');
for (const it of (s4.suggestion?.items ?? []).slice(0, 3)) {
  console.log(`       ${it.name}  ${it.reason}  ${it.fits ? '（装得下）' : '（会超）'}`);
}

// ===============================================================
// 场景 5：只有半天，却勾了 4 个远点 → 判定为物理不可能
// ===============================================================
console.log('\n【场景 5】1 天只有上午半天 + 4 个远点 —— 期望：判定不可能');
const s5 = plan({
  pois: pick('bj-ip-08', 'bj-sp-11', 'bj-sp-13', 'bj-sp-10'), allPois: POOL, dayHours: 8,
  startDate: '2026-11-01', startSlot: '上午',
  endDate: '2026-11-01', endSlot: '中午',
});
check('判为物理不可能', s5.impossible === true, `可用 ${fmtHours(s5.totalAvailable)} / 最少需要 ${fmtHours(s5.minNeed)}`);
check('给出了人话提示', typeof s5.message === 'string' && s5.message.length > 0);
console.log(`    提示：${s5.message}`);
check('仍给出行程（供用户参考）', s5.days.length === 1 && s5.days[0].stops.length === 4);

// ===============================================================
// 场景 6：确定性 —— 同样输入跑两次，结果必须一模一样
// ===============================================================
console.log('\n【场景 6】确定性 —— 同样输入两次，结果必须一致');
const a = plan({ pois: s2Selected, allPois: POOL, dayHours: 10, startDate: '2026-11-01', startSlot: '上午', endDate: '2026-11-01', endSlot: '晚上' });
const b = plan({ pois: s2Selected, allPois: POOL, dayHours: 10, startDate: '2026-11-01', startSlot: '上午', endDate: '2026-11-01', endSlot: '晚上' });
check('两次结果完全相同', JSON.stringify(a.days) === JSON.stringify(b.days));

// ===============================================================
// 场景 7：日期折算的边界
// ===============================================================
console.log('\n【场景 7】日期/时段折算');
const d1 = buildDays({ startDate: '2026-11-01', startSlot: '中午', endDate: '2026-11-02', endSlot: '晚上', dayHours: 8 });
check('中午→次日晚 = 288 + 480 = 768 分钟',
  d1[0].available === 288 && d1[1].available === 480, `实际 ${d1[0].available} + ${d1[1].available}`);
check('首日 12:12 才开始', d1[0].startMin === 12 * 60 + 12, `实际 ${d1[0].startMin} 分`);
let threw = false;
try { buildDays({ startDate: '2026-11-01', startSlot: '晚上', endDate: '2026-11-01', endSlot: '上午', dayHours: 8 }); }
catch { threw = true; }
check('同日时段倒置会抛错', threw);

console.log('\n' + BAR);
console.log(failed ? ` ❌ ${failed} 项没过` : ' ✅ 全部通过');
console.log(BAR + '\n');
process.exit(failed ? 1 : 0);
