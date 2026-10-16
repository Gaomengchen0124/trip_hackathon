import { resolveEntityNames } from './entity-names.mjs'
import { authRequest } from './server-session.mjs'
import { setFavorite } from './favorites.mjs'
export function mountProfileLibrary(dialog, auth) {
  const form=dialog.querySelector('form')
  const nav=document.createElement('nav');nav.className='profile-tabs';nav.setAttribute('aria-label','个人中心栏目')
  const panel=document.createElement('section');panel.className='profile-library';panel.hidden=true;panel.setAttribute('aria-label','个人内容')
  form.before(nav);form.after(panel)
  let alive=true, generation=0, selected='资料', cursor=null
  const initialUser=auth.getSnapshot().user?.id
  const buttons=[]
  const valid=version=>alive&&version===generation&&auth.getSnapshot().user?.id===initialUser
  function addText(tag,value,parent=panel) {const el=document.createElement(tag);el.textContent=value;parent.append(el);return el}
  function action(label,fn,parent) {
    const button=addText('button',label,parent);button.type='button'
    button.onclick=async()=>{button.disabled=true;try{await fn()}catch(error){if(alive)addText('p',error.message)}finally{button.disabled=false}}
    return button
  }
  async function load(append=false) {
    const version=++generation
    panel.querySelectorAll('[data-load-more]').forEach(button=>button.remove())
    if(!append)panel.replaceChildren()
    const loading=addText('p','加载中…')
    try {
      if(auth.getSnapshot().mode!=='server') { loading.textContent='请使用邮箱登录后的账号查看。';return }
      if(selected==='我的收藏') {
        const {favorites}=await authRequest('/api/favorites')
        if(!valid(version))return
        loading.remove()
        if(!favorites.length)addText('p','还没有收藏。')
        const names=await resolveEntityNames(favorites)
        if(!valid(version))return
        for(const key of favorites) {
          const row=addText('article','')
          addText('strong',names[key]||(key.startsWith('poi:')?'已收藏景点':'已收藏路线'),row)
          action('取消收藏',async()=>{await setFavorite(key,false);if(valid(version))await load()},row)
        }
      } else {
        const data=await authRequest(`/api/me/comments${append&&cursor?`?before=${cursor}`:''}`)
        if(!valid(version))return
        const names=await resolveEntityNames(data.comments.map(comment=>comment.entityKey))
        if(!valid(version))return
        loading.remove()
        if(!data.comments.length&&!append)addText('p','还没有发布评论。')
        for(const comment of data.comments) {
          const row=addText('article','')
          addText('small',`${names[comment.entityKey]||'巡礼讨论'} · ${new Date(comment.createdAt).toLocaleString('zh-CN')}`,row)
          addText('p',comment.content,row)
          if(comment.moderatedAt!==null) addText('small','该评论已被管理员隐藏。',row)
          else action(comment.deletedAt===null?'删除评论':'恢复评论',async()=>{
            if(comment.deletedAt===null)await authRequest(`/api/comments?entityKey=${encodeURIComponent(comment.entityKey)}&id=${comment.id}`,{method:'DELETE'})
            else await authRequest('/api/comments',{method:'PATCH',body:{entityKey:comment.entityKey,id:comment.id,action:'restore'}})
            if(valid(version))await load()
          },row)
        }
        cursor=data.nextCursor
        if(cursor) action('加载更多',async()=>{await load(true)},panel).dataset.loadMore='' 
      }
    } catch(error) {if(valid(version)){loading.textContent=error.message;action('重试',()=>load(),panel)}}
  }
  for(const title of ['资料','我的收藏','我的评论']) {
    const button=document.createElement('button');button.type='button';button.textContent=title;button.setAttribute('aria-pressed',String(title===selected));buttons.push(button);nav.append(button)
    button.onclick=()=>{selected=title;generation++;cursor=null;for(const b of buttons)b.setAttribute('aria-pressed',String(b===button));form.hidden=title!=='资料';panel.hidden=title==='资料';if(title!=='资料')load()}
  }
  const off=auth.subscribe(state=>{if(state.user?.id!==initialUser){generation++;panel.replaceChildren();if(dialog.open)dialog.close()}})
  return()=>{alive=false;generation++;off()}
}
