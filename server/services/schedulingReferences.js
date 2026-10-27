const {hasCapability}=require('../security/accessControl');
function schedulingReferenceBoundary(pool){return async(req,res,next)=>{
  if(process.env.SCHEDULING_ENABLED!=='true'||req.method!=='DELETE')return next();
  const match=/^\/(subsidiaries|client_branches|user_profiles|installations|clients)\/([^/]+)$/.exec(req.path);
  if(!match)return next();
  const permissions={subsidiaries:'subsidiaries.manage',client_branches:'clients.manage',clients:'clients.manage',user_profiles:'users.manage',installations:'installations.manage'};
  if(!hasCapability(req.user,permissions[match[1]]))return next();
  const rules={
    subsidiaries:'SELECT id FROM scheduling_events WHERE subsidiary_id=? LIMIT 1',
    client_branches:'SELECT id FROM scheduling_events WHERE branch_id=? LIMIT 1',
    user_profiles:'SELECT event_id FROM scheduling_resources WHERE user_id=? LIMIT 1',
    installations:"SELECT id FROM scheduling_events WHERE activity_type='installation' AND activity_id=? LIMIT 1",
    clients:"SELECT e.id FROM scheduling_events e WHERE e.branch_id IN (SELECT b.id FROM client_branches b WHERE b.client_id=?) OR (e.activity_type='installation' AND e.activity_id IN (SELECT i.id FROM installations i WHERE i.client_id=?)) LIMIT 1",
  };
  try{
    if(req.user.role!=='SuperAdmin'){
      const ownership={subsidiaries:'SELECT id FROM subsidiaries WHERE id=? AND id=?',client_branches:'SELECT b.id FROM client_branches b JOIN clients c ON c.id=b.client_id WHERE b.id=? AND c.subsidiary_id=?',clients:'SELECT id FROM clients WHERE id=? AND subsidiary_id=?',user_profiles:'SELECT id FROM user_profiles WHERE id=? AND subsidiary_id=?',installations:'SELECT i.id FROM installations i JOIN clients c ON c.id=i.client_id WHERE i.id=? AND c.subsidiary_id=?'};
      const [owned]=await pool.query(ownership[match[1]],[match[2],req.user.subsidiary_id||null]);if(!owned.length)return res.status(404).json({error:'Record not found in your subsidiary.'});
    }
    const [rows]=await pool.query(rules[match[1]],match[1]==='clients'?[match[2],match[2]]:[match[2]]);if(rows.length)return res.status(409).json({code:'SCHEDULE_POLICY_VIOLATION',error:'This record is referenced by scheduling history. Deactivate or archive it instead of deleting it.'});next();
  }
  catch{res.status(503).json({error:'Scheduling dependencies could not be verified. Please try again.'});}
};}
module.exports={schedulingReferenceBoundary};
