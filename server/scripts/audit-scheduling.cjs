const pool=require('../db');
async function main(){try{
 const [[ranges]]=await pool.query('SELECT COUNT(*) total,SUM(installation_start_date IS NULL) missing_start,SUM(scheduled_end_date<installation_start_date) invalid_ranges FROM client_assignments');
 const [[overlap]]=await pool.query("SELECT COUNT(*) total FROM client_assignments a JOIN client_assignments b ON a.id<b.id AND a.status NOT IN ('completed','cancelled','canceled') AND b.status NOT IN ('completed','cancelled','canceled') AND ((a.hardware_technician_id IS NOT NULL AND a.hardware_technician_id IN (b.hardware_technician_id,b.software_technician_id)) OR (a.software_technician_id IS NOT NULL AND a.software_technician_id IN (b.hardware_technician_id,b.software_technician_id))) AND a.installation_start_date<=COALESCE(b.scheduled_end_date,b.installation_start_date) AND b.installation_start_date<=COALESCE(a.scheduled_end_date,a.installation_start_date)");
 const [[database]]=await pool.query('SELECT CAST(UTC_TIMESTAMP(6) AS CHAR) utc_now,VERSION() version');
 console.log(JSON.stringify({legacyAssignmentDates:ranges,potentialDateOnlyOverlaps:overlap.total,databaseVersion:database.version,serverNowUTC:new Date().toISOString(),databaseNowUTC:database.utc_now.replace(' ','T')+'Z',clockDifferenceMilliseconds:Math.abs(Date.now()-Date.parse(database.utc_now.replace(' ','T')+'Z')),recordsChanged:false},null,2));
}finally{await pool.end();}}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
