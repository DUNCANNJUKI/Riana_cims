const fs=require('node:fs');const path=require('node:path');const mysql=require('mysql2/promise');
require('dotenv').config({path:path.resolve(__dirname,'../../.env.local')});
async function main(){
  const host=process.env.DATABASE_HOST||process.env.DB_HOST||'127.0.0.1';
  if(!['localhost','127.0.0.1','::1'].includes(host))throw new Error('This helper applies only to a local database. Use reviewed LIVE_DB_UPDATE.sql for cloud.');
  const db=await mysql.createConnection({host,port:Number(process.env.DATABASE_PORT||process.env.DB_PORT||3306),user:process.env.DATABASE_USER||process.env.DB_USER||'root',password:process.env.DATABASE_PASSWORD||process.env.DB_PASSWORD||process.env.DB_PASS||'',database:process.env.DATABASE_NAME||process.env.DB_NAME||'riana_cims',multipleStatements:true});
  try{
    const [schema]=await db.query('SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION');
    const directory=path.resolve(__dirname,'../../.runtime/backups');fs.mkdirSync(directory,{recursive:true});
    const backup=path.join(directory,`scheduling-schema-before-${Date.now()}.json`);fs.writeFileSync(backup,JSON.stringify(schema,null,2));
    await db.query(fs.readFileSync(path.resolve(__dirname,'../migrations/20261016_scheduling.sql'),'utf8'));
    await db.query("INSERT INTO migration_history(migration_id,description) VALUES ('20261016_scheduling','Additive scoped scheduling and durable in-app reminders') ON DUPLICATE KEY UPDATE description=VALUES(description)");
    console.log(JSON.stringify({schemaBackup:backup,applied:'20261016_scheduling',existingOperationalRecordsModified:false}));
  }finally{await db.end();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
