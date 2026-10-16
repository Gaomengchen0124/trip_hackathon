import { authRequest } from './server-session.mjs'
import { getAuthSession } from './session.mjs'
import { requestDemoLogin } from './login-dialog.mjs'
import { createLoginGate } from './login-gate.mjs'
const drafts=new Map()
export function mountComments(container, entityKey) {
  let alive = true, cursor = null, loading = false, pending = false, requestId = null, requestText = ''
  const auth = getAuthSession()
  const controls = new Map()
  function syncControls() {
    const owner = auth.getSnapshot().user?.id
    for (const { row, button, report } of controls.values()) { button.hidden = owner !== row.authorId; report.hidden = owner === row.authorId }
  }
  const unsubscribe = auth.subscribe(syncControls)
  const gate = createLoginGate({ getUser: () => auth.getSnapshot().user, requestLogin: requestDemoLogin })
  container.className = 'travel-comments'
  container.innerHTML = '<h3>巡礼交流</h3><div data-list></div><button type="button" data-more hidden>加载更多</button><form><label>分享你的巡礼体验<textarea maxlength="2000" rows="3" placeholder="有什么值得分享的发现？（最多 1000 字）"></textarea></label><p data-status role="status"></p><button type="submit">发布评论</button></form>'
  const draftKey=`${auth.getSnapshot().user?.id||'guest'}:${entityKey}`
  const list = container.querySelector('[data-list]'), more = container.querySelector('[data-more]'), form = container.querySelector('form'), input = container.querySelector('textarea'), status = container.querySelector('[data-status]'), submit = container.querySelector('[type="submit"]')
  input.value=drafts.get(draftKey)||''
  input.addEventListener('input',()=>{if(input.value)drafts.set(draftKey,input.value);else drafts.delete(draftKey)})
  async function load(append = false) {
    if (loading) return
    loading = true; more.disabled = true
    try {
      const data = await authRequest(`/api/comments?entityKey=${encodeURIComponent(entityKey)}${append && cursor ? `&before=${cursor}` : ''}`)
      if (!alive) return
      if (!append) { list.replaceChildren(); controls.clear() }
      for (const row of data.comments) {
        const article = document.createElement('article'), name = document.createElement('strong'), time = document.createElement('time'), text = document.createElement('p')
        name.textContent = row.nickname
        time.dateTime = new Date(row.createdAt).toISOString()
        time.textContent = new Date(row.createdAt).toLocaleString('zh-CN')
        text.textContent = row.content
        const remove = document.createElement('button')
        remove.type = 'button'; remove.textContent = '删除评论'
        remove.onclick = async () => {
          remove.disabled = true
          try {
            await authRequest(`/api/comments?entityKey=${encodeURIComponent(entityKey)}&id=${row.id}`, { method: 'DELETE' })
            if (!alive) return
            article.remove(); controls.delete(row.id)
            status.textContent = '评论已删除。'
            const undo = document.createElement('button'); undo.type = 'button'; undo.textContent = '撤销删除'
            status.append(' ',undo)
            undo.onclick = async () => {
              undo.disabled = true
              try {
                await authRequest('/api/comments', { method: 'PATCH', body: { entityKey, id: row.id, action: 'restore' } })
                if (alive) { status.textContent = '评论已恢复。'; await load() }
              } catch (error) { if (alive) { status.textContent = error.message; status.append(' ',undo) } }
              finally { undo.disabled = false }
            }
            if (!list.childNodes.length) list.textContent = '还没有评论，来分享第一条巡礼体验吧。'
          } catch (error) { if (alive) status.textContent = error.message }
          finally { remove.disabled = false }
        }
        const report=document.createElement('button');report.type='button';report.textContent='举报'
        report.onclick=()=>{
          if(article.querySelector('[data-report-form]'))return
          const box=document.createElement('div');box.dataset.reportForm=''
          const label=document.createElement('label');label.textContent='举报原因'
          const reason=document.createElement('select')
          for(const title of ['垃圾广告','不实信息','人身攻击','其他']){const option=document.createElement('option');option.textContent=title;option.value=title;reason.append(option)}
          label.append(reason)
          const send=document.createElement('button');send.type='button';send.textContent='提交举报'
          const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';cancel.onclick=()=>box.remove()
          send.onclick=async()=>{
            send.disabled=true
            try {
              const done=await gate.run(async()=>{await authRequest('/api/comment-reports',{method:'POST',body:{commentId:row.id,reason:reason.value}})})
              if(alive){status.textContent=done?'举报已提交，等待处理。':'未完成登录，举报未提交。';if(done)box.remove()}
            } catch(error){if(alive)status.textContent=error.message}finally{send.disabled=false}
          }
          box.append(label,send,cancel);article.append(box)
        }
        controls.set(row.id, { row, button: remove, report })
        article.append(name,time,text,remove,report); list.append(article)
      }
      if (!list.childNodes.length) list.textContent = '还没有评论，来分享第一条巡礼体验吧。'
      syncControls()
      cursor = data.nextCursor; more.hidden = !cursor
    } catch (error) { if (alive) { status.textContent = error.message; more.hidden = false; more.textContent = '重新加载' } }
    finally { loading = false; more.disabled = false }
  }
  more.onclick = () => { more.textContent = '加载更多'; load(!!cursor) }
  form.onsubmit = async event => {
    event.preventDefault()
    if (pending) return
    const content = input.value.trim()
    if (!content || Array.from(content).length > 1000) { status.textContent = '请输入 1–1000 字评论。'; return }
    if (auth.getSnapshot().mode === 'demo') { status.textContent = '请在服务端预览页使用邮箱登录后发布。'; return }
    if (!requestId || content !== requestText) { requestId = crypto.randomUUID(); requestText = content }
    pending = true; input.disabled = true; submit.disabled = true; status.textContent = ''
    let published = false
    try {
      const done = await gate.run(async () => {
        await authRequest('/api/comments', { method: 'POST', body: { entityKey, content, requestId } })
        published = true
      })
      if (!alive) return
      if (done && published) {
        input.value = ''; drafts.delete(draftKey); requestId = null; status.textContent = '评论已发布。'
        await load()
      } else status.textContent = '未完成登录，评论草稿已保留。'
    } catch (error) { if (alive) status.textContent = error.message }
    finally { pending = false; input.disabled = false; submit.disabled = false }
  }
  load()
  return () => { if(input.value)drafts.set(draftKey,input.value);else drafts.delete(draftKey); alive = false; gate.cancel(); unsubscribe(); controls.clear(); container.replaceChildren() }
}
