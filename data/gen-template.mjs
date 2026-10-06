// 生成点位库空模板。用法：node data/gen-template.mjs
// 加新的作品线：往 LINES 里加一条，重跑即可。
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

const TODO = '【待填】';
// 默认不覆盖已存在的数据文件（内容组填过的东西不能被生成器抹掉）。
// 确实要重生成某条线：node data/gen-template.mjs --force
const FORCE = process.argv.includes('--force');

// 片区：固定值，行程引擎按它分组。不要在此之外自创。
const BEIJING_CLUSTERS = [
  '东城·故宫',
  '西城·什刹海',
  '朝阳·三里屯',
  '海淀·中关村',
  '丰台·城南',
  '怀柔·长城',
  '通州·环球影城',
  '密云·古北水镇',
];

const JAPAN_CLUSTERS = [
  '新宿',
  '涩谷',
  '台东·浅草',
  '千代田·银座',
  '港区·台场',
  '近郊·富士箱根',
];

const SHANGHAI_CLUSTERS = [
  '黄浦·外滩',
  '黄浦·老城厢',
  '黄浦·打浦桥',
  '静安',
  '徐汇·衡复',
  '虹口·北外滩',
  '普陀',
  '浦东',
  '近郊',
];

const LINES = [
  {
    file: 'fanhua-shanghai',
    title: '繁花·上海',
    city: '上海',
    clusters: SHANGHAI_CLUSTERS,
    bounds: { lng: [121.0, 121.9], lat: [30.6, 31.5] },
    expectedIp: [6, 8],
    expectedCity: [10, 20],
    prefix: 'sh',
    ip: { ipId: 'fanhua', name: '繁花', author: '金宇澄', kind: 'novel', aliases: ['繁花', '阿宝', '汪小姐', '黄河路'] },
    priority: 1,
    tags: {
      城市: ['上海'],
      人物: ['阿宝', '汪小姐', '玲子', '李李'],
      地名: ['黄河路', '进贤路', '南京路', '思南路', '复兴公园', '提篮桥', '曹杨新村', '国泰电影院'],
    },
    recommendDays: 3,
  },
  {
    file: 'longzu-beijing',
    title: '龙族·北京',
    city: '北京',
    clusters: BEIJING_CLUSTERS,
    bounds: { lng: [115.4, 117.5], lat: [39.4, 41.1] },
    expectedIp: [6, 8],
    expectedCity: [10, 20],
    prefix: 'bj',
    ip: { ipId: 'longzu', name: '龙族', author: '江南', kind: 'novel', aliases: ['龙族', '路明非', '楚子航'] },
    priority: 10,
    tags: { 城市: ['北京'], 人物: ['路明非', '楚子航', '恺撒', '诺诺'], 地名: [] },
    recommendDays: 2,
  },
  {
    file: 'longzu-japan',
    title: '龙族·日本',
    city: '东京及近郊',
    clusters: JAPAN_CLUSTERS,
    bounds: { lng: [138.5, 140.9], lat: [34.9, 36.3] },
    expectedIp: [6, 8],
    expectedCity: [10, 20],
    prefix: 'jp',
    ip: { ipId: 'longzu', name: '龙族', author: '江南', kind: 'novel', aliases: ['龙族', '路明非', '楚子航'] },
    priority: 11,
    tags: { 城市: ['东京', '日本'], 人物: ['路明非', '楚子航', '恺撒', '诺诺'], 地名: [] },
    recommendDays: 2,
  },
];

const ipSlot = (prefix, lineId, i) => {
  const poiId = `${prefix}-ip-${String(i).padStart(2, '0')}`;
  return {
    poiId,
    lineId,
    type: 'ip',
    name: TODO,
    alias: '',
    lng: null,
    lat: null,
    cluster: TODO,
    tier: 'A',
    durationNormal: 60,
    durationRush: 30,
    intro: '',
    quotes: [
      { kind: '原著', brief: '', full: '', source: '' },
      { kind: '台词', brief: '', full: '', source: '' },
    ],
    realPhoto: `img/${poiId}.jpg`,
    photoCredit: '',
    skipNote: '',
    tips: '',
  };
};

const citySlot = (prefix, lineId, i) => {
  const poiId = `${prefix}-sp-${String(i).padStart(2, '0')}`;
  return {
    poiId,
    lineId,
    type: 'classic',
    name: TODO,
    lng: null,
    lat: null,
    cluster: TODO,
    popularity: 3,
    durationNormal: 120,
    durationRush: 60,
    intro: '',
    realPhoto: `img/${poiId}.jpg`,
    photoCredit: '',
    ticket: '',
    openHours: '',
  };
};

mkdirSync('data/lines', { recursive: true });

const written = [];
for (const cfg of LINES) {
  const lineId = cfg.file;
  const ipInfo = cfg.ip;
  const out = `data/lines/${cfg.file}.json`;
  if (existsSync(out) && !FORCE) {
    console.log(`· ${out} 已存在，跳过（要覆盖就加 --force）`);
    written.push(cfg);
    continue;
  }
  const payload = {
    _说明: '点位库。所有【待填】必须人工核对原著/剧集后填写，禁止编造引文。校验：node data/validate.mjs data/lines/' + cfg.file + '.json',
    _版本: 1,
    _priority: cfg.priority,
    _bounds: cfg.bounds,
    _expected: { ipStops: cfg.expectedIp, cityStops: cfg.expectedCity, maxTierS: 3 },
    ip: {
      ipId: ipInfo.ipId,
      name: ipInfo.name,
      author: ipInfo.author,
      kind: ipInfo.kind,
      cover: `img/${ipInfo.ipId}.jpg`,
      aliases: ipInfo.aliases,
      tags: cfg.tags,
    },
    line: {
      lineId,
      ipId: ipInfo.ipId,
      title: cfg.title,
      city: cfg.city,
      cover: `img/${cfg.file}.jpg`,
      recommendDays: cfg.recommendDays,
    },
    clusters: cfg.clusters,
    ipStops: Array.from({ length: 8 }, (_, i) => ipSlot(cfg.prefix, lineId, i + 1)),
    cityStops: Array.from({ length: 15 }, (_, i) => citySlot(cfg.prefix, lineId, i + 1)),
  };

  writeFileSync(out, JSON.stringify(payload, null, 2) + '\n');
  written.push(cfg);
  console.log(`✓ ${out}  (${cfg.title}：8 个 IP 点位 + 15 个城市景点，${cfg.clusters.length} 个片区)`);
}

// ---------------------------------------------------------------
// 首页目录：给浏览器一次读走，不用 readdir
// 「城市 / 人物 / 地名」三栏怎么分组在 src/catalog.mjs 里做，这里只存事实
// ---------------------------------------------------------------
const primary = written.slice().sort((a, b) => a.priority - b.priority)[0];
const index = {
  _说明: '首页目录。由 data/gen-template.mjs 生成，不要手改。',
  _primary: primary.file,
  lines: written
    .map((cfg) => ({
      lineId: cfg.file,
      ipId: cfg.ip.ipId,
      ipName: cfg.ip.name,
      title: cfg.title,
      city: cfg.city,
      cover: `img/${cfg.file}.jpg`,
      file: `data/lines/${cfg.file}.json`,
      priority: cfg.priority,
      recommendDays: cfg.recommendDays,
      aliases: cfg.ip.aliases,
      tags: cfg.tags,
    }))
    .sort((a, b) => a.priority - b.priority),
};
writeFileSync('data/lines/index.json', JSON.stringify(index, null, 2) + '\n');
console.log(`✓ data/lines/index.json  (首页目录，主推：${index._primary})`);
