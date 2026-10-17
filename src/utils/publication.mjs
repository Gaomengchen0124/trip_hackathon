import {validateLineDoc} from '../../data/line-rules.mjs'
export function publicationIssues(doc, cityKey) {
 const line=doc.lines?.[cityKey]
 if(!line)return [{ruleId:'IP02',msg:'城市线不存在'}]
 const issues=validateLineDoc({...line,ip:doc.ip}).filter(i=>i.level==='error')
 if(!(line.ipStops??[]).length)issues.push({ruleId:'IP05',msg:'请至少添加一个与作品相关的 IP 点位'})
 for(const p of line.ipStops??[])if(!(p.quotes??[]).some(q=>q.full?.trim()&&q.source?.trim()))issues.push({ruleId:'IP06',msg:'请补充经核实的引文原文和出处',where:p.poiId})
 if(/【[^】]*】/.test(`${doc.ip?.name??''} ${doc.ip?.author??''} ${line.line?.title??''} ${(line.clusters??[]).join(' ')}`))issues.push({ruleId:'IP03',msg:'作品或线路仍有待填占位内容'})
 for(const p of [...(line.ipStops??[]),...(line.cityStops??[])])if(/占位|待替换|待补/.test(p.photoCredit??''))issues.push({ruleId:'IP04',msg:'图片来源或授权尚未核实',where:p.poiId})
 return issues
}
export function publicationIssueText(issue){
 if(issue.ruleId==='S03')return '请至少添加一个片区，再为点位选择所属片区'
 const names={name:'地名',cluster:'所属片区',intro:'点位介绍',realPhoto:'点位照片',photoCredit:'图片来源与授权',tier:'重要度',popularity:'知名度',durationNormal:'正常游玩时长',durationRush:'快速打卡时长'}
 return issue.msg.replace(/\b(name|cluster|intro|realPhoto|photoCredit|tier|popularity|durationNormal|durationRush)\b/g,field=>names[field])
}
