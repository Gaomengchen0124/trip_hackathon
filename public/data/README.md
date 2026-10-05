# 本目录是内容组数据的最终落点。

骨架当前直接读取 `src/api/mock/index.js` 中的内联数据；
内容定稿后，建议将数据拆为以下 JSON 文件，由 adapter 的 mock 实现改为 fetch 本目录：

- `ips.json`      IP（作品）
- `lines.json`    线路（作品·城市）
- `pois.json`     点位（含 quotes / tier / cluster / 两档时长）
- `photos/`       图片素材

⚠️ 红线：所有引文必须逐字来自原著或剧集并标注出处，写不出来就留空，绝不编造。
