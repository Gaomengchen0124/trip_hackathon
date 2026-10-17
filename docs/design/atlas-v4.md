# 古典远行图鉴 · 第四版

统一路线见 [atlas-v4-plan.md](atlas-v4-plan.md)。延续象牙纸、铅笔线条、古金和宋体，以暖墨色照片卷轴拉开层次。页面次序是“序章 → 寻迹 → 入境 → 成行 → 远行 → 续篇”。

## 展示与交互

- 序章永久保留在首页上方，以浏览器原生滚动推进或倒退。无滚轮劫持，无完成后删除章节或重置滚动位置。
- 标题在滚动中靠拢首页原标识；远景、云、罗盘、地标分别运动，纸面逐步显露首页。返回上方时反向还原。
- 同一会话再次进入从首页开始，仍可上滚返回。?intro=1 从序章开始，?intro=0 从首页开始；详情直达不插入序章。
- 首页删除重复的智能推荐、巡礼许愿卡片；导航入口保留。新增大幅实景封面、叠放的街巷照片、暖墨色照片卷轴和一大四小的路线版面。
- YOYO 成为首页可互动的页边书签。问候、便笺展开、键盘关闭与原有推荐/许愿路由分别保留。内页延用已有的 YOYO 位置，不新增遮挡表单的悬浮物。
- 内页采用相同章节页眉、城市索引、照片与文字分栏和页脚。地图、表单、接口与规划状态不更改。
- 页面转换用浏览器 View Transitions 的快照翻页；照片可接续至详情。动画不施加到真实地图或固定弹窗祖先。减少动画偏好下直接导航。
- 全站继续使用一套金色铅笔光标，不生成泡泡。触摸与减少动画偏好下不创建光标画布。

## 新素材

- 工具：内置 imagegen（未安装或下载额外插件/依赖）。
- 最终文件：public/img/opening/atlas-portal-v4.webp。
- 原始文件：C:/Users/ZSY/.codex/generated_images/01a1490f-8a75-7f33-8c83-bcac00db85c4/exec-ca33448b-708a-42f3-95d4-2a5976810497.png。
- 参考：项目已有 public/img/world-panorama-v1.png 与 public/img/opening/atlas-pencil-v2.webp。
- 用已有 sharp 压缩为 WebP，原始文件保留。生成结果出现一个小旅行者，作为远景叙事元素保留；没有使用第三方画作。
- 旧海豚及插画来源、提示词见 [journal-system.md](journal-system.md) 和 [opening-sequence.md](opening-sequence.md)。

最终提示词：

> Use case: illustration-story. Asset type: a wide 16:9 atmospheric hand-drawn background for the opening chapter of Story Pilgrim, a classical mysterious travel journal website.
> Input 1 is the existing very light pencil landmark panorama, style reference. Input 2 is the existing pencil entrance scene, edit target for a much stronger composition. Make a new sibling scene retaining its loose sepia pencil stroke and warm ivory paper.
> Build an immersive yet unfinished sketch of a traveller standing between two monumental antique arch fragments at the far left and right edges, looking across a misty landscape of distant mountains and a winding river. Architectural fragments should frame the entire height of the side edges, with climbing grasses and a few loose botanical pencil marks, a curved pale pathway coming from the lower foreground. Use soft pale ochre watercolour wash, expressive visibly imperfect fine warm-brown graphite lines, erased edges and broken contour strokes. Delicate, hand-touched, hazy and lyrical. Allow the scenery to dissolve naturally into paper.
> Composition: broad cinematic landscape. The central 65% of the image, especially upper-middle, remains nearly blank pale ivory for the large live website title; no arch lintel across the center. Left and right framing occupy about 18% each. Some dramatic sculptural curves but very little ornate carved detail. Distant landscape lives in the lower quarter. Atmospheric depth, clear silhouettes, restrained airy drawing rather than microscopic engraving. Ivory #f6f1e7, muted parchment gold, light sepia. No blue or green tones, no black vignette, no realism, no glossy 3D, no photographs, no text, no logos, no people, no labels, no UI. Do not render the website or title into the image.

## 验证边界

浏览器测试见 tests/opening-sequence-browser.mjs：双向滚动、首次位置、导航/历史返回、移动端、键盘、减少动画、缺图和 storage 失效、海豚便笺、搜索/推荐/选点。

规划回归使用现有本地测试服务验证生成、追加、修订、撤销、刷新保留与会话隔离，不接入真实付费服务。当前所有改动保留本地，未推送。

2026-10-17 验证通过：生产构建；193 项单元/集成测试；6 种尺寸的序章浏览器回归；本地完整规划链路；1440/390/320 最终转场与海豚菜单定点复测。路线末尾定制栏确认位于正常文档流，未受序章页脚样式影响。浏览器没有捕获到脚本错误。推荐、地图、规划、存储与服务端目录没有本轮修改，package.json / lockfile 没有新增依赖。

## 后续精简（第五次预览）

按用户反馈移除首页“把故事，走成远方”开页，将原搜索及空结果许愿移至路线选择区。路线区用“选择你的圣地巡礼之行”作为主标题，“下一章，去往哪里？”改为右侧辅助文案。序章左上 SP / 旅人手札标识移除，保留导航品牌与其他序章效果。

移除的开页去掉搜索栏后单独交付于 D:/携程hackathon/交付/故事开篇-无搜索框-20261017.zip，含离线 HTML、独立 Vue 组件、限定作用域样式、图片、可选铅笔光标、三张预览和素材说明。离线图片加载、Vue 编译、1440/390/320 排版、搜索跳转/返回及空结果许愿、双向序章已复查通过，生产构建通过。

## 侧栏同步与细节修正（第六次预览）

已在保留本地未提交改动的前提下，快进同步 origin/main 至 dd93dbe（含产品介绍页及定制页左右布局）。同步前备份保留在 Git stash：codex-before-sidebar-sync-2026-10-17-v6；CustomizeView 的样式/模板冲突已合并，保留队友的左侧景点、右侧吸顶对话及全部事件绑定。

- 许愿墙取消偶数卡片的额外上边距和悬浮位移，同一行上下边缘对齐，保留展开、排序、点赞。
- 景点 YOYO 放入卡片内部预留区域，提示向内展开；卡片和提示在 320px 到桌面尺寸均不越界。
- 新对话侧栏使用暖金纸感，包括原先残留的蓝色动态伪元素、滚动条、按钮；保留独立滚动和移动端上下布局。
- 恢复景点、许愿卡、地图、对话、弹窗等边框的圆角；纯文字分隔线保留原布局。
- 首页滚动照片加入 CSS 邮票齿孔纸层和原创 SVG 铅笔双线 public/brand/postage-pencil-frame.svg。照片、点击区域、循环滚动、暂停按钮与懒加载逻辑保持不变；无新增依赖或外部下载。

验证：生产构建通过；1440/960/820/390/320 五种宽度的卡片对齐、海豚/提示边界、圆角及侧栏断点检查通过；邮票照片点击跳转通过；现有完整规划浏览器回归通过（推荐 → 选点 → 优化 → 追加 → 修订 → 撤销 → 刷新 → 门票）。业务状态、规划引擎、API、服务端及依赖清单无修改。本轮没有 commit 或 push。

## 合并前验证（2026-10-17）

本次前端提交基于 dd93dbe，未纳入独立的推荐服务部署配置和验收脚本。192 项单元/集成测试通过，生产构建使用已有 Node 24.21.0 运行时通过。本机 Node 24.12.0 在本次打包阶段出现原生进程退出（0xC0000409）；切换已有运行时后，相同源文件和依赖完成构建，没有修改项目依赖或系统配置。

提交前序章浏览器回归通过：6 种屏幕尺寸、原生触摸/键盘滚动、减弱动态效果、兴趣弹窗、缺图与禁用存储、搜索与许愿、历史导航返回、选点与日期。测试等待历史导航后的 Vue 渲染及页面转场结束，再检查序章的 inert 状态。
