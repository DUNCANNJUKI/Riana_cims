const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const vm=require('node:vm');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/utils/calendarRanges.ts'),'utf8');const context={exports:{},require};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
const {calendarRangeIntersects}=context.exports;
test('calendar ranges retain single-day assignments without mutating date boundaries',()=>{
  assert.equal(calendarRangeIntersects('2030-01-02',null,'2030-01-02','2030-01-02'),true);
  assert.equal(calendarRangeIntersects('2030-01-02',null,'2030-01-03','2030-01-03'),false);
});
test('calendar includes cross-month spans and rejects invalid historical ranges without rewriting them',()=>{
  assert.equal(calendarRangeIntersects('2030-01-30','2030-02-03','2030-02-01','2030-02-28'),true);
  assert.equal(calendarRangeIntersects('2030-02-05','2030-02-03','2030-02-01','2030-02-28'),false);
  assert.equal(calendarRangeIntersects('2030-02-30',null,'2030-02-01','2030-02-28'),false);
});
