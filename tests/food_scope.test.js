const assert=require("node:assert/strict");
const scope=require("../dashboard/food_scope.js");

assert.equal(scope.isFoodRow({source_category:"식품"}),true);
assert.equal(scope.isFoodRow({source_category:"생활/건강"}),false);
assert.equal(scope.isFoodRow({source_category:"생활/건강"},{food_override:"Y"}),true);
assert.equal(scope.isFoodRow({source_category:"식품"},{food_override:"N"}),false);

const mixed=[
  {standard_product_name:"마사지건",include_in_food:"N",sales_amt:"8730000"},
  {standard_product_name:"LA갈비",include_in_food:"Y",sales_amt:"16860000"},
];
assert.equal(scope.isFoodRow({source_category:"생활/건강"},null,mixed),true);
assert.deepEqual(scope.includedSplits(mixed).map(x=>x.standard_product_name),["LA갈비"]);

console.log("food_scope tests passed");

