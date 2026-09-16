(function(root, factory){
  const api=factory();
  if(typeof module!=="undefined" && module.exports) module.exports=api;
  if(root) root.HSFM_FOOD_SCOPE=api;
})(typeof window!=="undefined"?window:globalThis,function(){
  const clean=value=>String(value??"").trim();
  const includedSplits=splits=>(splits||[]).filter(row=>clean(row.include_in_food||"Y").toUpperCase()!=="N");

  function isFoodRow(row, occurrenceRule=null, splits=[]){
    if((splits||[]).length) return includedSplits(splits).length>0;
    const override=clean(occurrenceRule?.food_override||row?.food_override).toUpperCase();
    if(override==="Y") return true;
    if(override==="N") return false;
    return clean(row?.source_category||row?.category)==="식품";
  }

  function foodTitleCandidate(title){
    const s=clean(title).replace(/\s+/g,"");
    if(/샴푸|세제|향수|화장품|크림|청소기|마사지|프라이팬|냄비|색상|무늬/.test(s)) return false;
    return /사과|복숭아|추어탕|갈비|불고기|김치|삼계탕|곰탕|단백질|프로틴|유산균|홍삼|흑염소|오메가|비타민|콜라겐|견과|고춧가루|고추가루|전복|장어|고등어|굴비|쌀|잡곡|만두|떡갈비|돈까스|돈가스|스테이크/.test(s);
  }
  return {includedSplits,isFoodRow,foodTitleCandidate};
});

