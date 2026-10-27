const express=require('express');
const {createScheduling}=require('../services/scheduling');
function createTimeEndpoint(pool){
  let cached=null,checkedAt=0;
  return async(_req,res)=>{try{
    if(!cached || Date.now()-checkedAt>30000){
      const [[row]]=await pool.query('SELECT timezone FROM company_settings LIMIT 1');
      const resolved=process.env.SCHEDULING_ENABLED==='true'?await createScheduling(pool).policy(pool):null;
      cached=require('../services/schedulingTime').zone(resolved?.time_zone||row?.timezone||'Africa/Nairobi');checkedAt=Date.now();
    }
    res.setHeader('Cache-Control','no-store');res.json({now:new Date().toISOString(),time_zone:cached});
  }catch{res.status(503).json({error:'Scheduling time is temporarily unavailable.'});}};
}
function createSchedulingRouter(pool,{enabled=false}={}){
  const router=express.Router();const service=createScheduling(pool);
  router.use((_req,res,next)=>enabled?next():res.status(503).json({error:'Scheduling is awaiting its approved database rollout.'}));
  const handle=(operation)=>async(req,res)=>{try{res.json(await operation(req));}catch(error){
    if(!error.status)console.error('Scheduling operation failed',{code:error.code||'INTERNAL'});
    const conflict=['ER_DUP_ENTRY','ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(error.code);
    res.status(error.status || (conflict?409:500)).json({code:error.status?error.code:conflict?'SCHEDULE_STALE_VERSION':'SCHEDULE_UNAVAILABLE',error:error.status?error.message:conflict?'A concurrent scheduling change occurred. Refresh and try again.':'Scheduling is temporarily unavailable. Please try again.'});
  }};
  router.get('/events',handle(req=>service.list(req.user,req.query)));
  router.get('/catalog',handle(req=>service.catalog(req.user)));
  router.post('/availability',handle(req=>service.availability(req.user,req.body)));
  router.post('/events',handle(req=>service.save(req.user,req.body,{key:req.get('Idempotency-Key')})));
  router.patch('/events/:id',handle(req=>service.save(req.user,req.body,{id:req.params.id,key:req.get('Idempotency-Key')})));
  router.get('/events/:id/history',handle(req=>service.eventHistory(req.user,req.params.id)));
  router.post('/events/:id/cancel-series',handle(req=>service.cancelSeries(req.user,req.params.id,req.body)));
  router.get('/policy',handle(req=>service.inspectPolicy(req.user,req.query)));
  router.put('/policy',handle(req=>service.setPolicy(req.user,req.body)));
  return router;
}
module.exports={createSchedulingRouter,createTimeEndpoint};
