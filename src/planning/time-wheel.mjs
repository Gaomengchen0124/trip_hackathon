// Native scroll-snap wheels; no UI framework or third-party date picker required.
export function createTimeWheel({label,value='10:00',onChange=()=>{},onSubmit=()=>{}}){
 const root=document.createElement('div');root.className='time-wheel';root.setAttribute('role','group');root.setAttribute('aria-label',label);
 const title=document.createElement('span');title.className='time-wheel-label';title.textContent=label;root.append(title);const columns=document.createElement('div');columns.className='time-wheel-columns';root.append(columns);
 const flushers=[];root.commitValue=()=>flushers.forEach(fn=>fn());
 const selected=value.split(':').map(Number);if(!Number.isInteger(selected[0]))selected[0]=10;if(!Number.isInteger(selected[1]))selected[1]=0;
 const publish=()=>onChange(selected.map(n=>String(n).padStart(2,'0')).join(':'));
 for(const [part,count,unit]of [[0,24,'小时'],[1,60,'分钟']]){
  if(part){const colon=document.createElement('span');colon.textContent=':';colon.className='time-wheel-colon';columns.append(colon)}
  const wheel=document.createElement('div');wheel.className='time-wheel-column';wheel.tabIndex=0;wheel.setAttribute('role','spinbutton');wheel.setAttribute('aria-label',label+'：'+unit);wheel.setAttribute('aria-valuemin','0');wheel.setAttribute('aria-valuemax',String(count-1));
  const mark=()=>{wheel.setAttribute('aria-valuenow',String(selected[part]));wheel.setAttribute('aria-valuetext',String(selected[part]).padStart(2,'0')+unit);for(const row of wheel.children)row.classList.toggle('selected',Number(row.dataset.value)===selected[part])};
  const choose=(n,scroll=true)=>{selected[part]=Math.max(0,Math.min(count-1,n));mark();if(scroll)wheel.scrollTop=selected[part]*40;publish()};
  for(let n=0;n<count;n++){const row=document.createElement('div');row.className='time-wheel-item';row.dataset.value=n;row.textContent=String(n).padStart(2,'0');row.addEventListener('click',()=>{choose(n);wheel.focus({preventScroll:true})});wheel.append(row)}
  flushers.push(()=>{clearTimeout(timer);choose(Math.round(wheel.scrollTop/40),false)});wheel.addEventListener('wheel',()=>wheel.focus({preventScroll:true}),{passive:true});wheel.addEventListener('pointerdown',()=>wheel.focus({preventScroll:true}));
  let timer,digits='',digitAt=0;wheel.addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(()=>{if(wheel.isConnected)choose(Math.round(wheel.scrollTop/40),false)},100)});
  wheel.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();event.stopPropagation();root.commitValue();onSubmit();return}let n=selected[part];if(event.key==='ArrowDown'||event.key==='ArrowUp')n+=event.key==='ArrowDown'?1:-1;else if(event.key==='Home')n=0;else if(event.key==='End')n=count-1;else if(/^\d$/.test(event.key)){const now=Date.now();digits=now-digitAt>700?'':digits;digits=(digits+event.key).slice(-2);digitAt=now;n=Number(digits);if(n>=count){digits=event.key;n=Number(digits)}}else return;event.preventDefault();choose(n)});
  columns.append(wheel);mark();queueMicrotask(()=>{wheel.scrollTop=selected[part]*40});
 }
 return root
}
