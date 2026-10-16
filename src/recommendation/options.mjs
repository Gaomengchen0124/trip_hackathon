export const kinds = [['novel','小说'],['tv','电视剧'],['film','电影'],['anime','动漫'],['prose','散文'],['poetry','诗歌'],['history','历史文化']].map(([id,label])=>({id,label}))
export const themes = [['mystery','悬疑推理'],['scifi','科幻'],['fantasy','奇幻冒险'],['history','历史年代'],['urban','都市生活'],['youth','青春成长'],['romance','爱情'],['humanity','人文思考']].map(([id,label])=>({id,label}))
export const moods = [['healing','温暖治愈'],['thrilling','紧张刺激'],['nostalgic','怀旧'],['romantic','浪漫'],['reflective','沉静思考']].map(([id,label])=>({id,label}))
export const dictionaries = { kinds, themes, moods }
export const emptyInterests = () => ({ kinds:[],themes:[],moods:[],ipIds:[] })
export function validateInterests(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('兴趣格式不正确')
  const result = emptyInterests()
  for (const key of Object.keys(result)) {
    const values = input[key] ?? [], allowed = dictionaries[key]?.map(x=>x.id)
    if (!Array.isArray(values) || values.length > 20 || values.some(x=>typeof x !== 'string' || (allowed ? !allowed.includes(x) : !/^[a-zA-Z0-9_-]{1,100}$/.test(x)))) throw new Error('兴趣标签不正确')
    result[key] = [...new Set(values)]
  }
  return result
}
