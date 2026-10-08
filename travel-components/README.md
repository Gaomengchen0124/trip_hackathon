# trip_hackathon · Vue 组件交付包（替代上一版原生 JS 包）

基于 [Gaomengchen0124/trip_hackathon](https://github.com/Gaomengchen0124/trip_hackathon)，main 提交 `32ec57c684cdd465a1fe2cb7cd05fd5151d734e4`。交付前复核 main，仍为该提交。

## 给组员：怎么接入

本包是对现有工程的增量，不能双击运行；上一版的 components.js、components.css、demo.html 不再使用。保持仓库的 Vue 3 + Vite + Pinia + vue-router，无新增运行时依赖。JavaScript 实现，附可供 IDE 引用的数据类型声明。

建议在现有仓库新建分支，然后从仓库根目录执行（路径按解压位置修改）：

```bash
git switch -c feat/travel-ui-components
git apply --check ../travel-components/changes.patch
git apply ../travel-components/changes.patch
npm ci
npm run build
npm run dev
```

`git apply --check` 无报错后再应用。检查失败说明队友已经改过相同位置或补丁已应用，先看冲突，不要强行覆盖。也可以对照本包 src/ 的同名文件手工合并；复制前核对下文的五个页面接线改动。两种方式选一种，不能先覆盖再重复应用补丁。

本地演示沿用项目配置：`VITE_USE_MOCK=true`。本包不包含任何 .env 文件，也不改团队配置。

## 文件和分工

| 文件 | 用途 / 与现有页面的关系 |
|---|---|
| src/components/RouteCard.vue | 新增；首页和栏目页复用，select(lineId) |
| src/components/PoiSelectCard.vue | 新增；勾选卡片，由 PoiCheckList 使用 |
| src/components/PoiCheckList.vue | 替换现有文件；保留 title / pois / checkedIds 和 toggle(poiId)，新增可选 disabled |
| src/components/TimeBar.vue | 替换；保留 timeRange / hoursPerDay 及两个 update 事件，新增可选 disabled |
| src/components/TradeoffDrawer.vue | 替换；仍从现有 Pinia store 读取数据，保留 status / close / confirmed，confirmed 新增第二参数 |
| src/components/PoiCardOverlay.vue | 替换；保留 poi / view-detail(poiId) / close |
| src/components/DetailContent.vue | 新增；详情内部内容，接收 poi |
| src/components/QuoteCard.vue | 新增；接收 quote，brief 为 true 时显示 brief，否则显示 full |
| src/components/DayTimeline.vue | 新增；接收 days、pois；emit locate(poiId) |
| src/components/DayTimelineItem.vue | 新增；接收 day、item、poi；emit locate(poiId) |
| src/components/ui/PhotoFrame.vue | 图片加载、失败占位和 Vite base 路径处理 |
| src/components/ui/DialogSheet.vue | 原生 dialog 弹层、键盘关闭、焦点恢复和滚动锁定 |
| src/utils/travel-ui.js | 时间、选择、增删建议的 UI 校验及图片地址处理 |
| src/types/travel.d.ts | 对照 contract.md 的接口类型；不改变后端协议 |

五个页面只承担接线：

- **HomeView.vue / ColumnListView.vue**：把内联路线按钮换成 RouteCard，沿用 go(lineId)。
- **DetailView.vue**：保留路由、Pinia 查点与返回，内部换成 DetailContent。
- **ResultView.vue**：替换时间轴；点击某站切地图 Tab 并打开该点卡片；超载提示显示当前排程天数。
- **CustomizeView.vue**：接入时间校验、请求异常提示、取舍重算和失败恢复；同一路线“继续修改”保留状态；“重新规划”仍使用原 store.reset()。

地图组件、路由表、Pinia store、API 适配层、mock 引擎、package.json、锁文件、基础色板均不改。

## 两个必须对齐的接口

### 时间字段（与当前仓库一致）

```js
{
  timeRange: {
    startDate: '2026-10-10', startSlot: '上午',
    endDate: '2026-10-11', endSlot: '晚上'
  },
  hoursPerDay: 8
}
```

不再使用上一版的 startPeriod/endPeriod/dailyHours。日程仍读取 `days[].items[]`，每项为 `{poiId, order, duration}`，没有擅自增加 arrival、departure 或 stops。

### 取舍确认（组件事件，非后端协议变更）

```js
emit('confirmed', status, {
  action: 'apply', // 'keep' 表示保留当前行程
  poiIds: ['sh-01'] // apply 时是用户勾选要舍弃 / 追加的 ID
})
```

第一个 status 参数保持原约定。第二参数由本包 CustomizeView.vue 接收，所以 **TradeoffDrawer.vue 与 CustomizeView.vue 必须一起合并**。舍弃/追加后更新选择并调用 store.submit()；仍不合适则继续显示抽屉；失败恢复旧选择和结果。任何时候都要至少保留一个 IP 点和一个城市景点。允许超载保留引擎 status，不伪装为 ok。

## 已处理的交互与视觉

- 沿用 --brand、--brand-light、--ink、--line 等现有变量，保持书卷红配色；组件样式 scoped。
- 初始不选、单点勾选、全选/清空、批量选择计数、禁用与键盘焦点。
- 真实日期、结束早于开始、同日时段倒序、6/8/10 小时和两类点位校验。
- 弹层 Esc、遮罩关闭、原生 dialog 焦点限制；重算时禁用关闭和重复点击。
- 图片按 Vite base 解析，避免在 /customize/ 或 /poi/ 下加载到错误路径；图片缺失显示占位。
- IP 的原著和台词分别展示，保留换行和出处；classic 不显示引文空态。所有文本使用 Vue 转义，未插入数据 HTML。
- 手机端时间表单、长名称、按钮与抽屉可换行；390px 宽度测试无横向溢出。

## 验证与复测

已在获取的仓库快照上通过：

1. `npm run build`：Vite 生产构建。
2. `node --test tests/travel-ui.test.mjs`：4 项校验测试。
3. Chromium 实际交互：首页进入定制、日期错误阻止提交、两类点位校验、追加/舍弃并重算、请求失败恢复、允许超载、Esc 关闭、继续修改保留选择、重新规划清空、时间轴打开地图卡片、brief/full 引文、文字转义、移动端无横向溢出；无 Vue 运行时错误。

浏览器脚本会自己启动 Vite 的 4173 端口并在结束后关闭，不需要另开 dev server。复测浏览器脚本时，在测试用副本中准备 Playwright：

```bash
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node tests/component-flow.cjs
```

可用 `CHROMIUM_EXECUTABLE_PATH` 指定已安装的 Chromium。测试中的引文是明确的合成测试文本，只注入测试浏览器内存，不写入产品数据。

## 仍由队友完成的部分

- 现有规划引擎仍固定按 2 天容量计算，尚未真正使用日期/时段，舍弃排序也是原 mock 逻辑。这个包只接通前端交互，不代表路线算法已正确。
- 现有 MapContainer 仍为占位投影；时间轴“查看地图”会切 Tab 并打开卡片，真实地图缩放/居中仍待地图负责人接入。
- 导出 Tab 仍是仓库已有的 window.print() 兜底，不是图片导出实现。
- 真实图片、坐标、原著/台词尚待内容组补充；真实后端尚未联调。详情刷新丢失 Pinia 状态时沿用原页面的“未找到该景点 / 回首页”兜底。

`manifest.json` 记录基线和文件哈希，`changes.patch` 供审核与合并。本包包含 19 个源文件与 2 个测试文件；不包含整个仓库和依赖目录。
