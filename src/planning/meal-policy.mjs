import { clock, pick } from './core.mjs'
export const roundUpSlot = (minute,slot=5) => Math.ceil(minute/slot)*slot;
export function mealStart(window,minute) {
  const earliest=Math.max(minute,window.earliest),rounded=roundUpSlot(earliest,15);
  // A narrow user window takes precedence over a tidy clock label.
  return rounded<=window.latest?rounded:earliest
}
export function mealWindows(requirements,date,start,end,policy) {
  const pref=pick(requirements,'meals',date)||{};
  const duration=roundUpSlot(pref.durationMinutes??({simple:30,local:45,dedicated:60}[pref.preference]||policy.mealMinutes));
  const windows=[];
  const add=(id,label,earliest,latest,preferred,customWindow=false)=>{
    const a=Math.max(start,earliest),b=Math.min(latest,end-duration);
    if(a<=b)windows.push({id,label,earliest:a,latest:b,preferred:Math.max(a,Math.min(preferred,b)),duration,customWindow})
  };
  add('lunch','午餐',clock(pref.lunchStart||'11:30'),clock(pref.lunchEnd||'13:30'),policy.mealAt,Boolean(pref.lunchStart||pref.lunchEnd));
  if(end>=19*60)add('dinner','晚餐',17*60+30,20*60,18*60+30);
  return windows;
}
