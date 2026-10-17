# 开场序章：旅行星图（第二版素材与设计存档）

> 当前交互已升级为整站第三版：原生滚动推进，取消点击与拖动启程，样式延伸到后续页面。当前行为、海豚素材和验证记录见 [旅人手札整站设计](./journal-system.md)。下文保留第二版的素材来源、提示词与历史实现说明，不作为当前交互说明。

## 第二版设计存档

用户要求笔触接近首页的滚动插画，减少第一版过密的建筑与雕刻细节。第二版将生成图改为接近白纸的淡铅笔轮廓，并直接复用首页的世界建筑长卷作为独立前景。保留金色字标与中文标题，所有控件及描述均为 HTML。

- 远景、建筑、纸雾、云、飞鸟和星轨分别移动；即使不操作鼠标，也能看到画面行进。
- 移动鼠标：不同景深以不同幅度响应，指针留下短暂的淡金虚线笔迹。
- 拖动空白画面：水平探索长卷，前景移动幅度大于远景。不会因普通拖动误入首页。
- 向上拨动字标：文字随手势抬起，前后景随手势拉开；达到阈值显示“松手，让故事启程”。短距离松手会回弹，足够距离松手才开始过渡。触屏支持上滑。
- “翻开旅途”变为透明、无边框的文字与手绘曲线入口，点击即可进入；不会强制要求拖动。
- 滚轮向下推进手势，累计达到阈值进入；停下后未完成的动作复位。
- 正式进入时纸幕分开，字标落入首页横幅，随后中文浮现。首页已在下方渲染。
- “暂停画卷”暂停全部背景循环与悬停反馈；页面不在前台时暂停背景。系统减少动态效果时关闭循环、拖动位移和笔迹，使用 160ms 淡出进入。
- Escape / 跳过始终可结束；键盘可访问所有操作。直接访问路线页等不经过序章，同一会话仅主动展示一次，首页可“重温序章”。
- 预览地址参数：`/?intro=1` 强制显示，`/?intro=0` 绕过。

## 参考证据与应用

| 来源 | 可核验内容与本项目选择 |
| --- | --- |
| 用户提供的首页截图、项目 `world-panorama-v1.png` | 低对比、细线轮廓、留白与不均匀的笔触是直接风格依据；开场底部复用同一张图。 |
| [Chartogne-Taillet](https://chartogne-taillet.com/fr) | 浏览器查看了年龄确认页上的留白排版与文字入口；未确认年龄或进入后续交互，不声称现场体验了后续地图。 |
| [制作方 Immersive Garden 案例](https://immersive-g.com/projects/chartogne-taillet-1) | 制作方介绍了手绘地图、水彩效果与地块交互。本项目借鉴“画面作为交互对象”的关系，用分层移动、画卷拖动和字标手势实现。未下载或复制其地图、字体、音频、模型。 |
| [制作方技术说明](https://medium.com/@hello_11138/chartogne-taillet-experience-site-case-study-53431d5f75f7) | 多层绘制将线条、深度、悬停状态分开。本项目用 CSS / SVG / Pointer Events 构成独立的图层与状态，不复刻原站 WebGL 实现。 |
| [Aprde 设计 Skill](https://github.com/Aprde/renaissance-rococo-web-design) | 参考材质交接、连续对象、可中断动画与可访问性规则。MIT 许可，未安装执行代码或复制截图中的作品。 |
| [SBS The Boat 项目说明](https://www.sbs.com.au/aboutus/2015/04/29/sbs-online-releases-first-ever-interactive-graphic-novel/)、[Waaark](https://waaark.com/works/) | 前一轮的插画叙事方向参考。 |
| [Codrops 字体动效](https://tympanus.net/codrops/2023/01/18/on-scroll-typography-animations/)、[MDN Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API) | 连续字标与原生动画生命周期。 |

未增加 npm 依赖、第三方动画插件或可执行下载。之前检索的 Rough Notation 与 Anime.js 没有安装。Contra Labs 仅作为用户提供的方向参考，本次未可靠验证其动态画面。

## 素材与本地位置

| 文件 | 来源 / 状态 |
| --- | --- |
| `public/img/opening/atlas-pencil-v2.webp` | 第二版内置 image_gen 编辑输出；1671×941，104,066 bytes。当前背景，约 102 KiB。 |
| `public/img/world-panorama-v1.png` | 项目已有首页建筑长卷，直接复用；多个图层共用同一 URL。 |
| `public/img/story-pilgrim-wordmark-v1.png` | 原有字标，保持原图与首页裁切关系。 |
| `public/img/opening/atlas-entrance-v1.webp` | 第一版存档及第二版编辑输入，不在当前开场中加载。 |

第二版原始 PNG 保留于：
`$CODEX_HOME/generated_images/01a1490f-8a75-7f33-8c83-bcac00db85c4/exec-0b460af3-78c0-4f08-8737-5fb14c3ea1ef.png`。

使用内置图像生成工具，未使用 CLI；工具没有返回可核验的底层模型名称。使用项目已有 Sharp 将输出编码为 WebP，未另行修改画面内容。

## 第二版最终编辑提示词

```text
Use case: style-transfer.
Asset type: a replacement background layer for an interactive classical travel website.
Input image 1: EDIT TARGET, the earlier ornate gold architectural landscape background. Input image 2: STYLE REFERENCE, the existing website's very simple pale pencil skyline.
Primary request: Completely simplify the first image into a loose, dreamy, unfinished pencil travel-journal sketch that MATCHES THE LINE QUALITY OF IMAGE 2. Replace the dense engraving and high-detail illustrated arches with sparse soft graphite/sepia contour strokes. This is a major simplification, not a blur filter.
Composition: landscape 16:9, 80 percent near-white #fdfcf9 negative space. The central region and upper half remain mostly empty to hold HTML lettering. Lower left: a few loosely sketched cypress trees, a SMALL simple ancient arch outline and faint steps; lower right: two or three very spare wild grasses and a barely suggested hill. Across bottom quarter, just distant mountains and low hills drawn with open, incomplete, irregular thin lines. Upper far corners: at most a few faint unfinished cloud contour strokes. No foreground city skyline because the existing panorama will be a separate animated layer in front.
Mark quality: hand pressure variations, slightly wandering double-traced edges, broken dry-pencil lines, sketchbook construction strokes, a tiny amount of smudged graphite and misty erasure at edges. Light taupe #b5aa94, mostly contour-only, little hatching and NO filled shadows. Lines must remain visibly hand drawn and gently imperfect, like the landmarks in image 2. The blank paper should be almost white, not yellow parchment. Dreamy, airy, poetic, classical and quietly mysterious. Very simple sparse illustration, not photorealistic.
Remove: ornate Rococo filigree, flowers, etched textures, precise stone blocks, dense buildings, detailed foliage, celestial diagrams, gold decorations, heavy sepia shading, paper tears, noisy textures. No text, no UI, no border, no watermark. Do not put a logo in the image. Preserve generous usable empty central space.
```

## 验证与限制

`npm run build` 后执行 `node tests/opening-sequence-browser.mjs`。

Windows Edge 155 / Chromium、DPR 1：1440×900、1920×1080、1366×768、390×844、320×640、844×390，以及 720×450 的窄高排版检查。720×450 相当于 1440×900 放大到 200% 时的 CSS 排版空间，并非真实浏览器缩放验证。

浏览器检查覆盖：持续动画、全部背景循环暂停、拖动画卷、字标短拖回弹与完整上拨、点击、滚轮、触摸上滑、键盘、Escape 中断、重播、会话记忆、浏览器返回、减少动态效果、图片失败、存储拒绝和登录兴趣引导排队。移动手势通过 Chromium CDP 仿真，不代表真实 iOS 测试。

`test-output/opening-*.png` 为实际页面静态截图。静态图不能说明动效质量；动作完成与停止行为另由浏览器检查验证。未验证 Safari、Firefox、真实 iOS 或线上 Web Vitals。
