const test=require('node:test');const assert=require('node:assert/strict');
const {dayInNairobi,validatePlanningDates}=require('./planningDates');
const now=new Date('2026-10-15T22:05:00Z');
test('future planning dates use Nairobi day and preserve unchanged historical values',()=>{
  assert.equal(dayInNairobi(now),'2026-10-16');
  assert.throws(()=>validatePlanningDates({scheduled_end_date:'2026-10-15'},{},{scheduled_end_date:'date'},now),/past scheduling/);
  validatePlanningDates({scheduled_end_date:'2026-10-16'},{},{scheduled_end_date:'date'},now);
  validatePlanningDates({scheduled_end_date:'2020-01-01'},{scheduled_end_date:'2020-01-01'},{scheduled_end_date:'date'},now);
  validatePlanningDates({completion_date:'2020-01-01'},{},{scheduled_end_date:'date'},now);
  assert.throws(()=>validatePlanningDates({scheduled_end_date:'2026-02-30'},{},{scheduled_end_date:'date'},now),/valid date/);
});
test('datetime planning accepts timezone-aware equivalence and rejects newly past times',()=>{
  assert.throws(()=>validatePlanningDates({expires_at:'2026-10-16T01:05'},{},{expires_at:'datetime'},now),/current time/);
  validatePlanningDates({expires_at:'2026-10-16T01:06'},{},{expires_at:'datetime'},now);
  assert.throws(()=>validatePlanningDates({expires_at:'2026-10-16T01:04'},{},{expires_at:'datetime'},now),/current time/);
  validatePlanningDates({expires_at:'2020-01-01T03:00'},{expires_at:new Date('2020-01-01T00:00:00Z')},{expires_at:'datetime'},now);
  for(const value of ['2027-99-01T00:00','2027-02-30T00:00','2027-01-01T24:00',0,[]])assert.throws(()=>validatePlanningDates({expires_at:value},{},{expires_at:'datetime'},now),/valid/);
  assert.throws(()=>validatePlanningDates({installation_start_date:'2026-10-20',scheduled_end_date:'2026-10-19'},{},{installation_start_date:'date',scheduled_end_date:'date'},now),/precede/);
});
