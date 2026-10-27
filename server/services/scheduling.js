const crypto=require('node:crypto');
const {RRule}=require('rrule');
const {hasCapability}=require('../security/accessControl');
const T=require('./schedulingTime');
const parse=(value)=>typeof value==='string'?JSON.parse(value):value;
const active="e.status IN ('scheduled','in_progress')";
const identifier=(value)=>typeof value==='string' && /^[A-Za-z0-9-]{1,36}$/.test(value);
const fail=T.scheduleError;
// Legacy UUID columns were created with mixed collations. Scheduling must not
// depend on the database default when it joins those parent records.
const uuidEquals=(left,right)=>`CONVERT(${left} USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(${right} USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
function createScheduling(pool,{clock=()=>new Date()}={}){
  const allowed=(user,write=false)=>{
    if(!user || !hasCapability(user,write?'assignments.manage':'assignments.view') && !( !write && hasCapability(user,'installations.view')))
      throw fail('SCHEDULE_PERMISSION_DENIED','You do not have scheduling permission.',403);
  };
  const scope=(user,subsidiary)=>{
    if(!identifier(subsidiary))throw fail('SCHEDULE_POLICY_VIOLATION','Select an owning subsidiary.');
    if(user.role!=='SuperAdmin' && user.subsidiary_id!==subsidiary)throw fail('SCHEDULE_PERMISSION_DENIED','Scheduling is restricted to your subsidiary.',403);
  };
  async function policy(db,subsidiary,branch){
    if(branch){const [[owner]]=await db.query(`SELECT c.subsidiary_id FROM client_branches b JOIN clients c ON ${uuidEquals('c.id','b.client_id')} WHERE b.id=?`,[branch]);if(owner){if(subsidiary&&subsidiary!==owner.subsidiary_id)throw fail('SCHEDULE_PERMISSION_DENIED','Branch does not belong to this subsidiary.',403);subsidiary=owner.subsidiary_id;}}
    const [[organization]]=await db.query('SELECT timezone FROM company_settings LIMIT 1');
    const keys=['organization',...(subsidiary?[`subsidiary:${subsidiary}`]:[]),...(branch?[`branch:${branch}`]:[])];
    const [rows]=await db.query('SELECT * FROM scheduling_policies WHERE scope_key IN (?)',[keys]);
    let result={time_zone:organization?.timezone || 'Africa/Nairobi',minimum_notice_minutes:0,buffer_minutes:0,reminder_minutes:[1440,120,30,0],overdue_minutes:0};
    for(const key of keys){const row=rows.find(row=>row.scope_key===key);if(row)result={...result,...parse(row.configuration)};}
    return T.validatePolicy(result);
  }
  async function context(db,user,body){
    scope(user,body.subsidiary_id);
    for(const field of ['branch_id','activity_id'])if(body[field]!==undefined&&body[field]!==null&&body[field]!==''&&!identifier(body[field]))throw fail('SCHEDULE_POLICY_VIOLATION',`Invalid ${field}.`);
    if(body.time_zone!==undefined&&typeof body.time_zone!=='string')throw fail('SCHEDULE_POLICY_VIOLATION','Select a valid scheduling time zone.');
    if(body.reason!==undefined&&(typeof body.reason!=='string'||body.reason.length>500))throw fail('SCHEDULE_POLICY_VIOLATION','Change reasons must be text up to 500 characters.');
    const [[owner]]=await db.query('SELECT id FROM subsidiaries WHERE id=?',[body.subsidiary_id]);
    if(!owner)throw fail('SCHEDULE_POLICY_VIOLATION','Subsidiary not found.');
    if(body.branch_id){
      if(!identifier(body.branch_id))throw fail('SCHEDULE_POLICY_VIOLATION','Invalid branch.');
      const [[branch]]=await db.query(`SELECT b.id FROM client_branches b JOIN clients c ON ${uuidEquals('c.id','b.client_id')} WHERE b.id=? AND c.subsidiary_id=? AND b.deleted_at IS NULL`,[body.branch_id,body.subsidiary_id]);
      if(!branch)throw fail('SCHEDULE_PERMISSION_DENIED','Branch is not available in this subsidiary.',403);
    }
    if(!['installation','maintenance','task','follow_up','leave','appointment'].includes(body.activity_type))throw fail('SCHEDULE_POLICY_VIOLATION','Select a valid activity type.');
    if(body.activity_id){
      if(body.activity_type!=='installation' || !identifier(body.activity_id))throw fail('SCHEDULE_POLICY_VIOLATION','Only installation references are supported for this activity.');
      const [[installation]]=await db.query(`SELECT i.id FROM installations i JOIN clients c ON ${uuidEquals('c.id','i.client_id')} WHERE i.id=? AND c.subsidiary_id=?`,[body.activity_id,body.subsidiary_id]);
      if(!installation)throw fail('SCHEDULE_PERMISSION_DENIED','Installation is not available in this subsidiary.',403);
    }
    const resolved=await policy(db,body.subsidiary_id,body.branch_id);
    const timeZone=T.zone(body.time_zone || resolved.time_zone);
    const resourceIds=body.resource_ids;
    if(!Array.isArray(resourceIds) || resourceIds.length>20 || resourceIds.some(id=>!identifier(id)) || new Set(resourceIds).size!==resourceIds.length)throw fail('SCHEDULE_POLICY_VIOLATION','Select valid, distinct technician IDs.');
    if(typeof body.title!=='string'||!body.title.trim()||body.title.length>160)throw fail('SCHEDULE_POLICY_VIOLATION','Enter an activity title up to 160 characters.');
    const override=Boolean(body.override_reason);
    if(override && (user.role!=='SuperAdmin' || typeof body.override_reason!=='string'||body.override_reason.trim().length<5||body.override_reason.length>500))throw fail('SCHEDULE_PERMISSION_DENIED','Only SuperAdmin can override business hours or closures, with a reason.',403);
    return {resolved,timeZone,resourceIds:[...resourceIds].sort(),override};
  }
  async function lockResources(db,ids,subsidiary,validateIds=ids){
    if(!ids.length)return;
    const [rows]=await db.query('SELECT id,subsidiary_id,is_active FROM user_profiles WHERE id IN (?) ORDER BY id FOR UPDATE',[ids]);
    const selected=rows.filter(r=>validateIds.includes(r.id));
    if(selected.length!==validateIds.length || selected.some(r=>!r.is_active || r.subsidiary_id!==subsidiary))throw fail('SCHEDULE_PERMISSION_DENIED','A selected technician is unavailable or outside this subsidiary.',403);
  }
  async function conflicts(db,ids,start,end,buffer,exclude=null,legacyExclude=null){
    if(!ids.length)return;
    const startMs=Number(start.epochMilliseconds),endMs=Number(end.epochMilliseconds);
    // Current reads are essential after waiting for a technician lock under REPEATABLE READ.
    const [rows]=await db.query(`SELECT e.id FROM scheduling_events e JOIN scheduling_resources r ON r.event_id=e.id WHERE r.user_id IN (?) AND ${active} AND (? IS NULL OR e.id<>?) AND e.start_utc < ? AND DATE_ADD(e.end_utc,INTERVAL e.buffer_minutes MINUTE)>? LIMIT 1 FOR UPDATE`,[ids,exclude,exclude,T.sqlTime(T.Temporal.Instant.fromEpochMilliseconds(endMs+buffer*60000)),T.sqlTime(T.Temporal.Instant.fromEpochMilliseconds(startMs-buffer*60000))]);
    if(rows.length)throw fail('SCHEDULE_RESOURCE_CONFLICT','A selected technician is already booked for this interval.',409);
    // Legacy dates have no time precision. Reserve the complete UTC-expanded day range conservatively.
    const [legacy]=await db.query(`SELECT a.id,a.branch_id,c.subsidiary_id,CAST(a.installation_start_date AS CHAR) start_day,CAST(COALESCE(a.scheduled_end_date,a.installation_start_date) AS CHAR) end_day FROM client_assignments a JOIN clients c ON ${uuidEquals('c.id','a.client_id')} WHERE (a.hardware_technician_id IN (?) OR a.software_technician_id IN (?)) AND a.status NOT IN ('completed','cancelled','canceled') AND a.installation_start_date IS NOT NULL AND (? IS NULL OR a.id<>?) AND a.installation_start_date<=DATE_ADD(DATE(?),INTERVAL 1 DAY) AND COALESCE(a.scheduled_end_date,a.installation_start_date)>=DATE_SUB(DATE(?),INTERVAL 1 DAY) FOR UPDATE`,[ids,ids,legacyExclude,legacyExclude,T.sqlTime(end),T.sqlTime(start)]);
    for(const row of legacy){
      const p=await policy(db,row.subsidiary_id,row.branch_id);
      const legacyStart=T.instant(row.start_day+'T00:00',p.time_zone);
      const legacyEnd=T.instant(T.Temporal.PlainDate.from(row.end_day).add({days:1}).toString()+'T00:00',p.time_zone);
      if(startMs-buffer*60000<Number(legacyEnd.epochMilliseconds)+(p.buffer_minutes||0)*60000 && Number(legacyStart.epochMilliseconds)<endMs+buffer*60000)
        throw fail('SCHEDULE_RESOURCE_CONFLICT','A selected technician has a date-only legacy assignment during this interval. Review its dates before booking.',409);
    }
  }
  const output=(row)=>({...row,start_utc:T.fromSql(row.start_utc),end_utc:T.fromSql(row.end_utc),created_at:T.fromSql(row.created_at),updated_at:T.fromSql(row.updated_at),policy_snapshot:parse(row.policy_snapshot)});
  async function history(db,user,id,before,after,reason){await db.query('INSERT INTO scheduling_history (id,event_id,actor_id,reason,previous_values,next_values,created_at) VALUES (?,?,?,?,?,?,?)',[crypto.randomUUID(),id,user.id,reason, before?JSON.stringify(before):null,JSON.stringify(after),T.sqlTime(T.Temporal.Instant.from(clock().toISOString()))]);}
  async function jobs(db,event,ids){
    await db.query("UPDATE scheduling_jobs SET state='cancelled' WHERE event_id=? AND state IN ('pending','failed')",[event.id]);
    const p=parse(event.policy_snapshot),start=T.instant(T.fromSql(event.start_utc),'UTC'),end=T.instant(T.fromSql(event.end_utc),'UTC');
    for(const userId of ids){
      const definitions=event.status==='cancelled'?[['cancelled',clock()]]:event.status==='completed'?[]:[
        ['changed',clock()],...(p.reminder_minutes || []).map(minutes=>['reminder',new Date(Number(start.epochMilliseconds)-minutes*60000)]),
        ['overdue',new Date(Number(end.epochMilliseconds)+(p.overdue_minutes || 0)*60000)],
      ];
      for(let index=0;index<definitions.length;index++){
        const [kind,due]=definitions[index];if(kind==='reminder' && due.getTime()<clock().getTime())continue;
        await db.query('INSERT IGNORE INTO scheduling_jobs (id,event_id,event_version,user_id,kind,due_utc) VALUES (?,?,?,?,?,?)',[`${event.id}:${event.version}:${userId}:${index}`,event.id,event.version,userId,kind,T.sqlTime(T.Temporal.Instant.from(due.toISOString()))]);
      }
    }
  }
  async function transaction(work){const db=await pool.getConnection();try{await db.beginTransaction();const result=await work(db);await db.commit();return result;}catch(error){await db.rollback();throw error;}finally{db.release();}}
  async function list(user,query={}){
    allowed(user);const where=['1=1'],args=[];
    if(user.role!=='SuperAdmin'){scope(user,user.subsidiary_id);where.push('e.subsidiary_id=?');args.push(user.subsidiary_id);}
    if(query.subsidiary_id){scope(user,query.subsidiary_id);where.push('e.subsidiary_id=?');args.push(query.subsidiary_id);}
    if(query.branch_id){if(!identifier(query.branch_id))throw fail('SCHEDULE_POLICY_VIOLATION','Invalid branch.');where.push('e.branch_id=?');args.push(query.branch_id);}
    if(user.role==='User'){where.push('EXISTS(SELECT 1 FROM scheduling_resources own WHERE own.event_id=e.id AND own.user_id=?)');args.push(user.id);}
    if(query.technician_id){if(!identifier(query.technician_id))throw fail('SCHEDULE_POLICY_VIOLATION','Invalid technician.');where.push('EXISTS(SELECT 1 FROM scheduling_resources own WHERE own.event_id=e.id AND own.user_id=?)');args.push(query.technician_id);}
    const filterZone=T.zone(query.time_zone || 'UTC');
    if(query.from){where.push('e.end_utc>=?');args.push(T.sqlTime(T.instant(query.from.length===10?T.dateOnly(query.from)+'T00:00':query.from,filterZone)));}
    if(query.to){where.push('e.start_utc<?');args.push(T.sqlTime(T.instant(query.to.length===10?T.Temporal.PlainDate.from(T.dateOnly(query.to)).add({days:1}).toString()+'T00:00':query.to,filterZone)));}
    const page=Number(query.page||1);if(!Number.isInteger(page)||page<1||page>100000)throw fail('SCHEDULE_POLICY_VIOLATION','Invalid calendar page.');
    const [rows]=await pool.query(`SELECT e.*,CAST(e.start_utc AS CHAR) start_utc,CAST(e.end_utc AS CHAR) end_utc,CAST(e.created_at AS CHAR) created_at,CAST(e.updated_at AS CHAR) updated_at,(SELECT GROUP_CONCAT(r.user_id ORDER BY r.user_id) FROM scheduling_resources r WHERE r.event_id=e.id) resource_ids FROM scheduling_events e WHERE ${where.join(' AND ')} ORDER BY e.start_utc,e.id LIMIT 100 OFFSET ?`,[...args,(page-1)*100]);
    const [[count]]=await pool.query(`SELECT COUNT(*) total,SUM(${active} AND e.end_utc<?) overdue FROM scheduling_events e WHERE ${where.join(' AND ')}`,[T.sqlTime(T.Temporal.Instant.from(clock().toISOString())),...args]);
    return {rows:rows.map(r=>({...output(r),resource_ids:(r.resource_ids||'').split(',').filter(Boolean),indicator:['scheduled','in_progress'].includes(r.status)&&T.instant(T.fromSql(r.end_utc),'UTC').epochMilliseconds<clock().getTime()?'overdue':r.status})),total:Number(count.total),overdue:Number(count.overdue||0),page};
  }
  async function save(user,body,{id=null,key}={}){
    allowed(user,true);
    if(!body||typeof body!=='object'||Array.isArray(body))throw fail('SCHEDULE_POLICY_VIOLATION','Supply a scheduling object.');
    if(!key||typeof key!=='string'||!/^[A-Za-z0-9-]{8,80}$/.test(key))throw fail('SCHEDULE_POLICY_VIOLATION','Supply an Idempotency-Key to protect against duplicate booking.');
    const hash=crypto.createHash('sha256').update(JSON.stringify({id,body})).digest('hex');
    return transaction(async(db)=>{
      await db.query('INSERT IGNORE INTO scheduling_requests (actor_id,request_key,payload_hash) VALUES (?,?,?)',[user.id,key,hash]);
      const [[request]]=await db.query('SELECT * FROM scheduling_requests WHERE actor_id=? AND request_key=? FOR UPDATE',[user.id,key]);
      if(request.payload_hash!==hash)throw fail('SCHEDULE_STALE_VERSION','This request key was used for another change.',409);
      if(request.result)return parse(request.result);
      let before=null;
      if(id){
        const [[row]]=await db.query('SELECT *,CAST(start_utc AS CHAR) start_utc,CAST(end_utc AS CHAR) end_utc FROM scheduling_events WHERE id=? FOR UPDATE',[id]);
        if(!row)throw fail('SCHEDULE_POLICY_VIOLATION','Schedule not found.',404);
        scope(user,row.subsidiary_id);before=row;
        if(body.version!==row.version)throw fail('SCHEDULE_STALE_VERSION','This schedule changed. Reload its latest version before saving.',409);
        if(!['scheduled','in_progress'].includes(row.status))throw fail('SCHEDULE_POLICY_VIOLATION','Completed or cancelled schedules cannot be changed.',409);
        if(typeof body.reason!=='string'||body.reason.trim().length<5||body.reason.length>500)throw fail('SCHEDULE_POLICY_VIOLATION','Enter a change reason (5 to 500 characters).');
      }
      const merged={...before,...body};
      if(before){merged.subsidiary_id=before.subsidiary_id;merged.branch_id=before.branch_id;merged.activity_type=before.activity_type;merged.activity_id=before.activity_id;}
      const [oldResources]=id?await db.query('SELECT user_id FROM scheduling_resources WHERE event_id=?',[id]):[[]];
      merged.resource_ids=body.resource_ids ?? oldResources.map(r=>r.user_id);
      const ctx=await context(db,user,merged);
      const status=body.status || before?.status || 'scheduled';
      if(!['scheduled','in_progress','completed','cancelled'].includes(status))throw fail('SCHEDULE_POLICY_VIOLATION','Invalid scheduling status.');
      await lockResources(db,[...new Set([...ctx.resourceIds,...oldResources.map(r=>r.user_id)])].sort(),merged.subsidiary_id,['scheduled','in_progress'].includes(status)?ctx.resourceIds:[]);
      if(!before && status!=='scheduled')throw fail('SCHEDULE_POLICY_VIOLATION','New activities must be scheduled. Historical events use their existing actual-record workflows.');
      const changed=!before||body.start!==undefined||body.end!==undefined||body.time_zone!==undefined&&body.time_zone!==before.time_zone||JSON.stringify(ctx.resourceIds)!==JSON.stringify(oldResources.map(r=>r.user_id).sort());
      if(before && !changed)ctx.resolved=parse(before.policy_snapshot);
      const start=body.start || (before&&T.fromSql(before.start_utc)),end=body.end || (before&&T.fromSql(before.end_utc));
      const window=changed?T.validateWindow({start,end,timeZone:ctx.timeZone,policy:ctx.resolved,now:clock(),override:ctx.override}):{start:T.instant(start,'UTC'),end:T.instant(end,'UTC')};
      const occurrences=[{start:window.start,end:window.end}];
      let seriesId=before?.series_id || null;
      if(body.recurrence){
        if(before)throw fail('SCHEDULE_POLICY_VIOLATION','Edit one occurrence, or cancel the series and create a replacement.');
        const recurrence=body.recurrence;
        if(Object.keys(recurrence).some(key=>!['frequency','count','interval'].includes(key)))throw fail('SCHEDULE_POLICY_VIOLATION','This release supports count-bounded recurrence; unsupported recurrence options cannot be silently ignored.');
        const freq={daily:RRule.DAILY,weekly:RRule.WEEKLY,monthly:RRule.MONTHLY,quarterly:RRule.MONTHLY,annually:RRule.YEARLY}[recurrence.frequency];
        if(freq===undefined || !Number.isInteger(recurrence.count)||recurrence.count<2||recurrence.count>100||recurrence.interval!==undefined&&(!Number.isInteger(recurrence.interval)||recurrence.interval<1||recurrence.interval>365))throw fail('SCHEDULE_POLICY_VIOLATION','Recurrence needs a valid frequency and 2 to 100 occurrences per batch.');
        const local=T.localTime(window.start,ctx.timeZone);const duration=window.end.epochMilliseconds-window.start.epochMilliseconds;
        const rule=new RRule({freq,interval:recurrence.frequency==='quarterly'?3:(recurrence.interval||1),count:recurrence.count,dtstart:new Date(local.toString()+'Z')});
        occurrences.length=0;seriesId=crypto.randomUUID();
        await db.query('INSERT INTO scheduling_series (id,subsidiary_id,rule_configuration,time_zone,created_by,created_at) VALUES (?,?,?,?,?,?)',[seriesId,merged.subsidiary_id,JSON.stringify(recurrence),ctx.timeZone,user.id,T.sqlTime(T.Temporal.Instant.from(clock().toISOString()))]);
        for(const date of rule.all()){
          const start=T.instant(date.toISOString().replace('Z',''),ctx.timeZone);
          occurrences.push({start,end:T.Temporal.Instant.fromEpochMilliseconds(Number(start.epochMilliseconds)+Number(duration))});
        }
      }
      const ids=[];
      for(const occurrence of occurrences){
        if(['scheduled','in_progress'].includes(status)){
          if(changed)T.validateWindow({start:occurrence.start.toString(),end:occurrence.end.toString(),timeZone:ctx.timeZone,policy:ctx.resolved,now:clock(),override:ctx.override});
          await conflicts(db,ctx.resourceIds,occurrence.start,occurrence.end,ctx.resolved.buffer_minutes||0,id);
        }
        const eventId=id||crypto.randomUUID();const event={id:eventId,subsidiary_id:merged.subsidiary_id,branch_id:merged.branch_id||null,activity_type:merged.activity_type,activity_id:merged.activity_id||null,title:merged.title.trim(),start_utc:T.sqlTime(occurrence.start),end_utc:T.sqlTime(occurrence.end),time_zone:ctx.timeZone,status,version:before?before.version+1:1,buffer_minutes:ctx.resolved.buffer_minutes||0,policy_snapshot:JSON.stringify(ctx.resolved),series_id:seriesId,occurrence_local:seriesId?T.localTime(occurrence.start,ctx.timeZone).toString():null,created_by:before?.created_by||user.id};
        if(id){const keys=Object.keys(event).filter(k=>!['id','created_by'].includes(k));await db.query(`UPDATE scheduling_events SET ${keys.map(k=>`\`${k}\`=?`).join(',')},updated_at=UTC_TIMESTAMP(6) WHERE id=?`,[...keys.map(k=>event[k]),id]);await db.query('DELETE FROM scheduling_resources WHERE event_id=?',[id]);}
        else await db.query('INSERT INTO scheduling_events SET ?',{...event,created_at:T.sqlTime(T.Temporal.Instant.from(clock().toISOString())),updated_at:T.sqlTime(T.Temporal.Instant.from(clock().toISOString()))});
        for(const userId of ctx.resourceIds)await db.query('INSERT INTO scheduling_resources (event_id,user_id) VALUES (?,?)',[eventId,userId]);
        await history(db,user,eventId,before,{...event,business_calendar_override_reason:body.override_reason||null},body.reason||body.override_reason||'Activity scheduled');
        await jobs(db,event,[...new Set([...ctx.resourceIds,...oldResources.map(r=>r.user_id)])]);ids.push(eventId);
      }
      if(changed && ['scheduled','in_progress'].includes(status))for(const occurrence of occurrences)T.validateWindow({start:occurrence.start.toString(),end:occurrence.end.toString(),timeZone:ctx.timeZone,policy:ctx.resolved,now:clock(),override:ctx.override});
      const result={ids,version:before?before.version+1:1};
      await db.query('UPDATE scheduling_requests SET result=? WHERE actor_id=? AND request_key=?',[JSON.stringify(result),user.id,key]);return result;
    });
  }
  async function setPolicy(user,body){
    if(user.role!=='SuperAdmin' && !hasCapability(user,'subsidiaries.manage'))throw fail('SCHEDULE_PERMISSION_DENIED','Scheduling policy management is not permitted.',403);
    const key=body.scope_key;if(typeof key!=='string')throw fail('SCHEDULE_POLICY_VIOLATION','Select a policy scope.');
    if(key==='organization'){if(user.role!=='SuperAdmin')throw fail('SCHEDULE_PERMISSION_DENIED','Only SuperAdmin manages organization defaults.',403);}
    else if(key.startsWith('subsidiary:')){scope(user,key.slice(11));const [[row]]=await pool.query('SELECT id FROM subsidiaries WHERE id=?',[key.slice(11)]);if(!row)throw fail('SCHEDULE_POLICY_VIOLATION','Subsidiary not found.');}
    else if(key.startsWith('branch:')){const [[row]]=await pool.query(`SELECT c.subsidiary_id FROM client_branches b JOIN clients c ON ${uuidEquals('c.id','b.client_id')} WHERE b.id=?`,[key.slice(7)]);if(!row)throw fail('SCHEDULE_POLICY_VIOLATION','Branch not found.');scope(user,row.subsidiary_id);}
    else throw fail('SCHEDULE_POLICY_VIOLATION','Invalid policy scope.');
    const configuration=T.validatePolicy(body.configuration);
    return transaction(async db=>{
      await db.query('INSERT IGNORE INTO scheduling_policies (scope_key,configuration,updated_by,updated_at) VALUES (?,\'{}\',?,UTC_TIMESTAMP(6))',[key,user.id]);
      const [[before]]=await db.query('SELECT * FROM scheduling_policies WHERE scope_key=? FOR UPDATE',[key]);
      if(Number(body.version)!==Number(before.version))throw fail('SCHEDULE_STALE_VERSION','Policy changed. Reload before saving.',409);
      await db.query('UPDATE scheduling_policies SET configuration=?,version=version+1,updated_by=?,updated_at=UTC_TIMESTAMP(6) WHERE scope_key=?',[JSON.stringify(configuration),user.id,key]);
      await db.query('INSERT INTO scheduling_policy_history (id,scope_key,actor_id,previous_values,next_values,created_at) VALUES (?,?,?,?,?,UTC_TIMESTAMP(6))',[crypto.randomUUID(),key,user.id,JSON.stringify(parse(before.configuration)),JSON.stringify(configuration)]);
      return {version:before.version+1};
    });
  }
  async function inspectPolicy(user,query){
    allowed(user);if(query.subsidiary_id)scope(user,query.subsidiary_id);else if(user.role!=='SuperAdmin')query={...query,subsidiary_id:user.subsidiary_id};
    if(query.branch_id){const [[row]]=await pool.query(`SELECT c.subsidiary_id FROM client_branches b JOIN clients c ON ${uuidEquals('c.id','b.client_id')} WHERE b.id=?`,[query.branch_id]);if(!row)throw fail('SCHEDULE_POLICY_VIOLATION','Branch not found.');scope(user,row.subsidiary_id);if(query.subsidiary_id && query.subsidiary_id!==row.subsidiary_id)throw fail('SCHEDULE_PERMISSION_DENIED','Branch does not belong to this subsidiary.',403);}
    const key=query.branch_id?`branch:${query.branch_id}`:query.subsidiary_id?`subsidiary:${query.subsidiary_id}`:'organization';
    const [[stored]]=await pool.query('SELECT version,configuration FROM scheduling_policies WHERE scope_key=?',[key]);
    return {scope_key:key,version:stored?.version||1,configuration:await policy(pool,query.subsidiary_id,query.branch_id),overrides:stored?parse(stored.configuration):{}};
  }
  async function legacyWrite(req,id,before,next,work){
    const changed=!before||['client_id','branch_id','installation_start_date','scheduled_end_date','hardware_technician_id','software_technician_id'].some(k=>Object.hasOwn(req.body,k)&&String(before[k]||'')!==String(next[k]||''));
    if(!changed)return work(pool);
    allowed(req.user,true);
    if(!before && !next.installation_start_date)throw fail('SCHEDULE_POLICY_VIOLATION','Select an installation start date.');
    return transaction(async db=>{
      const [[client]]=await db.query('SELECT subsidiary_id FROM clients WHERE id=?',[next.client_id]);if(!client)throw fail('SCHEDULE_POLICY_VIOLATION','Client not found.');scope(req.user,client.subsidiary_id);
      const ids=[...new Set([next.hardware_technician_id,next.software_technician_id,before?.hardware_technician_id,before?.software_technician_id].filter(Boolean))].sort();
      await lockResources(db,ids,client.subsidiary_id,[...new Set([next.hardware_technician_id,next.software_technician_id].filter(Boolean))]);
      if(next.installation_start_date && !['completed','cancelled','canceled'].includes(next.status)){
        const p=await policy(db,client.subsidiary_id,next.branch_id);
        require('./planningDates').validatePlanningDates(req.body,before||{},{installation_start_date:'date',scheduled_end_date:'date'},clock(),p.time_zone);
        const start=T.instant(String(next.installation_start_date).slice(0,10)+'T00:00',p.time_zone);
        const end=T.instant(T.Temporal.PlainDate.from(String(next.scheduled_end_date||next.installation_start_date).slice(0,10)).add({days:1}).toString()+'T00:00',p.time_zone);
        await conflicts(db,[...new Set([next.hardware_technician_id,next.software_technician_id].filter(Boolean))],start,end,p.buffer_minutes||0,null,id);
      }
      return work(db);
    });
  }
  async function catalog(user){
    allowed(user);const restricted=user.role!=='SuperAdmin';if(restricted)scope(user,user.subsidiary_id);
    const [subsidiaries]=await pool.query(`SELECT id,subsidiary_name FROM subsidiaries ${restricted?'WHERE id=?':''} ORDER BY subsidiary_name`,restricted?[user.subsidiary_id]:[]);
    const [resources]=await pool.query(`SELECT id,first_name,last_name,subsidiary_id FROM user_profiles WHERE is_active=1 ${restricted?'AND subsidiary_id=?':''} ${user.role==='User'?'AND id=?':''} ORDER BY first_name,id`,[...(restricted?[user.subsidiary_id]:[]),...(user.role==='User'?[user.id]:[])]);
    const [branches]=await pool.query(`SELECT b.id,b.branch_name,c.subsidiary_id FROM client_branches b JOIN clients c ON ${uuidEquals('c.id','b.client_id')} WHERE b.deleted_at IS NULL ${restricted?'AND c.subsidiary_id=?':''} ORDER BY b.branch_name`,restricted?[user.subsidiary_id]:[]);
    return {subsidiaries,resources,branches};
  }
  async function availability(user,body){
    allowed(user);const ctx=await context(pool,user,body);
    let exclude=null;
    if(body.event_id){const [[event]]=await pool.query('SELECT id,subsidiary_id FROM scheduling_events WHERE id=?',[body.event_id]);if(!event||event.subsidiary_id!==body.subsidiary_id)throw fail('SCHEDULE_PERMISSION_DENIED','Schedule is not available in this subsidiary.',403);exclude=event.id;}
    if(user.role==='User' && ctx.resourceIds.some(id=>id!==user.id))throw fail('SCHEDULE_PERMISSION_DENIED','Technicians can check only their own availability.',403);
    const window=T.validateWindow({start:body.start,end:body.end,timeZone:ctx.timeZone,policy:ctx.resolved,now:clock(),override:ctx.override});
    try{await conflicts(pool,ctx.resourceIds,window.start,window.end,ctx.resolved.buffer_minutes||0,exclude);return {status:'No recorded conflict',checked_at:clock().toISOString(),sources:['scheduled activities','legacy date-only assignments']};}
    catch(error){if(error.code==='SCHEDULE_RESOURCE_CONFLICT')return {status:'Assigned',checked_at:clock().toISOString()};throw error;}
  }
  async function cancelSeries(user,id,body){
    allowed(user,true);
    if(typeof body.reason!=='string'||body.reason.trim().length<5||body.reason.length>500)throw fail('SCHEDULE_POLICY_VIOLATION','Enter a cancellation reason (5 to 500 characters).');
    return transaction(async db=>{
      const [[source]]=await db.query('SELECT * FROM scheduling_events WHERE id=? FOR UPDATE',[id]);
      if(!source)throw fail('SCHEDULE_POLICY_VIOLATION','Schedule not found.',404);scope(user,source.subsidiary_id);
      if(source.version!==body.version)throw fail('SCHEDULE_STALE_VERSION','The schedule changed. Reload before cancelling its series.',409);
      if(!source.series_id)throw fail('SCHEDULE_POLICY_VIOLATION','This activity is not recurring.');
      const [rows]=await db.query("SELECT *,CAST(start_utc AS CHAR) start_utc,CAST(end_utc AS CHAR) end_utc FROM scheduling_events WHERE series_id=? AND status='scheduled' AND start_utc>? ORDER BY id FOR UPDATE",[source.series_id,T.sqlTime(T.Temporal.Instant.from(clock().toISOString()))]);
      for(const before of rows){
        const after={...before,status:'cancelled',version:before.version+1};
        await db.query("UPDATE scheduling_events SET status='cancelled',version=version+1,updated_at=UTC_TIMESTAMP(6) WHERE id=?",[before.id]);
        const [resources]=await db.query('SELECT user_id FROM scheduling_resources WHERE event_id=?',[before.id]);
        await history(db,user,before.id,before,after,body.reason);await jobs(db,after,resources.map(r=>r.user_id));
      }
      return {cancelled:rows.length};
    });
  }
  async function eventHistory(user,id){allowed(user);const [[event]]=await pool.query('SELECT * FROM scheduling_events WHERE id=?',[id]);if(!event)throw fail('SCHEDULE_POLICY_VIOLATION','Schedule not found.',404);scope(user,event.subsidiary_id);if(user.role==='User'){const [[owns]]=await pool.query('SELECT event_id FROM scheduling_resources WHERE event_id=? AND user_id=?',[id,user.id]);if(!owns)throw fail('SCHEDULE_PERMISSION_DENIED','Schedule history is not available.',403);}const [rows]=await pool.query('SELECT *,CAST(created_at AS CHAR) created_at FROM scheduling_history WHERE event_id=? ORDER BY created_at DESC LIMIT 100',[id]);return {rows:rows.map(row=>({...row,created_at:T.fromSql(row.created_at)}))};}
  return {list,save,setPolicy,inspectPolicy,eventHistory,policy,transaction,lockResources,conflicts,legacyWrite,catalog,availability,cancelSeries};
}
module.exports={createScheduling};
