# Story Pilgrim 路演 HTML

网站入口为 `public/intro.html`（部署后 `/intro.html`）。这是十一页的海豚动态开场版，所有图片、图表、样式和脚本均已内嵌，可单独下载后在浏览器打开。进入网站及查看外部数据来源时需要联网。

## 生成与交付

在仓库根目录运行（Node.js 20+，无额外依赖）：

```sh
node scripts/build-roadshow.mjs
```

命令会更新 `public/intro.html`，将完整交付文件写入 `dist/roadshow/`，并生成供 Canva 导入的静态副本 `roadshow/canva-static.html`。静态副本不包含网页动效和交互；文件未自动上传 Canva。

可指定交付目录：

```sh
node scripts/build-roadshow.mjs --output-dir ./dist/roadshow-export
```

所有 `intro-*.html` 交付别名与 `intro.html` 内容一致，推荐打开 `intro-海豚动态开场版.html`。网站正常构建继续使用现有 `npm run build`，会携带已提交的 `public/intro.html`。

## 内容与维护

| 页码 | 内容 |
| --- | --- |
| 1–2 | YOYO 邀请走进故事、作品登场 |
| 3–4 | 从作品出发的旅行、市场机会与可展开的数据依据 |
| 5–8 | 混合规划、多约束取舍、可解释选择、持续调整 |
| 9 | 推荐与内容共建 |
| 10 | 打开真实网站，返回后继续第 11 页 |
| 11 | 合作与试点邀请 |

- `intro.template.html` 与 `notes.json` 是原十页的内容骨架；`story-flow.mjs` 插入独立开场、重排页面、同步导航和讲稿。请勿对这两个源文件重复执行十一页重排。
- `story-flow.css` 和 `opening.js` 管理动态开场、原版双鳍 YOYO 与暂停/恢复控制；系统减少动态效果、打印和 Canva 静态导出都会关闭动画。页面不会自动翻页。
- `modern.css`、`layout-polish.css` 管理冷白信息页、深蓝灰截图页与响应式布局。
- `market-data.json` 保存数值与来源；`market-render.mjs`、`market.html`、`market.css`、`market.js` 生成市场页、图表和数据对话框。交付 JSON 沿用历史名称“第三页数据来源.json”，当前对应第 4 页。
- `assets/` 保存实际采用的图片。海豚来自网站四姿态精灵图，截图来自本地网站；机制示意有明确标记。未采用的早期生成插画不参与构建。
- `使用说明-十一页.txt` 是观众与演讲者操作说明；逐页演讲稿由构建脚本生成。

## 验证范围

提交前检查十一页顺序、唯一元素 ID、主标题、内嵌资源、脚本与 CSS 语法、暂停/恢复逻辑、数据面板和网站入口，并确认重建 HTML 与交付文件一致。最新动态开场没有完成浏览器视觉复核。
