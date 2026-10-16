// Operator-only CLI. Never expose this file or database through the web server.
import { createAuthStore } from './auth-store.mjs'
const store=createAuthStore({file:process.env.AUTH_DATA_FILE||'var/auth.sqlite'})
try {
  const [command,id]=process.argv.slice(2)
  if (command==='list') console.log(JSON.stringify(store.pendingReports(),null,2))
  else if (['hide','dismiss'].includes(command)&&Number.isSafeInteger(Number(id))&&Number(id)>0) console.log(store.resolveReport(Number(id),command)?'已处理':'没有待处理记录')
  else { console.error('用法：node server/reports.mjs list | hide <举报编号> | dismiss <举报编号>');process.exitCode=1 }
} finally {store.close()}
