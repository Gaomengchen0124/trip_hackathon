# 旅人手札：整站展示层（第三版存档）

当前实现与双向滚动机制见 [atlas-v4.md](atlas-v4.md)。本页保留第三版素材及设计记录，序章占位与完成行为已由第四版替代。

## 视觉与连续性

只改前端展示。路由、数据、接口、推荐规则、规划算法、选择与保存逻辑沿用现有实现。

- 序章是文档中的 185svh 滚动章节，使用原生滚动、触摸滑动、Space / Page Down；没有点击启程门槛，没有拦截滚轮。前 85svh 将纸雾逐渐散开，金色字标连续落到已有首页标题的位置。完成前向上滚动可逆；完成时同步消耗序章占位，保留用户额外滚动的距离。
- 序章后的首页、城市目录、推荐、路线详情、景点、定制、结果、行程与许愿共享纸色、铅笔线、金色章节印记、照片页边和章节末尾的建筑长卷。管理后台保留原布局。
- 寻迹 → 入境 / 驻足 → 成行 → 远行 → 续篇：章节说明仅提供叙事层，不增减现有操作。
- 标题和卡片在进入视野时轻轻浮现，章节罗盘随滚动转向；首页照片墙、原有横幅继续使用既有移动方式。
- 全站复用金色虚线笔迹与罗盘指针，包括 native dialog；完全移除原鼠标泡泡和海豚冒泡。保留系统指针，不在表单输入区、地图、触屏及减少动态效果模式绘制笔迹。
- YOYO 的 welcome / planning / success / empty 四个状态保持顺序、位置与行为，换成淡彩铅笔插画。海豚仍可点击打招呼，已有选点联动仍在。
- 暂停画卷、减少动态效果、跳过 / Escape、同会话不重复、重温序章、深链接直达、登录后兴趣问答等行为均保留。

## 文件

- `src/components/OpeningSequence.vue` / `opening-sequence.css`：原生滚动序章与连续字标。
- `src/components/StoryChapter.vue` / `StoryFooter.vue`：公开页面章节首尾。
- `src/assets/journal.css`：统一材质、排版、卡片、对话框与规划样式。
- `src/utils/story-motion.js`：单个 IntersectionObserver 与按需滚动帧；不干预表单和地图。
- `src/utils/pencil-cursor.js`：单个按需 canvas，含对话框坐标处理、减少动态效果与路由清理。
- `public/brand/dolphin-sketch-v1.webp`：项目使用的新版海豚图集。

## 素材生成与来源

使用内置 image_gen（imagegen skill 的默认模式），没有调用付费 CLI / API，也没有安装新插件或 npm 依赖。工具未提供可核验的底层模型名称。

编辑输入为项目原有 `public/brand/dolphin-states.png`，风格参照项目已有 `public/img/world-panorama-v1.png`，两者均在编辑前查看。透明图集四种姿态保留。原图没有覆盖。

- 原始生成输出：`C:/Users/ZSY/.codex/generated_images/01a1490f-8a75-7f33-8c83-bcac00db85c4/exec-d02ddc29-67a7-4852-a955-b4ff50bf4182.png`
- 项目最终文件：`D:/携程hackathon/trip_hackathon/public/brand/dolphin-sketch-v1.webp`
- 使用项目已有 Sharp 压缩至 1086 × 362 WebP（101,664 bytes）；验证包含 alpha。没有在图像工具以外重绘或抠图。
- 开场继续使用 `public/img/opening/atlas-pencil-v2.webp`；生成提示词和前两版参考来源见 [opening-sequence.md](./opening-sequence.md)。

### 海豚最终编辑提示词

```text
Use case: style-transfer.
Asset type: production website mascot sprite, transparent background, exactly FOUR equal columns in ONE horizontal row; entire canvas aspect ratio 3:1, each cell aspect ratio 3:4.
Image 1 is the EDIT TARGET: existing Ctrip YOYO dolphin sprite. Image 2 is STYLE reference only: delicate sparse warm sepia pencil travel panorama.
Redraw all four existing dolphins as loose hand-drawn pencil and pale watercolor illustrations from an antique travel sketchbook. Preserve YOYO identity: round dolphin head, white belly, simple black bean eyes, little wavy smiling mouth, fins, tail. Preserve EXACT four-state order and poses: 1 friendly waving, 2 holding folded travel map, 3 cheerful closed eyes holding check mark, 4 thoughtful with question mark.
Medium: visible soft broken graphite/sepia pencil outlines, imperfect lightly doubled strokes, hazy dry watercolor wash and unfinished edges, much simpler than a detailed rendering. Muted dusty blue-gray on dolphin with warm ochre pencil contour, ivory belly, pale peach cheeks; map/check accents ochre gold. Avoid vivid cyan. No glossy highlights, plastic shading, 3D effect, heavy black outline, intricate engraving.
Composition invariants: each dolphin fully contained and horizontally centered within its equal quarter; same scale, top and tail baselines aligned; generous transparent padding between poses and around canvas. Absolutely transparent background, no white rectangles or paper sheet, no painted background or shadow beyond character. No extra dolphins, no lettering, no watermarks. Strong readability at 64px display height.
```

## 验证

`npm run build` 通过；`npm test` 193 / 193 通过。

`node tests/opening-sequence-browser.mjs` 使用本机 Edge，API 隔离为测试响应，检查：
- 1440×900、1920×1080、390×844、320×640、844×390、720×450。
- 原生滚动推进、倒退回看、完成前后位置连续、会话记忆、重播、键盘和触摸。
- 减少动态效果、暂停、插画加载失败、浏览器存储拒绝。
- 原有兴趣问答、路线进入定制、选择景点、日期编辑、海豚点击、推荐筛选、许愿表单与 dialog 内笔迹。
- 无未捕获页面异常。

预览：`http://127.0.0.1:5174/?intro=1&v=3`。截图保存在忽略目录 `test-output/journal-*.png`。本次未提交或推送。

完整业务回归也已在本地合成服务上通过：推荐 → 选点 → 生成 → 顺路追加 → 修改预览 → 应用 → 撤销 → 刷新恢复 → 门票浮窗。复用 merged-flow-browser.mjs 场景，在忽略目录 test-output 中将浏览器改为现有 Edge，修正测试 fixture 的 Windows 路径分隔符，并在现有“还有余裕”协商中选择“不追加，直接生成”。生产代码与后端没有为测试改动，未发起真实预订。
