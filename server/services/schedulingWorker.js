const crypto=require('node:crypto');

async function processSchedulingJobs(pool,{limit=25}={}){
  let delivered=0;
  for(let count=0;count<limit;count++){
    const db=await pool.getConnection();let job;
    try{
      await db.beginTransaction();
      const [[row]]=await db.query("SELECT * FROM scheduling_jobs WHERE state='pending' AND due_utc<=UTC_TIMESTAMP(6) ORDER BY due_utc,id LIMIT 1 FOR UPDATE");
      if(!row){await db.commit();break;}job=row;
      const [[event]]=await db.query('SELECT * FROM scheduling_events WHERE id=? FOR UPDATE',[job.event_id]);
      const [[recipient]]=await db.query('SELECT id,subsidiary_id,is_active FROM user_profiles WHERE id=?',[job.user_id]);
      let obsolete=!event || event.version!==job.event_version || !recipient?.is_active || recipient.subsidiary_id!==event.subsidiary_id;
      if(event && ['completed','cancelled'].includes(event.status) && job.kind!=='cancelled')obsolete=true;
      if(event?.activity_type==='installation' && event.activity_id){const [[actual]]=await db.query('SELECT status FROM installations WHERE id=?',[event.activity_id]);if(actual?.status==='completed')obsolete=true;}
      if(obsolete)await db.query("UPDATE scheduling_jobs SET state='cancelled' WHERE id=?",[job.id]);
      else{
        const notificationId=crypto.createHash('sha256').update(job.id).digest('hex').slice(0,32);
        const title=job.kind==='overdue'?'Scheduled activity overdue':job.kind==='cancelled'?'Scheduled activity cancelled':job.kind==='changed'?'Schedule updated':'Upcoming scheduled activity';
        await db.query("INSERT IGNORE INTO crms_notifications (id,user_id,title,message,type,notification_type,`read`,action_url,email_sent,sms_sent) VALUES (?,?,?,?,?,'general',FALSE,'/',FALSE,FALSE)",[notificationId,job.user_id,title,`${event.title} (${event.time_zone}). Open Workload Calendar to review the current schedule.`,job.kind==='overdue'?'warning':'info']);
        await db.query("UPDATE scheduling_jobs SET state='delivered',attempts=attempts+1,last_error=NULL WHERE id=?",[job.id]);delivered++;
      }
      await db.commit();
    }catch(error){
      await db.rollback();
      console.error('Scheduling reminder processing failed',{code:error.code||'INTERNAL'});
      if(job)await pool.query("UPDATE scheduling_jobs SET attempts=attempts+1,last_error=?,state=IF(attempts>=5,'failed','pending'),due_utc=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 5 MINUTE) WHERE id=? AND state='pending'",[String(error.code||'DELIVERY_FAILED').slice(0,100),job.id]);
      break;
    }finally{db.release();}
  }
  return {delivered};
}
function startSchedulingWorker(pool){
  let running=false;
  const timer=setInterval(async()=>{if(running)return;running=true;try{await processSchedulingJobs(pool);}catch(error){console.error('Scheduling worker unavailable',{code:error.code||'INTERNAL'});}finally{running=false;}},30000);
  timer.unref();return ()=>clearInterval(timer);
}
module.exports={processSchedulingJobs,startSchedulingWorker};
