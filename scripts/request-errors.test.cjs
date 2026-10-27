const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/utils/requestErrors.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const context={exports:{}};
vm.runInNewContext(compiled,context);
const {friendlyRequestError,connectionErrorMessage}=context.exports;
test('server failures never expose SQL, paths or technical responses',()=>{
  for(const payload of [{error:'ER_BAD_FIELD_ERROR SELECT password FROM users'}, {error:'Unexpected failure'}, '<html>error</html>',null])
    assert.match(friendlyRequestError(500,payload),/temporarily unavailable/);
  assert.doesNotMatch(friendlyRequestError(400,{error:'SQLSTATE ER_BAD_FIELD_ERROR'}),/SQLSTATE|ER_/);
});
test('validation and maintenance notices survive while generic errors are actionable',()=>{
  assert.equal(friendlyRequestError(409,{error:'Serial is already assigned.'}),'Serial is already assigned.');
  assert.equal(friendlyRequestError(503,{code:'MAINTENANCE_MODE',message:'Scheduled maintenance until 6 PM.'}),'Scheduled maintenance until 6 PM.');
  for(const status of [401,403,404,409,429])assert.ok(friendlyRequestError(status,{}).length>20);
  assert.match(connectionErrorMessage,/check whether it was saved/);
});
