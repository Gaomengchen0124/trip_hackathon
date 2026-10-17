// Evidence is limited to catalogue descriptions; absence is not proof of no cultural value.
const MATCHERS={
 '打卡出片':/拍摄|拍照|摄影|出片|街景|夜景|景观|建筑|地标/,
 '了解人文历史':/历史|文化|人文|博物馆|故居|纪念|遗址|古迹|百年|文物|传统|原址|老街/,
 '欣赏自然风光':/自然|山|湖|海滨|海滩|公园|花园|森林|湿地|江景/,
 '深度感受当地生活':/生活|社区|居民|市集|市场|街巷|弄堂|小店|菜场|老街/,
 '体验当地美食':/美食|餐|小吃|饭店|食物|菜肴|咖啡|茶馆|面馆|饮食/
};
export function preferenceFit(p,requirements=[]){const interests=requirements.filter(r=>r.state!=='superseded'&&r.key==='interests').flatMap(r=>r.value.tags||[]);const text=[p.name,p.intro,p.tips,p.skipNote,...Object.values(p.tags||{}).flat()].filter(x=>typeof x==='string').join(' ');const matched=interests.filter(t=>MATCHERS[t]?.test(text));const missing=interests.filter(t=>!matched.includes(t));const reasons=matched.map(t=>`资料中的介绍与「${t}」相关`);if(missing.length)reasons.push(`当前资料未体现与「${missing.join('、')}」的明确关联，不代表该地没有相关价值`);if(!interests.length)reasons.push('未指定体验兴趣，按游览时长和路线试排结果排序');return {score:matched.length,matched,missing,reasons}}
export function rankRemovalCandidates(pois,requirements,selected,protectedIds=[]){return pois.filter(p=>selected.includes(p.poiId)&&!protectedIds.includes(p.poiId)).map(p=>({...p,fit:preferenceFit(p,requirements)})).sort((a,b)=>a.fit.score-b.fit.score||(b.durationNormal||0)-(a.durationNormal||0)||a.poiId.localeCompare(b.poiId))}
