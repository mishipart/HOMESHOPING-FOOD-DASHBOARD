const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../dashboard/app.js','utf8');
function setup(){
 const fields=new Map(),requests=[];
 const ctx={console,window:{},sessionStorage:{getItem:()=>null},localStorage:{getItem:()=>null},document:{addEventListener(){},querySelector:s=>fields.get(s)||null}};
 vm.createContext(ctx);vm.runInContext(source.replace(/  bind\(\);\s+setPerfRange\("yesterday"\);\s+loadData\(\);/,`globalThis.api={state,saveProductAdmin};renderReview=fillCommonFilters=renderGlobalKpis=renderActiveTab=showStatus=()=>{};categorySubValue=()=>"전복";`),ctx);
 const one={hsshow_id:'A',split_index:'1',standard_product_name:'전복',brand:'',sales_cnt:'247',sales_amt:'7140000',updated_at:'old',pgm_override:'N'};
 ctx.api.state.adminMaster={schema_version:4,admin_rows:[],occurrence_splits:[one,{...one,split_index:'2',standard_product_name:'김치'}]};ctx.api.state.rows=[];
 for(const s of ['#editAction','#editRawTitle','#editSourceStandard','#editStandardName','#editBrand','#editGroup','#editIngredient','#editCategoryMajor','#editCategoryMiddle','#productSaveError'])fields.set(s,{value:'',textContent:''});
 fields.get('#editAction').value='save_occurrence';fields.get('#editStandardName').value='바다마을 전복';fields.get('#editBrand').value='바다마을';
 fields.set('#productForm',{dataset:{dynamicSingleOcc:'1',occurrenceId:'A',splitIndex:'1',splitUpdatedAt:'old',splitOriginalName:'전복'}});fields.set('#productDialog',{close(){}});
 ctx.fetch=async(url,o)=>{const body=JSON.parse(o.body);requests.push(body);return {ok:true,json:async()=>({ok:true,row:{...one,...body,updated_at:'new'}})};};
 return {ctx,a:ctx.api,fields,requests};
}
const tests=[
 ['only selected split metadata is saved',async()=>{const x=setup();await x.a.saveProductAdmin();assert.equal(x.requests[0].action,'update_split_product');assert.equal(x.requests[0].split_index,'1');assert.equal(x.requests[0].expected_updated_at,'old');assert.equal(x.requests[0].sales_amt,undefined);assert.equal(x.a.state.adminMaster.occurrence_splits[0].brand,'바다마을');assert.equal(x.a.state.adminMaster.occurrence_splits[1].standard_product_name,'김치');assert.equal(x.a.state.adminMaster.admin_rows.length,0);}],
 ['new split product registers a canonical catalog entry before patching split',async()=>{const x=setup();x.fields.get('#editAction').value='create_new';await x.a.saveProductAdmin();assert.equal(x.requests.length,2);assert.equal(x.requests[0].action,'create_new');assert.equal(x.requests[0].match_keyword,'바다마을 전복');assert.equal(x.requests[1].action,'update_split_product');}],
 ['older Worker prevents both catalog and split write',async()=>{const x=setup();x.a.state.adminMaster.schema_version=3;x.fields.get('#editAction').value='create_new';await x.a.saveProductAdmin();assert.equal(x.requests.length,0);assert.ok(x.fields.get('#productSaveError').textContent);}],
 ['conflict leaves local split unchanged',async()=>{const x=setup();x.ctx.fetch=async()=>({ok:false,status:409,json:async()=>({error:'새로고침'})});await x.a.saveProductAdmin();assert.equal(x.a.state.adminMaster.occurrence_splits[0].standard_product_name,'전복');assert.match(x.fields.get('#productSaveError').textContent,/새로고침/);}]
];
(async()=>{let n=0;for(const [name,test] of tests){try{await test();console.log('PASS',name);}catch(e){n++;console.error('FAIL',name,e.message);}}process.exitCode=n?1:0;})();
