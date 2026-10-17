// Commons 抓图：移植自 .work/photos/fetch-photos.mjs（Wikimedia Commons，CC 授权，附署名）
// 对缺图点位搜索 Commons API，下载 2-3 张候选，自动回填 realPhoto/photos/photoCredit。
// 国内网络可用 COMMONS_PROXY（如 http://127.0.0.1:7993）走本地代理访问 Wikimedia；生产（海外服务器）不需要。
// 注意：代理路径必须用 npm undici 自己的 fetch（与 ProxyAgent 同版本），Node 内置 fetch 的 dispatcher 接口与它不兼容。
import { ProxyAgent, fetch as undiciFetch } from 'undici'

const dispatcher = process.env.COMMONS_PROXY?.trim() ? new ProxyAgent(process.env.COMMONS_PROXY.trim()) : null
const EN = {
  黄河路: 'Huanghe Road Shanghai', 进贤路: 'Jinxian Road Shanghai',
  外白渡桥: 'Waibaidu Bridge', 和平饭店: 'Peace Hotel Shanghai',
  南京路步行街: 'Nanjing Road', 国泰电影院: 'Cathay Theatre Shanghai',
  思南路: 'Sinan Road Shanghai', 复兴公园: 'Fuxing Park Shanghai',
  提篮桥: 'Tilanqiao', 曹杨新村: 'Caoyang',
  东方明珠: 'Oriental Pearl Tower', 上海中心: 'Shanghai Tower',
  豫园: 'Yu Garden Shanghai', 上海博物馆: 'Shanghai Museum',
  静安寺: "Jing'an Temple Shanghai", 武康大楼: 'Wukang Mansion',
  田子坊: 'Tianzifang', 新天地: 'Xintiandi Shanghai',
  迪士尼: 'Shanghai Disneyland', 朱家角: 'Zhujiajiao',
  '1933': '1933 Old Millfun', 多伦路: 'Duolun Road Shanghai',
  上海科技馆: 'Shanghai Science and Technology Museum', 西岸: 'West Bund',
  西湖: 'West Lake Hangzhou', 断桥: 'Broken Bridge West Lake', 雷峰塔: 'Leifeng Pagoda',
  灵隐: 'Lingyin Temple', 三潭印月: 'Three Pools Mirroring the Moon', 河坊街: 'Hefang Street',
  西溪: 'Xixi Wetland', 九溪: 'Nine Creeks Hangzhou', 龙井: 'Longjing village Hangzhou',
  六和塔: 'Liuhe Pagoda', 拱宸桥: 'Gongchen Bridge', 良渚: 'Liangzhu Archaeological Ruins',
  太子湾: 'Taiziwan Park', 胡雪岩: 'Hu Xueyan Residence', 宝石山: 'Baoshi Hill Hangzhou',
  故宫: 'Forbidden City', 天安门: 'Tiananmen', 颐和园: 'Summer Palace Beijing',
  圆明园: 'Old Summer Palace', 天坛: 'Temple of Heaven', 八达岭: 'Badaling Great Wall',
  慕田峪: 'Mutianyu Great Wall', 鸟巢: 'Beijing National Stadium', 南锣鼓巷: 'Nanluoguxiang',
  什刹海: 'Shichahai', 雍和宫: 'Yonghe Temple', 北海公园: 'Beihai Park Beijing',
  景山: 'Jingshan Park', 香山: 'Fragrant Hills', 798: '798 Art Zone',
  王府井: 'Wangfujing', 环球影城: 'Universal Studios Beijing',
  密云: 'Miyun Observatory', 天文: 'Beijing Ancient Observatory',
  象鼻山: 'Elephant Trunk Hill', 七星岩: 'Seven Star Cave Guilin',
  叠彩山: 'Diecai Hill Guilin', 伏波山: 'Fubo Hill Guilin', 独秀峰: 'Solitary Beauty Peak Guilin',
  靖江王府: "Jingjiang Princes' City Guilin", 漓江: 'Li River Guilin', 芦笛岩: 'Reed Flute Cave',
  两江四湖: 'Two Rivers and Four Lakes Guilin', 日月双塔: 'Sun and Moon Pagodas Guilin',
  遇龙河: 'Yulong River Yangshuo', 十里画廊: 'Ten Mile Gallery Yangshuo', 龙脊梯田: 'Longji Rice Terraces',
  兴坪: 'Xingping Yangshuo', 阳朔西街: 'West Street Yangshuo',
}
const GOOD_LICENSE = /^(cc0|cc-by|cc-by-sa|public domain|pd-self|attribution)/i
const UA = 'storyypilgrim-admin/0.1 (cc photo candidate fetcher)'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function enHint(name) { return Object.entries(EN).find(([k]) => name.includes(k))?.[1] }

async function jget(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.json()
}

async function searchCommons(q, fetchImpl, limit = 8) {
  const u = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search'
    + '&gsrnamespace=6&gsrlimit=' + limit + '&gsrsearch=' + encodeURIComponent(q)
    + '&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1600'
  const d = await jget(u, fetchImpl)
  return Object.values(d.query?.pages || {}).map((p) => {
    const ii = p.imageinfo?.[0] || {}
    const em = ii.extmetadata || {}
    return {
      title: p.title,
      page: ii.descriptionurl || '',
      thumb: ii.thumburl || ii.url,
      author: (em.Artist?.value || '').replace(/<[^>]+>/g, '').trim().slice(0, 80),
      license: em.LicenseShortName?.value || '',
    }
  }).filter((x) => x.thumb && /\.(jpe?g|png)$/i.test(x.title))
}

async function downloadImage(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) })
  if (!res.ok) return null
  const buf = Buffer.from(await res.arrayBuffer())
  // 只收 JPEG 魔数（上传通道统一 JPEG）
  if (buf.length < 100 || buf.length > 4 * 1024 * 1024 || buf[0] !== 255 || buf[1] !== 216) return null
  return buf
}

const credit = (c) => `© ${c.author || '未知作者'} / ${c.license || '授权见来源页'} / via Wikimedia Commons · ${c.page}`

/**
 * 给一组点位抓候选图并回填
 * @param tasks [{ key, name, city, cover? }] key=存储前缀
 * @returns { filled: { key: { photos: string[], credit: string } }, failed: [key] }
 */
export async function fetchCandidates(tasks, { uploadsDir, writeFile, fetchImpl = fetch, perTask = 2, delay = 300 } = {}) {
  const effFetch = dispatcher ? (url, opts = {}) => undiciFetch(url, { ...opts, dispatcher }) : fetchImpl
  const filled = {}
  const failed = []
  for (const t of tasks) {
    try {
      const searches = t.cover
        ? [t.name + ' 电视剧', t.name + ' ' + t.city, t.city + ' skyline'].filter(Boolean)
        : [t.name + ' ' + t.city, t.name, enHint(t.name)].filter(Boolean)
      let cands = []
      for (const q of [...new Set(searches)]) {
        if (cands.length >= perTask + 1) break
        try { cands = cands.concat(await searchCommons(q, effFetch)) } catch { /* 试下一个关键词 */ }
        await sleep(delay)
      }
      const seen = new Set()
      cands = cands.filter((c) => (c.thumb && !seen.has(c.title) && seen.add(c.title)))
        .sort((a, b) => (GOOD_LICENSE.test(b.license) ? 1 : 0) - (GOOD_LICENSE.test(a.license) ? 1 : 0))
      const photos = []
      let creditText = ''
      for (const c of cands) {
        if (photos.length >= perTask) break
        const buf = await downloadImage(c.thumb, effFetch)
        if (!buf) continue
        const file = `${t.key}-${photos.length + 1}.jpg`
        await writeFile(uploadsDir, file, buf)
        photos.push(`/api/content/img/${file}`)
        if (!creditText) creditText = credit(c)
        await sleep(delay)
      }
      if (photos.length) filled[t.key] = { photos, credit: creditText }
      else failed.push(t.key)
    } catch { failed.push(t.key) }
  }
  return { filled, failed }
}
