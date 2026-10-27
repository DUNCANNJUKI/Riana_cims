const fs=require('node:fs/promises');const path=require('node:path');const pool=require('../db');
async function main(){
  const db=await pool.getConnection();try{
    await db.beginTransaction();
    const [variants]=await db.query('SELECT * FROM hardware_variants');
    const [files]=await db.query('SELECT * FROM uploaded_files');
    const directory=path.resolve(__dirname,'../../.runtime/backups');await fs.mkdir(directory,{recursive:true});
    const backup=path.join(directory,`inventory-operations-${Date.now()}.json`);
    await fs.writeFile(backup,JSON.stringify({createdAt:new Date().toISOString(),variants,files},null,2),{flag:'wx',mode:0o600});
    await db.commit();
    const sql=await fs.readFile(path.join(__dirname,'../migrations/20261016_inventory_operations.sql'),'utf8');
    let delimiter=';',current='';
    for(const line of sql.split(/\r?\n/)){
      if(/^DELIMITER\s+/i.test(line.trim())){delimiter=line.trim().replace(/^DELIMITER\s+/i,'');continue;}
      current+=line+'\n';if(current.trimEnd().endsWith(delimiter)){await db.query(current.trimEnd().slice(0,-delimiter.length));current='';}
    }
    console.log(JSON.stringify({backup,variantsBackedUp:variants.length,documentRecordsBackedUp:files.length,existingRecordsModified:false}));
  }catch(error){await db.rollback().catch(()=>{});throw error;}finally{db.release();await pool.end();}
}
main().catch((error)=>{console.error(error.message);process.exitCode=1;});
