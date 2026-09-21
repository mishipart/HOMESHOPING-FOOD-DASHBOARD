const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../dashboard/app.js','utf8');
const fields=new Map();
const ctx={window:{HSFM_FOOD_SCOPE:require('../dashboard/food_scope.js')},sessionStorage:{getItem:()=>null},localStorage:{getItem:()=>null},document:{addEventListener(){},querySelector:s=>fields.get(s)||{value:'',checked:false}}};
vm.createContext(ctx);
vm.runInContext(source.replace(/  bind\(\);\s+setPerfRange\("yesterday"\);\s+loadData\(\);/,'globalThis.api={readMetadataForm,expandForProducts,state,invalidateDerived,perfRows,metricsForRows};'),ctx);
const a=ctx.api;
function form(date,start,end){return {dataset:{broadcastDate:date},querySelector:s=>s==='.meta-pgm'?{checked:false}:{value:s==='.meta-start'?start:s==='.meta-end'?end:''}};}
const tests=[
 ['compact 24-hour digits normalize without changing broadcast date',()=>{const r=a.readMetadataForm(form('2026-08-06','0320','1530'));assert.equal(r.start_datetime_override,'2026-08-06T03:20:00+09:00');assert.equal(r.end_datetime_override,'2026-08-06T15:30:00+09:00');}],
 ['compact midnight rolls end forward only',()=>{const r=a.readMetadataForm(form('2026-08-31','2340','0020'));assert.equal(r.end_datetime_override,'2026-09-01T00:20:00+09:00');}],
 ['invalid and equivalent equal times are rejected',()=>{for(const t of ['2400','1260','320','오전 03:20','3:20','12:345'])assert.throws(()=>a.readMetadataForm(form('2026-08-06',t,'1600')));assert.throws(()=>a.readMetadataForm(form('2026-08-06','0320','03:20')));}],
 ['overnight end rolls to next month, start stays on broadcast date',()=>{const r=a.readMetadataForm(form('2026-08-31','23:40','00:20'));assert.equal(r.start_datetime_override,'2026-08-31T23:40:00+09:00');assert.equal(r.end_datetime_override,'2026-09-01T00:20:00+09:00');}],
 ['normal interval keeps both timestamps on broadcast date',()=>{const r=a.readMetadataForm(form('2026-08-04','01:10','01:40'));assert.equal(r.start_datetime_override,'2026-08-04T01:10:00+09:00');assert.equal(r.end_datetime_override,'2026-08-04T01:40:00+09:00');}],
 ['blank times preserve original; partial and zero duration rejected',()=>{assert.equal(a.readMetadataForm(form('2026-08-04','','')).start_datetime_override,'');assert.throws(()=>a.readMetadataForm(form('2026-08-04','01:00','')));assert.throws(()=>a.readMetadataForm(form('2026-08-04','01:00','01:00')));}],
 ['overnight product revenue and quantity appear only on start broadcast date',()=>{const metadata=a.readMetadataForm(form('2026-08-31','23:40','00:20'));a.state.rows=[{hsshow_id:'night',broadcast_date:'2026-08-31',start_datetime:'2026-08-31T23:00:00+09:00',source_category:'식품',performance_status:'confirmed'}];a.state.masterPublic=[];a.state.adminMaster={occurrence_splits:[{hsshow_id:'night',split_index:'1',standard_product_name:'갈비',sales_amt:'12000',sales_cnt:'3',...metadata}]};a.invalidateDerived();fields.set('#perfStart',{value:'2026-08-31'});fields.set('#perfEnd',{value:'2026-08-31'});const rows=a.perfRows();assert.equal(rows.length,1);assert.equal(rows[0].standard_product_name,'갈비');assert.equal(a.metricsForRows(rows).sales,12000);assert.equal(a.metricsForRows(rows).units,3);fields.set('#perfStart',{value:'2026-09-01'});fields.set('#perfEnd',{value:'2026-09-01'});assert.equal(a.perfRows().length,0);}]
];
let failed=0;for(const [name,test] of tests){try{test();console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e.message);}}process.exitCode=failed?1:0;
