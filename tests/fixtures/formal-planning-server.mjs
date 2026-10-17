import {createRecommendationHandler} from '../../server/recommendation.mjs'
import {createTripQueries} from '../../server/planning/trip-adapter.mjs'
// Test-only server: synthetic model responses, never imports provider credentials.
import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
import {resolve,extname} from 'node:path'
import {createPlanningStore} from '../../server/planning/store.mjs'
import {createPlanningService} from '../../server/planning/service.mjs'
import {createPlanningHandler} from '../../server/planning/http.mjs'
const port=Number(process.env.TEST_PORT),origin=`http://127.0.0.1:${port}`;
const store=createPlanningStore({file:':memory:'});
const llm={configured:process.env.TEST_LLM_DISABLED!=='1',model:'synthetic-browser-test',async complete({messages}) {
  const payload=JSON.parse(messages[1].content);
  if(payload.itinerary&&(payload.currentText.startsWith('请在现有算法底稿')||payload.currentText.startsWith('在现有行程上优化'))){const row=payload.itinerary.days.flatMap(d=>d.items).find(i=>i.type==='visit');return {mode:'revise',operationProposals:[{type:'set_depth',poiId:row.poiId,depth:'quick',evidence:{quote:payload.currentText}}],questions:[]}}
  if(payload.itinerary){const row=payload.itinerary.days.flatMap(d=>d.items).filter(i=>i.type==='visit').at(-1);return {mode:'revise',operationProposals:[{type:'remove_poi',poiId:row.poiId,evidence:{quote:payload.currentText}}],questions:[]}}
  if(payload.selectedPoiIds)return {mode:'generate',candidateOrder:payload.selectedPoiIds};
  return {mode:'intake',requirementProposals:[],questionProposals:[{templateId:'wake_departure'},{templateId:'transport'},{templateId:'meals'}],keywordProposals:[{label:'多留休息时间',insertText:'两个景点之间多留休息时间'}]}
}};
const trip=createTripQueries({token:'synthetic-test-only',tokenKey:'',clientFactory:()=>({async queryTicket({scenicSpotName,cityName}){return {structuredContent:[{productID:1,basicInfo:{name:scenicSpotName,cityName,available:true},urlInfo:{h5Url:'https://m.ctrip.com/synthetic-detail'},resourceInfoList:[{resourceId:1,name:'合成测试成人票',price:10,isBooking:true,urlInfoDto:{h5Url:'https://m.ctrip.com/synthetic-ticket?channel=test'}}]}]}}})});
const service=createPlanningService({store,llm,trip});const handler=createPlanningHandler({service,store,origin});
const recommendations=await createRecommendationHandler({allowedOrigins:[origin],apiKey:''});
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,origin).pathname;
 if(path.startsWith('/api/planning/')||path.startsWith('/api/itineraries'))return handler(req,res);
 if(await recommendations(req,res))return;
 if(path==='/api/auth/session'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({user:null}))}
 if(path==='/api/favorites'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({favorites:[]}))}
 if(path==='/api/comments'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({comments:[]}))}
 const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.json':'application/json'};
 const file=resolve('dist','.'+decodeURIComponent(path));
 if(!file.startsWith(resolve('dist')+'/')&&path!=='/'){res.writeHead(404);return res.end()}
 try{const target=extname(path)?file:resolve('dist/index.html');const bytes=await readFile(target);res.writeHead(200,{'Content-Type':types[extname(target)]||'application/octet-stream'});res.end(bytes)}catch{res.writeHead(404);res.end()}

});
server.listen(port,'127.0.0.1',()=>console.log('FORMAL_TEST_READY'));
process.on('SIGTERM',()=>server.close(async()=>{await service.settle();store.close();process.exit(0)}));
