const fs = require('node:fs/promises');
const path = require('node:path');
const pool = require('../db');

async function main() {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [installations] = await db.query('SELECT * FROM installations');
    const [subsidiaries] = await db.query('SELECT * FROM subsidiaries');
    const [schema] = await db.query('SHOW CREATE TABLE installations');
    const directory = path.resolve(__dirname,'../../.runtime/backups');
    await fs.mkdir(directory,{recursive:true});
    const backup = path.join(directory,`hybrid-equipment-${Date.now()}.json`);
    await fs.writeFile(backup,JSON.stringify({createdAt:new Date().toISOString(),schema,installations,subsidiaries},null,2),{flag:'wx',mode:0o600});
    await db.commit();
    const sql=await fs.readFile(path.join(__dirname,'../migrations/20261015_hybrid_equipment.sql'),'utf8');
    let delimiter=';',current='';
    for(const line of sql.split(/\r?\n/)){
      if(/^DELIMITER\s+/i.test(line.trim())){delimiter=line.trim().replace(/^DELIMITER\s+/i,'');continue;}
      current+=line+'\n';
      if(current.trimEnd().endsWith(delimiter)){
        await db.query(current.trimEnd().slice(0,-delimiter.length));current='';
      }
    }
    console.log(JSON.stringify({backup,existingInstallations:installations.length,existingSubsidiaries:subsidiaries.length,change:'Added equipment_quantities JSON if absent; no existing values changed.'}));
  } catch(error) { await db.rollback().catch(()=>{});throw error; }
  finally { db.release();await pool.end(); }
}
main().catch((error)=>{console.error(error.message);process.exitCode=1;});
