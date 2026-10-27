const test=require('node:test');const assert=require('node:assert/strict');
const {stocktakeResult}=require('./stocktake');
const assets=[{id:'a',serial_number:'MRZ-MC-M1-26-1001',manufacturer_serial:'Factory-1',status:'Available',updated_at:'one'},{id:'b',serial_number:'MRZ-MC-M1-26-1002',status:'Faulty',updated_at:'one'}];
test('stocktake resolves serials and manufacturer identities without changing assets',()=>{
  const result=stocktakeResult(assets,[' factory-1 ','unknown']);
  assert.deepEqual(result.matched,['a']);assert.deepEqual(result.missing,['b']);assert.deepEqual(result.unexpected,['unknown']);
  assert.equal(result.details.matched[0].serial_number,assets[0].serial_number);assert.equal(assets[0].status,'Available');
  assert.notEqual(result.snapshot,stocktakeResult([{...assets[0],updated_at:'two'},assets[1]],[' factory-1 ','unknown']).snapshot);
});
test('stocktake rejects duplicate aliases, ambiguous identities and malformed lists',()=>{
  assert.throws(()=>stocktakeResult(assets,['a','FACTORY-1']),/Duplicate physical/);
  assert.throws(()=>stocktakeResult([...assets,{id:'c',manufacturer_serial:'Factory-1'}],[]),/ambiguous/);
  assert.throws(()=>stocktakeResult(assets,[{}]),/at most 5000/);
});
