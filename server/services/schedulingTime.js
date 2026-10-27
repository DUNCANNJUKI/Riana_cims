const {Temporal}=require('@js-temporal/polyfill');

function scheduleError(code,message,status=400){return Object.assign(new Error(message),{code,status});}
function zone(value='Africa/Nairobi'){
  if(typeof value!=='string' || value.length>100 || /^[+-]/.test(value))throw scheduleError('SCHEDULE_POLICY_VIOLATION','Select a valid IANA scheduling time zone.');
  try{new Intl.DateTimeFormat('en',{timeZone:value}).format();return value;}catch{throw scheduleError('SCHEDULE_POLICY_VIOLATION','Select a valid IANA scheduling time zone.');}
}
function dateOnly(value){
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))throw scheduleError('SCHEDULE_POLICY_VIOLATION','Enter a date in YYYY-MM-DD format.');
  try{return Temporal.PlainDate.from(value,{overflow:'reject'}).toString();}catch{throw scheduleError('SCHEDULE_POLICY_VIOLATION','Enter a valid calendar date.');}
}
const nowInstant=(now=new Date())=>Temporal.Instant.from(now instanceof Date?now.toISOString():String(now));
const dayInZone=(now=new Date(),timeZone='Africa/Nairobi')=>nowInstant(now).toZonedDateTimeISO(zone(timeZone)).toPlainDate().toString();
function instant(value,timeZone='Africa/Nairobi'){
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value))throw scheduleError('SCHEDULE_POLICY_VIOLATION','Enter a valid ISO date and time.');
  try{
    const text=value.replace(' ','T');
    if(/Z$|[+-]\d{2}:\d{2}$/.test(text))return Temporal.Instant.from(text);
    return Temporal.PlainDateTime.from(text,{overflow:'reject'}).toZonedDateTime(zone(timeZone),{disambiguation:'reject'}).toInstant();
  }catch{throw scheduleError('SCHEDULE_POLICY_VIOLATION','This local time is invalid or ambiguous. Choose another time or supply an explicit UTC offset.');}
}
const sqlTime=(value)=>{
  const text=Temporal.Instant.from(value.toString()).toString({smallestUnit:'microsecond'});
  if(!/^\d{4}-/.test(text))throw scheduleError('SCHEDULE_POLICY_VIOLATION','The interval exceeds the supported database calendar range.');
  return text.replace('T',' ').replace('Z','');
};
const fromSql=(value)=>value instanceof Date?value.toISOString():String(value).replace(' ','T')+'Z';
const localTime=(value,timeZone)=>Temporal.Instant.from(value.toString()).toZonedDateTimeISO(zone(timeZone)).toPlainDateTime();
function validatePolicy(input={}){
  if(!input || typeof input!=='object' || Array.isArray(input) || JSON.stringify(input).length>20000)throw scheduleError('SCHEDULE_POLICY_VIOLATION','Supply a valid scheduling policy.');
  const allowed=new Set(['time_zone','working_days','working_hours','holidays','minimum_notice_minutes','buffer_minutes','maximum_horizon_days','reminder_minutes','overdue_minutes']);
  if(Object.keys(input).some(key=>!allowed.has(key)))throw scheduleError('SCHEDULE_POLICY_VIOLATION','Unknown scheduling policy setting.');
  const result={...input};if(input.time_zone!==undefined)result.time_zone=zone(input.time_zone);
  for(const field of ['minimum_notice_minutes','buffer_minutes','overdue_minutes','maximum_horizon_days'])if(input[field]!==undefined && input[field]!==null && (!Number.isInteger(input[field]) || input[field]<0 || input[field]>525600))throw scheduleError('SCHEDULE_POLICY_VIOLATION',`${field} must be a non-negative whole number.`);
  for(const [field,limit] of [['working_days',6],['reminder_minutes',525600]])if(input[field]!==undefined && (!Array.isArray(input[field]) || input[field].length>30 || input[field].some(n=>!Number.isInteger(n)||n<0||n>limit)))throw scheduleError('SCHEDULE_POLICY_VIOLATION',`Invalid ${field}.`);
  if(input.holidays!==undefined){if(!Array.isArray(input.holidays)||input.holidays.length>1000)throw scheduleError('SCHEDULE_POLICY_VIOLATION','Invalid holiday dates.');input.holidays.forEach(dateOnly);}
  if(input.working_hours!==undefined && input.working_hours!==null){
    const h=input.working_hours;
    if(!h || typeof h!=='object' || !/^\d{2}:\d{2}$/.test(h.start)||!/^\d{2}:\d{2}$/.test(h.end)||h.start>=h.end)throw scheduleError('SCHEDULE_POLICY_VIOLATION','Working hours need a start before the end.');
    try{Temporal.PlainTime.from(h.start,{overflow:'reject'});Temporal.PlainTime.from(h.end,{overflow:'reject'});}catch{throw scheduleError('SCHEDULE_POLICY_VIOLATION','Invalid working hours.');}
  }
  return result;
}
function validateWindow({start,end,timeZone='Africa/Nairobi',policy={},now=new Date(),override=false}){
  const startInstant=instant(start,timeZone),endInstant=instant(end,timeZone),current=nowInstant(now);
  if(Temporal.Instant.compare(endInstant,startInstant)<=0)throw scheduleError('SCHEDULE_END_BEFORE_START','Scheduled end must be after the start.');
  const lead=policy.minimum_notice_minutes || 0;
  if(Number(startInstant.epochMilliseconds)<=Number(current.epochMilliseconds)+lead*60000)throw scheduleError(lead?'SCHEDULE_MINIMUM_NOTICE_REQUIRED':'SCHEDULE_TIME_EXPIRED',lead?`Choose a start at least ${lead} minutes in the future.`:'The selected time has passed. Choose a future start.');
  if(policy.maximum_horizon_days && Number(startInstant.epochMilliseconds)>Number(current.epochMilliseconds)+policy.maximum_horizon_days*86400000)throw scheduleError('SCHEDULE_POLICY_VIOLATION','The start exceeds the configured scheduling horizon.');
  if(!override && (policy.working_days || policy.working_hours || policy.holidays?.length)){
    const first=localTime(startInstant,timeZone),last=localTime(endInstant.subtract({nanoseconds:1}),timeZone);
    let day=first.toPlainDate(),endDay=last.toPlainDate(),count=0;
    while(Temporal.PlainDate.compare(day,endDay)<=0){
      if(++count>3660)throw scheduleError('SCHEDULE_POLICY_VIOLATION','Split this long activity into smaller bookings.');
      if(policy.holidays?.includes(day.toString()))throw scheduleError('SCHEDULE_POLICY_VIOLATION','The selected interval includes a configured closure date.');
      if(policy.working_days && !policy.working_days.includes(day.dayOfWeek%7))throw scheduleError('SCHEDULE_OUTSIDE_WORKING_HOURS','The selected interval includes a non-working day.');
      if(policy.working_hours){
        const open=day.toPlainDateTime(policy.working_hours.start),close=day.toPlainDateTime(policy.working_hours.end);
        const segmentStart=Temporal.PlainDate.compare(day,first.toPlainDate())===0?first:day.toPlainDateTime();
        const segmentEnd=Temporal.PlainDate.compare(day,last.toPlainDate())===0?localTime(endInstant,timeZone):day.add({days:1}).toPlainDateTime();
        if(Temporal.PlainDateTime.compare(segmentStart,open)<0 || Temporal.PlainDateTime.compare(segmentEnd,close)>0)throw scheduleError('SCHEDULE_OUTSIDE_WORKING_HOURS','The selected interval falls outside configured working hours.');
      }
      day=day.add({days:1});
    }
  }
  return {start:startInstant,end:endInstant};
}
module.exports={Temporal,scheduleError,zone,dateOnly,instant,sqlTime,fromSql,dayInZone,localTime,validatePolicy,validateWindow};
