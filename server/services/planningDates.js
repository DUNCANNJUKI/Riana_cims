const {fail}=require('./hardwarePolicy');
const T=require('./schedulingTime');
const dayInNairobi=(now=new Date())=>{
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map((p)=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
function validatePlanningDates(body,previous,fields,now=new Date(),timeZone='Africa/Nairobi'){
  for(const [field,type] of Object.entries(fields)){
    const value=body[field];if(value===undefined || value===null || value==='')continue;
    if(typeof value!=='string')fail(`${field}: enter a valid scheduling date.`);
    const text=String(value);const old=previous?.[field];
    const oldText=old instanceof Date ? (type==='date'?dayInNairobi(old):old.toISOString()) : String(old || '');
    if(type==='date'){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text)) || new Date(text).toISOString().slice(0,10)!==text)fail(`${field}: enter a valid date.`);
      if(text===oldText || text===oldText.slice(0,10))continue;
      if(text<T.dayInZone(now,timeZone))throw T.scheduleError('SCHEDULE_DATE_IN_PAST',`${field}: past scheduling dates are not allowed.`);
    }else{
      if(!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(text) || Number.isNaN(Date.parse(text.slice(0,10))) || new Date(`${text.slice(0,10)}T00:00:00Z`).toISOString().slice(0,10)!==text.slice(0,10) || Number(text.slice(11,13))>23 || Number(text.slice(14,16))>59)fail(`${field}: enter a valid date/time.`);
      const scheduled=T.instant(text,timeZone);
      if(oldText){try{if(Math.floor(Number(scheduled.epochMilliseconds)/60000)===Math.floor(Number(T.instant(oldText,timeZone).epochMilliseconds)/60000))continue;}catch{}}
      if(Number(scheduled.epochMilliseconds)<=now.getTime())throw T.scheduleError('SCHEDULE_TIME_EXPIRED',`${field}: the current time has passed; select a future date/time.`);
    }
  }
  const start=body.installation_start_date ?? previous?.installation_start_date;
  const end=body.scheduled_end_date ?? previous?.scheduled_end_date;
  const dateText=(value)=>value instanceof Date?dayInNairobi(value):String(value).slice(0,10);
  if(start && end && (body.installation_start_date!==undefined || body.scheduled_end_date!==undefined) && dateText(end)<dateText(start))fail('Scheduled end must not precede the installation start.');
}
function planningDateMiddleware(pool){return async(req,res,next)=>{
  if(!['POST','PATCH','PUT'].includes(req.method))return next();
  const routes=[
    [/^\/installations(?:\/([^/]+))?$/,'installations',{scheduled_end_date:'date'}],
    [/^\/client_assignments(?:\/([^/]+))?$/,'client_assignments',{installation_start_date:'date',scheduled_end_date:'date'}],
    [/^\/announcements(?:\/([^/]+))?$/,'announcements',{expires_at:'datetime'}],
    [/^\/crms\/change_requests(?:\/([^/]+))?$/,'crms_change_requests',{estimated_completion_date:'date'}],
    [/^\/(?:admin\/maintenance-mode|companies)$/,'company_settings',{estimated_completion:'datetime'}],
  ];
  const route=routes.find(([pattern])=>pattern.test(req.path));if(!route || !Object.keys(route[2]).some((field)=>Object.hasOwn(req.body || {},field)))return next();
  try{
    const match=route[0].exec(req.path);let previous={};
    if(req.method!=='POST'){
      const casts=Object.entries(route[2]).filter(([,type])=>type==='date').map(([field])=>`CAST(\`${field}\` AS CHAR) AS \`${field}\``);
      const [rows]=await pool.query(`SELECT *${casts.length?','+casts.join(','):''} FROM \`${route[1]}\` ${match[1]?'WHERE id=?':''} LIMIT 1`,match[1]?[match[1]]:[]);previous=rows[0] || {};
    }
    const [[organization]]=await pool.query('SELECT timezone FROM company_settings LIMIT 1');
    let timeZone=organization?.timezone || 'Africa/Nairobi';
    if(process.env.SCHEDULING_ENABLED==='true'){
      const clientId=req.body.client_id || previous.client_id;
      const [[client]]=clientId?await pool.query('SELECT subsidiary_id FROM clients WHERE id=?',[clientId]):[[]];
      const policy=await require('./scheduling').createScheduling(pool).policy(pool,client?.subsidiary_id || req.user?.subsidiary_id,req.body.branch_id || previous.branch_id);
      timeZone=policy.time_zone;
    }
    validatePlanningDates(req.body,previous,route[2],new Date(),T.zone(timeZone));next();
  }catch(error){res.status(error.status || 500).json({error:error.status?error.message:'Unable to validate scheduling dates.',code:error.code});}
};}
module.exports={dayInNairobi,validatePlanningDates,planningDateMiddleware};
