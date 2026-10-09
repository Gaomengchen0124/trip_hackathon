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
  '近郊·横滨',
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

// 伦敦：按《哈利波特》文档里的片区名归并（"City" 与 "City of London" 统一），统一用中文
const LONDON_CLUSTERS = [
  '国王十字',
  '伦敦金融城',
  '摄政公园',
  '南岸',
  '河岸街',
  '南华克',
  '西区',
  '威斯敏斯特',
  '布鲁姆斯伯里',
  '伦敦塔',
  '南肯辛顿',
  '海德公园',
  '塔桥',
  '利维斯登（伦敦周边）',
];

// 北京（《我与地坛》）：按文档给的行政区做片区
const BEIJING_LITERARY_CLUSTERS = ['东城', '西城', '朝阳', '海淀'];

// 杭州（《盗墓笔记》）：模板《填写模板·盗墓笔记-杭州.md》里固定死的 7 个片区
const HANGZHOU_CLUSTERS = [
  '西湖·孤山',
  '西湖·北线',
  '西湖·南线',
  '上城·河坊街',
  '拱墅·运河',
  '余杭·良渚',
  '近郊',
];

// 北京（《三体》）：模板《填写模板·三体-北京.md》里固定死的 8 个片区
const BEIJING_SANTI_CLUSTERS = [
  '海淀·中关村',
  '海淀·清北',
  '东城',
  '西城',
  '朝阳',
  '丰台',
  '密云',
  '近郊',
];

// 天津（《潜伏》）：模板《填写模板·潜伏-天津.md》里固定死的 6 个片区 + 西青（模板表格第 14 行石家大院在杨柳青）
const TIANJIN_CLUSTERS = [
  '和平·五大道',
  '河北·意风区',
  '南开',
  '河东',
  '滨海',
  '蓟州',
  '西青·杨柳青',
];

// 大理（《去有风的地方》）：模板《填写模板·去有风的地方-大理.md》固定的 6 个片区
const DALI_CLUSTERS = [
  '大理·凤阳邑',
  '大理·喜洲',
  '大理·古城',
  '大理·苍山三塔',
  '大理·洱海西岸',
  '大理·海东双廊',
];

// 厦门（《开端》）：模板《填写模板·开端-厦门.md》固定的 9 个片区
const XIAMEN_CLUSTERS = [
  '厦门·岛内步道',
  '厦门·东荣社区',
  '厦门·华美空间',
  '厦门·环东海域',
  '厦门·海沧大道',
  '厦门·鼓浪屿',
  '厦门·中山路沙坡尾',
  '厦门·环岛路',
  '厦门·集美',
];

// 上海（《爱情神话》）：模板《填写模板·爱情神话-上海.md》固定的 8 个片区
const SHANGHAI_AQSH_CLUSTERS = [
  '徐汇·衡复',
  '静安',
  '近郊',
  '黄浦·外滩',
  '黄浦·老城厢',
  '黄浦·打浦桥',
  '虹口·北外滩',
  '浦东',
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
      地名: ['黄河路', '进贤路', '南京路步行街', '思南路', '复兴公园', '提篮桥', '曹杨新村', '国泰电影院'],
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
    ip: {
      ipId: 'longzu',
      name: '龙族',
      author: '江南',
      kind: 'novel',
      aliases: ['龙族', '龙族Ⅱ', '悼亡者之瞳', '路明非', '楚子航', '恺撒', '诺诺', '夏弥'],
    },
    priority: 10,
    tags: {
      城市: ['北京'],
      人物: ['路明非', '楚子航', '恺撒', '诺诺', '夏弥', '芬格尔'],
      地名: ['颐和园', '十七孔桥', '中关村', '王府井', '琉璃厂', '后海', '西单'],
    },
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
    ip: {
      ipId: 'longzu',
      name: '龙族',
      author: '江南',
      kind: 'novel',
      aliases: ['龙族', '龙族Ⅲ', '黑月之潮', '路明非', '楚子航', '恺撒', '源稚生', '绘梨衣', '酒德麻衣'],
    },
    priority: 11,
    tags: {
      城市: ['东京', '日本'],
      人物: ['路明非', '楚子航', '恺撒', '源稚生', '绘梨衣', '酒德麻衣'],
      地名: ['东京塔', '明治神宫', '歌舞伎町', '浅草寺', '秋叶原', '热海', '银座', '台场'],
    },
    recommendDays: 3,
  },
  {
    file: 'harrypotter-london',
    title: '哈利波特·伦敦',
    city: '伦敦',
    clusters: LONDON_CLUSTERS,
    bounds: { lng: [-0.45, 0.1], lat: [51.4, 51.75] },
    expectedIp: [8, 8],
    expectedCity: [10, 20],
    prefix: 'hp',
    ip: {
      ipId: 'harrypotter',
      name: '哈利波特',
      author: 'J.K.罗琳',
      kind: 'novel',
      aliases: ['哈利波特', '哈利·波特', 'Harry Potter'],
    },
    priority: 2,
    tags: {
      城市: ['伦敦', '英国'],
      人物: ['哈利·波特', '赫敏', '罗恩', '邓布利多'],
      地名: ['国王十字', '利德贺市场', '千禧桥', '博罗市场', '皮卡迪利广场', '威斯敏斯特'],
    },
    recommendDays: 3,
  },
  {
    file: 'woyuditan-beijing',
    title: '我与地坛·北京',
    city: '北京',
    clusters: BEIJING_LITERARY_CLUSTERS,
    bounds: { lng: [116.2, 116.5], lat: [39.85, 40.05] },
    expectedIp: [1, 1],
    expectedCity: [10, 20],
    prefix: 'wd',
    ip: {
      ipId: 'woyuditan',
      name: '我与地坛',
      author: '史铁生',
      kind: 'prose',
      aliases: ['我与地坛', '史铁生', '地坛'],
    },
    priority: 3,
    tags: { 城市: ['北京'], 人物: ['史铁生'], 地名: ['地坛', '地坛公园'] },
    recommendDays: 1,
  },
  {
    file: 'daomu-hangzhou',
    title: '盗墓笔记·杭州',
    city: '杭州',
    clusters: HANGZHOU_CLUSTERS,
    bounds: { lng: [119.9, 120.7], lat: [30.1, 30.5] },
    expectedIp: [3, 5],
    expectedCity: [10, 20],
    prefix: 'dm',
    ip: {
      ipId: 'daomu',
      name: '盗墓笔记',
      author: '南派三叔',
      kind: 'novel',
      // 吴山居是剧版设定（原著里铺子没名字），只放别名里给搜索命中用
      aliases: ['盗墓笔记', '吴邪', '闷油瓶', '张起灵', '吴山居', '小哥'],
    },
    priority: 4,
    tags: {
      城市: ['杭州'],
      人物: ['吴邪', '张起灵', '闷油瓶', '阿宁', '王胖子'],
      地名: ['西泠印社', '楼外楼', '宝石山', '孤山路', '北山路', '西湖'],
    },
    recommendDays: 2,
  },
  {
    file: 'santi-beijing',
    title: '三体·北京',
    city: '北京',
    clusters: BEIJING_SANTI_CLUSTERS,
    bounds: { lng: [115.4, 117.5], lat: [39.4, 41.1] },
    expectedIp: [4, 6],
    expectedCity: [10, 20],
    prefix: 'st',
    ip: {
      ipId: 'santi',
      name: '三体',
      author: '刘慈欣',
      kind: 'novel',
      // 红岸基地是虚构地名（书中在大兴安岭），只作搜索词，不设点位
      aliases: ['三体', '汪淼', '叶文洁', '史强', '大史', '罗辑', '程心', '云天明', '红岸基地'],
    },
    priority: 5,
    tags: {
      城市: ['北京'],
      人物: ['汪淼', '叶文洁', '史强', '程心', '云天明'],
      地名: ['密云水库', '王府井天主教堂', '北京天文馆', '清华大学', '密云观测站'],
    },
    recommendDays: 3,
  },
  {
    file: 'qianfu-tianjin',
    title: '潜伏·天津',
    city: '天津',
    clusters: TIANJIN_CLUSTERS,
    // 模板给的坐标范围（116.7~117.5 / 38.5~39.3）装不下盘山（40.06）和滨海海洋博物馆（117.79），放宽到全市
    bounds: { lng: [116.7, 118.0], lat: [38.5, 40.3] },
    // 方案 B（取景地线）：天津站 + 张园/静园/利顺德/张学良故居/曾延毅旧居/吴泰勋旧居（取景依据由人 A 核实提供）
    expectedIp: [6, 8],
    expectedCity: [10, 20],
    prefix: 'qf',
    ip: {
      ipId: 'qianfu',
      name: '潜伏',
      author: '龙一（原著）／姜伟（编剧）',
      kind: 'tv',
      aliases: ['潜伏', '余则成', '翠平', '吴敬中', '吴站长', '左蓝', '李涯', '天津站', '保密局天津站', '张园', '静园', '利顺德', '利顺德大饭店'],
    },
    priority: 6,
    tags: {
      城市: ['天津'],
      人物: ['余则成', '翠平', '吴敬中', '左蓝', '李涯'],
      地名: ['天津站', '张园', '静园', '利顺德大饭店', '五大道', '意式风情区', '海河', '赤峰道', '盘山'],
    },
    recommendDays: 2,
  },
  {
    file: 'quyoufengdedifang-dali',
    title: '去有风的地方·大理',
    city: '大理',
    clusters: DALI_CLUSTERS,
    bounds: { lng: [99.9, 100.4], lat: [25.5, 26.0] },
    // 首版只收录凤阳邑、喜洲、大理古城 3 个已报道取景点，其余候选待有证据再补
    expectedIp: [3, 8],
    expectedCity: [10, 20],
    prefix: 'yf-dl',
    ip: {
      ipId: 'quyoufengdedifang',
      name: '去有风的地方',
      author: '原创电视剧（无原著）',
      kind: 'tv',
      aliases: ['去有风的地方', '有风的地方', '许红豆', '谢之遥', '有风小院', '凤阳邑'],
    },
    priority: 7,
    tags: {
      城市: ['大理'],
      人物: ['许红豆', '谢之遥'],
      地名: ['凤阳邑', '喜洲古镇', '大理古城'],
    },
    recommendDays: 2,
  },
  {
    file: 'kaiduan-xiamen',
    title: '开端·厦门',
    city: '厦门',
    clusters: XIAMEN_CLUSTERS,
    bounds: { lng: [117.9, 118.4], lat: [24.4, 24.8] },
    expectedIp: [6, 8],
    expectedCity: [10, 20],
    prefix: 'kd-xm',
    ip: {
      ipId: 'kaiduan',
      name: '开端',
      author: '祈祷君（原著）／电视剧《开端》',
      kind: 'tv',
      aliases: ['开端', '祈祷君', '李诗情', '肖鹤云', '嘉林', '公交车'],
    },
    priority: 8,
    tags: {
      城市: ['厦门'],
      人物: ['李诗情', '肖鹤云'],
      地名: ['和熙楼', '海山东荣广场', '联发华美空间', '美峰天桥'],
    },
    recommendDays: 2,
  },
  {
    file: 'aiqingshenhua-shanghai',
    title: '爱情神话·上海',
    city: '上海',
    clusters: SHANGHAI_AQSH_CLUSTERS,
    bounds: { lng: [121.0, 121.9], lat: [30.6, 31.5] },
    expectedIp: [6, 8],
    expectedCity: [10, 20],
    prefix: 'aqsh-sh',
    ip: {
      ipId: 'aiqingshenhua',
      name: '爱情神话',
      author: '邵艺辉（编剧／导演）',
      kind: 'film',
      aliases: ['爱情神话', '老白', '李小姐', '格洛瑞亚', '蓓蓓', '五原路'],
    },
    priority: 9,
    tags: {
      城市: ['上海'],
      人物: ['老白', '李小姐', '格洛瑞亚', '蓓蓓'],
      地名: ['五原路', '延庆路', '上海浦东美术馆（MAP）'],
    },
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
