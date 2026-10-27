const crypto=require('node:crypto');
const P=require('./hardwarePolicy');
async function manageVariant(db,req,action,event){
  P.requirePermission(req.user,'inventory.approve_models');
  const b=req.body;
  let variant;
  if(action!=='variant_create'){
    [[variant]]=await db.query('SELECT * FROM hardware_variants WHERE id=? AND deleted_at IS NULL FOR UPDATE',[b.variant_id]);
    if(!variant)P.fail('Variant not found.',404);
    const [[dependencies]]=await db.query(`SELECT
      (SELECT COUNT(*) FROM hardware_models WHERE variant_id=?) +
      (SELECT COUNT(*) FROM hardware_model_counters WHERE variant_id=?) AS total`,[variant.id,variant.id]);
    if(Number(dependencies.total))P.fail('This variant has saved models or sequence dependencies and cannot be edited or deleted.',409);
  }
  if(action==='variant_delete')await db.query('UPDATE hardware_variants SET deleted_at=NOW() WHERE id=?',[variant.id]);
  else{
    const family=String(b.family || '').trim().toUpperCase();
    const code=String(b.variant || '').trim().toUpperCase();
    const nickname=String(b.nickname || '').trim();const description=String(b.description || '').trim();
    if(!/^[A-Z]{2,8}$/.test(family) || !/^[A-Z]{1,4}$/.test(code))P.fail('Use 2-8 letters for family and 1-4 letters for variant code.');
    if(!nickname || nickname.length>50 || !description || description.length>150)P.fail('A name (up to 50 characters) and description (up to 150 characters) are required.');
    if(typeof b.retired!=='boolean')P.fail('Specify whether the variant is retired.');
    if(action==='variant_create'){
      const [[existing]]=await db.query('SELECT * FROM hardware_variants WHERE family=? AND variant=? FOR UPDATE',[family,code]);
      if(existing && !existing.deleted_at)P.fail('This family and variant code already exist.',409);
      if(existing){variant=existing;await db.query('UPDATE hardware_variants SET nickname=?,description=?,retired=?,deleted_at=NULL WHERE id=?',[nickname,description,b.retired,variant.id]);}
      else{
        variant={id:crypto.randomBytes(10).toString('hex')};
        await db.query('INSERT INTO hardware_variants (id,family,variant,nickname,description,retired,policy_source) VALUES (?,?,?,?,?,?,?)',[variant.id,family,code,nickname,description,b.retired,'CIMS configured']);
      }
    }else await db.query('UPDATE hardware_variants SET family=?,variant=?,nickname=?,description=?,retired=? WHERE id=?',[family,code,nickname,description,b.retired,variant.id]);
  }
  await event(db,req,action,null,{variant_id:variant.id});
  return {success:true,id:variant.id};
}
module.exports={manageVariant};
