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

  return {includedSplits,isFoodRow};
});
