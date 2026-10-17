import { assert } from '../../src/planning/core.mjs'
import { validateValue } from '../../src/planning/requirements.mjs'
import { QUESTION_BANK,makeQuestion,bootstrapQuestions } from '../../src/planning/question-bank.mjs'
export { QUESTION_BANK,makeQuestion,bootstrapQuestions }
export function proposalsFromAnswers(questions,answers,requirements) {
  assert(Array.isArray(answers)&&answers.length<=60,'INVALID_ANSWERS','答案格式不正确');
  const proposals=[];
  for(const a of answers) {
    const q=questions.find(q=>q.id===a.questionId);assert(q,'UNKNOWN_QUESTION','问题已失效或不存在');
    const t=QUESTION_BANK[q.templateId],chosen=a.optionIds||[],values=a.values||{};
    assert(Array.isArray(chosen)&&chosen.length<=q.options.length&&new Set(chosen).size===chosen.length,'INVALID_ANSWERS','选项不正确');
    assert(values&&typeof values==='object'&&!Array.isArray(values)&&Object.keys(values).every(k=>q.fields.some(f=>f.id===k)),'INVALID_ANSWERS','存在未知答案字段');
    if(!chosen.length&&!Object.values(values).some(v=>v!==null&&v!==''))continue;
    for(const f of q.fields) {
      const v=values[f.id];if(v==null||v==='')continue;
      assert(f.type!=='integer'||Number.isInteger(v),'INVALID_ANSWERS','数字字段须为整数');
      assert(f.type!=='enum'||f.values.includes(v),'INVALID_ANSWERS','选项字段不正确');
      assert(f.type!=='list'||Array.isArray(v)&&v.every(x=>['conversation_must','conversation_exclude'].includes(q.templateId)?typeof x==='string':f.values.includes(x)),'INVALID_ANSWERS','多选字段不正确');
      assert(!['text','date','time','poi'].includes(f.type)||typeof v==='string'&&v.length<=200,'INVALID_ANSWERS','文字字段不正确');
    }
    const selected=chosen.map(id=>{const o=q.options.find(o=>o.id===id);assert(o,'INVALID_ANSWERS','选项不存在');return o.value});
    let pairs=[];
    if(q.templateId==='conversation_exclude')pairs=[['exclude',values.poiIds||[]]];
    else if(q.templateId==='conversation_must')pairs=[['mustVisit',values.poiIds||[]]];
    else if(q.templateId==='wake_departure')pairs=Object.entries(values).filter(([,v])=>v).map(([key,value])=>[key,value]);
    else if(['flight_details','fixed_event','activity_details'].includes(q.templateId)) {
      const old=requirements.filter(r=>r.key==='fixedEvent'&&r.state!=='superseded').at(-1);
      const value={...(old?.value||{}),...values,type:q.templateId==='flight_details'?'flight':values.type||old?.value.type||'activity'};
      pairs=[['fixedEvent',value,old?.id]];
    } else if(q.templateId==='poi_depth') {if(values.poiId&&values.depth)pairs=[['poiDepth',values]]}
    else if(t.key) {
      assert(selected.length<=1||q.templateId==='mobility','INVALID_ANSWERS','此问题只允许单选');
      let value=selected.length?selected[0]:null;
      if(['mobility','walking_budget'].includes(q.templateId))value=Object.assign({},...requirements.filter(r=>r.key==='mobility'&&r.state!=='superseded'&&r.scope.type==='trip').map(r=>r.value),...proposals.filter(r=>r.key==='mobility').map(r=>r.value),...selected,values);
      else if(q.templateId.startsWith('conversation_'))value=values;
      else if(q.templateId==='party')value={...(value||{}),...values};
      else if(q.templateId==='rest_detail')value=values;
      else if(q.templateId==='child_activity')value={...(requirements.filter(r=>r.key==='party'&&r.state!=='superseded').at(-1)?.value||{}),...values};
      else if(q.templateId==='budget')value=values;
      else if(q.templateId==='meals')value={...(value||{}),...values};
      if(value!==null)pairs=[[t.key,value]];
    }
    for(const [key,value,replacesId] of pairs) {
      validateValue(key,value);
      const quote=JSON.stringify(a);
      proposals.push({key,value,strength:['fixedEvent','mustVisit'].includes(key)?'hard':'soft',scope:{type:'trip',targetId:null},evidence:{quote},replacesId,answerId:a.questionId});
    }
  }
  return proposals
}
