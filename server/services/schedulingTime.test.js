const test=require('node:test');const assert=require('node:assert/strict');
const T=require('./schedulingTime');
const now=new Date('2030-01-01T08:00:00Z');
test('scheduling uses exact server instants, strict starts and valid half-open intervals',()=>{
  for(const start of ['2030-01-01T08:00:00Z','2029-12-31T23:59:00Z'])assert.throws(()=>T.validateWindow({start,end:'2030-01-02T10:00Z',now}),e=>e.code==='SCHEDULE_TIME_EXPIRED');
  T.validateWindow({start:'2030-01-01T12:00',end:'2030-01-03T12:00',timeZone:'Africa/Nairobi',now});
  assert.throws(()=>T.validateWindow({start:'2030-01-02T09:00Z',end:'2030-01-02T09:00Z',now}),e=>e.code==='SCHEDULE_END_BEFORE_START');
  assert.equal(T.dayInZone(new Date('2030-01-01T22:30Z'),'Africa/Nairobi'),'2030-01-02');
  assert.throws(()=>T.dateOnly('2030-02-29'));
  assert.equal(T.dateOnly('2032-02-29'),'2032-02-29');
});
test('DST gaps and ambiguous local times fail; explicit offsets select a specific instant',()=>{
  assert.throws(()=>T.instant('2030-03-10T02:30','America/New_York'),/invalid or ambiguous/);
  assert.throws(()=>T.instant('2030-11-03T01:30','America/New_York'),/invalid or ambiguous/);
  assert.equal(T.instant('2030-11-03T01:30-04:00','America/New_York').toString(),'2030-11-03T05:30:00Z');
});
test('business calendars apply lead time, closures and hours but never ban weekends globally',()=>{
  const window={start:'2030-01-05T09:00Z',end:'2030-01-05T10:00Z',timeZone:'UTC',now};
  T.validateWindow(window);
  assert.throws(()=>T.validateWindow({...window,policy:{holidays:['2030-01-05']}}),/closure/);
  assert.throws(()=>T.validateWindow({...window,policy:{working_days:[1,2,3,4,5]}}),/non-working/);
  assert.throws(()=>T.validateWindow({...window,policy:{working_hours:{start:'10:00',end:'17:00'}}}),/working hours/);
  T.validateWindow({...window,policy:{working_days:[1]},override:true});
  assert.throws(()=>T.validateWindow({start:'2030-01-01T08:10Z',end:'2030-01-01T09:00Z',policy:{minimum_notice_minutes:30},now}),/30 minutes/);
  assert.throws(()=>T.validatePolicy({working_hours:{start:'25:00',end:'26:00'}}));
  assert.throws(()=>T.validatePolicy({override:true}));
});
