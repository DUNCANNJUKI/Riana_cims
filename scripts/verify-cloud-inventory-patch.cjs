const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const mysql=require('../server/node_modules/mysql2/promise');
async function main(){
  const database=process.env.HARDWARE_TEST_DATABASE;
  assert.match(database || '',/^cims_hardware_test_[a-z0-9_]+$/);
  const directory=path.resolve(process.argv[2] || '');
  assert.ok(directory.startsWith(path.resolve(__dirname,'../release')+path.sep));
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'MANIFEST.json'),'utf8'));
  assert.ok(manifest.files.some((entry)=>entry.path==='node_app/server/services/installationAssignment.js'),'Assignment guard must be packaged');
  for(const entry of manifest.files){
    const file=path.resolve(directory,entry.path);
    assert.ok(file.startsWith(directory+path.sep));
    const checksum=require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    assert.equal(checksum,entry.sha256,entry.path);
    assert.ok(!/(^|\/)(uploads|private_uploads|node_modules|backups|\.env)(\/|$)/.test(entry.path));
  }
  const db=await mysql.createConnection({host:'127.0.0.1',user:process.env.HARDWARE_TEST_USER || 'root',password:process.env.HARDWARE_TEST_PASSWORD || '',database});
  try{
    const capture=async()=>{
      const tables=['subsidiaries','clients','user_profiles','installations','client_assignments','hardware_variants','hardware_models','hardware_assets','hardware_assignments','hardware_sequences','hardware_equipment_requirements','uploaded_files','scheduling_policies','scheduling_policy_history','scheduling_series','scheduling_events','scheduling_resources','scheduling_history','scheduling_requests','scheduling_jobs'];const values={};
      for(const table of tables){const [[exists]]=await db.query('SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[table]);const [rows]=exists.n?await db.query(`SELECT * FROM \`${table}\``):[[]];values[table]=(table==='hardware_variants'?rows.map((row)=>({...row,deleted_at:row.deleted_at || null})):rows).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));}
      return JSON.stringify(values);
    };
    const before=await capture();
    const sqlFile=manifest.sqlFile || 'LIVE_DB_UPDATE_20261014.sql';
    assert.equal(path.basename(sqlFile),sqlFile);
    const sql=fs.readFileSync(path.join(directory,sqlFile),'utf8');
    const statements=[];let delimiter=';';let current='';
    for(const line of sql.split(/\r?\n/)){
      if(/^DELIMITER\s+/i.test(line.trim())){delimiter=line.trim().replace(/^DELIMITER\s+/i,'');continue;}
      current+=line+'\n';
      if(current.trimEnd().endsWith(delimiter)){statements.push(current.trimEnd().slice(0,-delimiter.length));current='';}
    }
    if(current.trim())statements.push(current);
    for(let attempt=0;attempt<2;attempt++)for(const statement of statements)await db.query(statement);
    assert.equal(await capture(),before,'Existing records must survive both SQL applications');
    const roleDatabase=`cims_hardware_test_cloud_roles_${Date.now()}`;
    await db.query(`CREATE DATABASE \`${roleDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    for(const table of ['subsidiaries','user_profiles','clients','installations','client_assignments','uploaded_files','uploaded_file_variants'])await db.query(`CREATE TABLE \`${roleDatabase}\`.\`${table}\` LIKE \`${database}\`.\`${table}\``);
    await db.query(`ALTER TABLE \`${roleDatabase}\`.user_profiles MODIFY role ENUM('User','CustomRole') NOT NULL DEFAULT 'User'`);
    await db.query(`ALTER TABLE \`${roleDatabase}\`.installations DROP COLUMN equipment_quantities`);
    await db.query(`USE \`${roleDatabase}\``);
    for(const statement of statements)await db.query(statement);
    const [hybridColumn]=await db.query("SHOW COLUMNS FROM installations LIKE 'equipment_quantities'");
    assert.equal(hybridColumn.length,1,'Hybrid quantity column must be added to an existing database');
    const [[role]]=await db.query("SELECT COLUMN_TYPE,COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='user_profiles' AND COLUMN_NAME='role'");
    assert.match(role.COLUMN_TYPE,/'CustomRole'/);assert.match(role.COLUMN_TYPE,/'InventoryOfficer'/);assert.match(role.COLUMN_DEFAULT,/User/);
    await db.query('ALTER TABLE client_assignments DROP COLUMN department_id');
    // Recreate the preflight routine and prove a missing scope column stops the upgrade.
    await db.query('DROP PROCEDURE IF EXISTS cims_inventory_patch_preflight');
    await db.query(statements.find((statement)=>/^\s*CREATE PROCEDURE cims_inventory_patch_preflight/i.test(statement)));
    await assert.rejects(db.query('CALL cims_inventory_patch_preflight()'), /Assignment scope columns are missing/);
    console.log(JSON.stringify({manifestFiles:manifest.files.length,sqlRuns:2,existingRecordsPreserved:true,roleValuesAndDefaultsPreserved:true,missingAssignmentScopeRejected:true,uploadDataIncluded:false},null,2));
  }finally{await db.end();}
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
