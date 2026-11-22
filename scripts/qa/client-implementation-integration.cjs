// Real SQL/transaction verification in a new disposable schema; providers are always stubbed.
const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const mysql = require('../../server/node_modules/mysql2/promise');
const source = require('../../server/db');
const providers = require('../../server/services/notifications');
const dispatcher = require('../../server/services/notificationDispatcher');
const deliveries = [];
providers.sendEmail = async message => { deliveries.push({channel:'email',message}); return {provider:'isolated-test'}; };
providers.sendSms = async message => { deliveries.push({channel:'sms',message}); return {provider:'isolated-test'}; };
dispatcher.sendUserNotification = async () => {};
dispatcher.sendUsersNotification = async () => {};
const service = require('../../server/services/clientChangeRequests');
const portalRouter = require('../../server/routes/clientChangeRequestPortal');
const schema = `cims_impl_test_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
const config = source.pool.config.connectionConfig;
if (!['localhost','127.0.0.1','::1'].includes(config.host)) throw Error('Integration test requires a local database.');
let admin, pool;
const req = { protocol:'http', headers:{host:'localhost:8090','user-agent':'isolated-qa'}, get:()=> 'localhost:8090', ip:'127.0.0.1', user:{id:'qa-manager',role:'Sales'} };
const summary = [];
async function insert(connection, table, overrides) {
  const [columns] = await connection.query(`SHOW COLUMNS FROM ${mysql.escapeId(table)}`);
  const row = {};
  for (const column of columns) {
    if (Object.hasOwn(overrides,column.Field)) {row[column.Field]=overrides[column.Field];continue;}
    if(column.Null==='YES'||column.Default!==null||column.Extra.includes('auto_increment'))continue;
    const type=column.Type;
    row[column.Field]=type.startsWith('enum(')?type.match(/'([^']+)'/)[1]:/int|decimal|float|double/.test(type)?0:/date|time/.test(type)?new Date('2026-11-22T00:00:00Z'):/json/.test(type)?'[]':'Synthetic QA';
  }
  await connection.query(`INSERT INTO ${mysql.escapeId(table)} (${Object.keys(row).map(mysql.escapeId).join(',')}) VALUES (${Object.keys(row).map(()=>'?').join(',')})`,Object.values(row));
}
(async()=>{
 try {
  admin=await mysql.createConnection({host:config.host,port:config.port,user:config.user,password:config.password});
  await admin.query(`CREATE DATABASE ${mysql.escapeId(schema)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  pool=mysql.createPool({host:config.host,port:config.port,user:config.user,password:config.password,database:schema,connectionLimit:4});
  const seed=await pool.getConnection();
  try {
   await seed.query('SET FOREIGN_KEY_CHECKS=0');
   const [tables]=await source.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
   for(const table of tables){const name=Object.values(table)[0];const [[ddl]]=await source.query(`SHOW CREATE TABLE ${mysql.escapeId(name)}`);await seed.query(ddl['Create Table']);}
   await insert(seed,'subsidiaries',{id:'qa-subsidiary',subsidiary_name:'Synthetic subsidiary'});
   await insert(seed,'user_profiles',{id:'qa-manager',email:'manager@example.invalid',role:'Sales',first_name:'Account',last_name:'Manager',subsidiary_id:'qa-subsidiary'});
   await insert(seed,'clients',{id:'qa-client',client_name:'Synthetic client',subsidiary_id:'qa-subsidiary'});
   await insert(seed,'crms_change_request_invitations',{id:'qa-invitation',client_id:'qa-client',account_manager_id:'qa-manager',request_reference:'QA-REQUEST',invitation_token:'a'.repeat(64),status:'submitted',token_expires_at:new Date(Date.now()+86400000),expires_at:new Date(Date.now()+86400000),client_representative_name:'Client',client_representative_phone:'+254700000000',client_representative_email:'client@example.invalid'});
   for(const id of ['qa-request','qa-signature'])await insert(seed,'crms_change_requests',{id,ticket_number:id,client_id:'qa-client',account_manager_id:'qa-manager',senior_developer_id:'qa-manager',is_client_request:1,invitation_id:id==='qa-request'?'qa-invitation':null,status:'completed',modules_affected:'[]',client_representative_name:'Client',client_representative_phone:'+254700000000',client_representative_email:'client@example.invalid',request_title:'Synthetic implemented change'});
   await seed.query('SET FOREIGN_KEY_CHECKS=1');
  }finally{seed.release();}
  await assert.rejects(service.confirmImplementation(pool,{changeRequestId:'qa-request',data:{},user:{id:'other-manager',role:'Sales'},req}),{status:403});
  const input={changeRequestId:'qa-request',data:{summary_of_change:'Implemented reporting',implemented_solution:'Delivered and verified'},user:req.user,req};
  const confirmations=await Promise.all([service.confirmImplementation(pool,input),service.confirmImplementation(pool,input)]);
  assert.equal(confirmations.filter(r=>!r.alreadyConfirmed).length,1);
  assert.equal(deliveries.filter(r=>r.channel==='email').length,1);assert.equal(deliveries.filter(r=>r.channel==='sms').length,1);
  const report=confirmations.find(r=>!r.alreadyConfirmed);assert.ok(report.delivery.trackingUrl.endsWith('a'.repeat(64)));
  summary.push('Concurrent confirmation creates one report and one email/SMS pair; unrelated managers are denied.');
  const review=await service.getCompletionReportForClient(pool,report.acceptance_token);
  assert.equal(review.request_status,'awaiting_client_acceptance');
  await assert.rejects(service.closeChangeRequest(pool,{changeRequestId:'qa-request',accountManagerId:'qa-manager',user:req.user}),{status:409});
  await service.requestClientOtp(pool,report.acceptance_token,'sms',req);
  const otp=deliveries.filter(r=>r.channel==='sms').at(-1).message.message.match(/\b\d{6}\b/)[0];
  await assert.rejects(service.verifyOtpAndAccept(pool,{token:report.acceptance_token,code:'not-valid',req}),{status:400});
  await service.verifyOtpAndAccept(pool,{token:report.acceptance_token,code:otp,representativeName:'Client Signatory',designation:'Manager',feedback:{rating:5,comment:'Implemented successfully <text remains text>'},req});
  await assert.rejects(service.verifyOtpAndAccept(pool,{token:report.acceptance_token,code:otp,req}),{status:409});
  const [[acceptance]]=await pool.query('SELECT * FROM crms_client_acceptances WHERE change_request_id=?',['qa-request']);assert.equal(acceptance.feedback_rating,5);assert.equal(acceptance.feedback_comment,'Implemented successfully <text remains text>');
  const [[closedOtp]]=await pool.query('SELECT status FROM crms_change_requests WHERE id=?',['qa-request']);assert.equal(closedOtp.status,'closed_client_accepted');
  const { signedCompletionReport }=require('../../server/services/signedCompletionReport');
  const otpPdf=await signedCompletionReport(pool,{token:report.acceptance_token});assert.equal(otpPdf.buffer.subarray(0,5).toString(),'%PDF-');assert.ok(otpPdf.buffer.toString('latin1').includes('OTP attestation'));assert.ok(otpPdf.buffer.toString('latin1').includes('Client Signatory'));
  await assert.rejects(signedCompletionReport(pool,{token:'invalid-token'}),{status:404});
  await service.closeChangeRequest(pool,{changeRequestId:'qa-request',accountManagerId:'qa-manager',user:req.user,closureNotes:'Verified client acceptance'});
  const router=portalRouter({pool,uploadsDir:'.runtime/unused-qa-uploads'});
  const track=router.stack.find(l=>l.route?.path==='/track/:token'&&l.route.methods.get).route.stack[0].handle;
  const res={statusCode:200,status(n){this.statusCode=n;return this;},set(){return this;},json(body){this.body=body;return this;}};
  await track({...req,params:{token:'a'.repeat(64)}},res);
  assert.equal(res.statusCode,200);assert.equal(res.body.is_closed,true);assert.equal(res.body.feedback.rating,5);assert.equal(res.body.stages.length,8);
  summary.push('OTP rejection, verified feedback, replay prevention, closure gating and original-link tracking pass against real SQL.');
  const signed=await service.confirmImplementation(pool,{...input,changeRequestId:'qa-signature'});
  await service.verifySignatureAndAccept(pool,{token:signed.acceptance_token,signaturePath:'isolated-signature.png',representativeName:'Client Signatory',designation:'Manager',feedback:{rating:4,comment:'Signed and verified'},req});
  const [[signature]]=await pool.query('SELECT sign_off_method,feedback_rating FROM crms_client_acceptances WHERE change_request_id=?',['qa-signature']);assert.equal(signature.sign_off_method,'signature');assert.equal(signature.feedback_rating,4);
  const [[closedSignature]]=await pool.query('SELECT status FROM crms_change_requests WHERE id=?',['qa-signature']);assert.equal(closedSignature.status,'closed_client_accepted');
  fs.mkdirSync('.runtime',{recursive:true});const signatureFile='.runtime/isolated-client-signature.png';await require('../../server/node_modules/sharp')({create:{width:240,height:80,channels:4,background:'#ffffff'}}).composite([{input:Buffer.from('<svg width="240" height="80"><path d="M15 60 Q60 0 100 50 T220 20" fill="none" stroke="#154a63" stroke-width="3"/></svg>')}]).png().toFile(signatureFile);
  const signedPdf=await signedCompletionReport(pool,{requestId:'qa-signature',resolveSignature:()=>signatureFile});assert.ok(signedPdf.buffer.toString('latin1').includes('/Subtype /Image'));fs.writeFileSync('.runtime/signed-client-completion-qa.pdf',signedPdf.buffer);
  const [[closureCount]]=await pool.query('SELECT COUNT(*) AS n FROM crms_request_closures');assert.equal(closureCount.n,2);
  summary.push('OTP and signature immediately close each request exactly once; signed PDF embeds the client signature, OTP PDF records attestation, and invalid tokens cannot download.');
  summary.push('Signature acceptance stores feedback in the same transaction. No live providers were called.');
  for(const delivery of deliveries.filter(d=>d.channel==='sms'))assert.ok(!/^RIANA CIMS:/i.test(delivery.message.message),'SMS body must not duplicate the sender name');
  for(const kind of ['valid','disputed','unverified','newer']) {
    const id=`legacy-${kind}`, reportId=`report-${kind}`;
    await insert(pool,'crms_change_requests',{id,ticket_number:id,client_id:'qa-client',account_manager_id:'qa-manager',status:'client_accepted',modules_affected:'[]'});
    await insert(pool,'crms_completion_reports',{id:reportId,change_request_id:id,account_manager_id:'qa-manager',version_number:1,status:'accepted',acceptance_token:crypto.randomBytes(32).toString('hex'),token_expires_at:new Date(Date.now()+86400000)});
    await insert(pool,'crms_client_acceptances',{id:`accept-${kind}`,change_request_id:id,completion_report_id:reportId,sign_off_method:'otp',declaration_confirmed:1,otp_verified_at:kind==='unverified'?null:new Date()});
    if(kind==='disputed')await insert(pool,'crms_client_action_responses',{id:'legacy-dispute',change_request_id:id,completion_report_id:reportId,response_type:'dispute_raised',resolved:0});
    if(kind==='newer')await insert(pool,'crms_completion_reports',{id:'newer-draft',change_request_id:id,account_manager_id:'qa-manager',version_number:2,status:'draft',acceptance_token:crypto.randomBytes(32).toString('hex'),token_expires_at:new Date(Date.now()+86400000)});
  }
  const runner=fs.readFileSync('server/scripts/apply-communication-migrations.cjs','utf8');
  const parseSql=new Function(runner.slice(runner.indexOf('const splitSqlStatements ='),runner.indexOf('async function run()'))+';return splitSqlStatements;')();
  for(let n=0;n<2;n++)for(const sql of parseSql(fs.readFileSync('server/migrations/20261122_verified_signoff_closure.sql','utf8')))await pool.query(sql);
  const [legacy]=await pool.query("SELECT id,status FROM crms_change_requests WHERE id LIKE 'legacy-%'");for(const row of legacy)assert.equal(row.status,row.id==='legacy-valid'?'closed_client_accepted':'client_accepted');
  for(const kind of ['disputed','unverified','newer'])await assert.rejects(signedCompletionReport(pool,{requestId:`legacy-${kind}`}),{status:404});
  const [[reconciledAudit]]=await pool.query("SELECT COUNT(*) AS n FROM crms_audit_logs WHERE action_label='Verified Client Sign-off Reconciled'");assert.equal(reconciledAudit.n,1);
  summary.push('Historical reconciliation closes only the verified latest undisputed acceptance, preserves all other states, records one audit and is retry-safe.');
  fs.mkdirSync('docs/evidence/client-implementation',{recursive:true});fs.writeFileSync('docs/evidence/client-implementation/integration.json',JSON.stringify({passed:true,checks:summary},null,2));console.log(summary.join('\n'));
 }finally{
  if(pool)await pool.end();
  if(admin){if(!/^cims_impl_test_\d+_[a-f0-9]{6}$/.test(schema))throw Error('Unsafe cleanup target');await admin.query(`DROP DATABASE IF EXISTS ${mysql.escapeId(schema)}`);await admin.end();}
  await source.end();
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
