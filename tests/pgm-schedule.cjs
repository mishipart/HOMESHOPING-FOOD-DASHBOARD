const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={window:{HSFM_FOOD_SCOPE:require('../dashboard/food_scope.js')},sessionStorage:{getItem:()=>null},localStorage:{getItem:()=>null},document:{addEventListener(){}}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../dashboard/pgm_schedule.js','utf8'),ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../dashboard/app.js','utf8').replace(/  bind\(\);\s+setPerfRange\("yesterday"\);\s+loadData\(\);/,'globalThis.api={state,pgmForRow,pgmBadgeHtml,groupPgmBadge,invalidateDerived};'),ctx);
const a=ctx.api;
function row(channel,date,time,title='고춧가루'){return {hsshow_id:'test',platform_name:channel,broadcast_date:date,start_datetime:date+'T'+time+':00+09:00',raw_title:title};}
function check(name,fn){try{a.state.adminMaster={occurrence_rules:[],occurrence_splits:[]};a.invalidateDerived();fn();console.log('PASS',name);}catch(e){process.exitCode=1;console.error('FAIL',name,e.message);}}
check('Lotte Thursday schedule recognizes product without program name',()=>assert.equal(a.pgmForRow(row('롯데홈쇼핑','2026-08-06','20:45'))?.name,'최유라쇼'));
check('wrong weekday and different minute do not schedule match',()=>{assert.equal(a.pgmForRow(row('롯데홈쇼핑','2026-08-07','20:45')),null);a.invalidateDerived();assert.equal(a.pgmForRow(row('롯데홈쇼핑','2026-08-06','20:46')),null);});
check('manual exclusion wins over schedule',()=>{a.state.adminMaster.occurrence_rules=[{hsshow_id:'test',pgm_override:'N'}];assert.equal(a.pgmForRow(row('롯데홈쇼핑','2026-08-06','20:45')),null);});
check('Shinsegae is the permitted data channel exception',()=>assert.equal(a.pgmForRow(row('신세계쇼핑','2026-08-05','19:35'))?.name,'신라벨'));
for(const channel of ['현대홈쇼핑 플러스샵','CJ온스타일 플러스','GS홈쇼핑 마이샵','롯데원티비','NS홈쇼핑 샵플러스','SK스토아','KT알파쇼핑','쇼핑엔티'])check('no automatic PGM on '+channel,()=>{
 for(const p of ctx.window.HSFM_PGM_SCHEDULE){a.invalidateDerived();assert.equal(a.pgmForRow(row(channel,'2026-08-06',p.time,p.name)),null);}
});
check('calendar/performance and product review share PGM badges',()=>{const r=row('롯데홈쇼핑','2026-08-06','20:45');assert.match(a.pgmBadgeHtml(r),/PGM/);assert.match(a.groupPgmBadge([r]),/최유라쇼/);});
