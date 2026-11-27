const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { queryBusinessOverview, queryBusinessRequests, queryBusinessRequest, queryBusinessActivity } = require('./businessOverview');

const database = process.env.BUSINESS_TEST_DATABASE;

test('isolated MySQL business overview, requests, approval history and inventory use the assigned subsidiary', { skip: !database }, async () => {
  assert.equal(process.env.HARDWARE_TEST_HOST, '127.0.0.1');
  assert.match(database, /^cims_hardware_test_biz_[a-z0-9_]+$/);
  const options = {
    host: '127.0.0.1',
    user: process.env.HARDWARE_TEST_USER || 'root',
    password: process.env.HARDWARE_TEST_PASSWORD || '',
  };
  const admin = await mysql.createConnection(options);
  try { await admin.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]); }
  finally { await admin.end(); }
  const pool = mysql.createPool({ ...options, database });
  try {
    const schema = [
      'CREATE TABLE subsidiaries (id VARCHAR(36) PRIMARY KEY, subsidiary_name VARCHAR(80))',
      'CREATE TABLE clients (id VARCHAR(36) PRIMARY KEY, subsidiary_id VARCHAR(36), client_name VARCHAR(80))',
      'CREATE TABLE user_profiles (id VARCHAR(36) PRIMARY KEY, subsidiary_id VARCHAR(36), first_name VARCHAR(80), last_name VARCHAR(80), is_active BOOLEAN)',
      'CREATE TABLE installations (id VARCHAR(36) PRIMARY KEY, client_id VARCHAR(36), status VARCHAR(20), scheduled_end_date DATE, assigned_date DATE, completion_date DATE, handover_status VARCHAR(20), kiosk_count INT, screen_count INT, service_points INT, media_controllers INT)',
      'CREATE TABLE client_assignments (id VARCHAR(36) PRIMARY KEY,client_id VARCHAR(36),status VARCHAR(20),scheduled_end_date DATE,hardware_technician_id VARCHAR(36),software_technician_id VARCHAR(36),updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
      'CREATE TABLE installation_budgets (id VARCHAR(36) PRIMARY KEY,installation_id VARCHAR(36),currency VARCHAR(3),total_budget DECIMAL(10,2),is_current BOOLEAN)',
      'CREATE TABLE crms_change_requests (id VARCHAR(36) PRIMARY KEY,client_id VARCHAR(36),ticket_number VARCHAR(20),status VARCHAR(30),priority VARCHAR(20),date_requested DATE,estimated_completion_date DATE,change_description TEXT,approval_comment TEXT,is_chargeable BOOLEAN,department VARCHAR(80),assigned_developer_id VARCHAR(36),updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) COLLATE=utf8mb4_general_ci',
      'CREATE TABLE crms_audit_logs (id VARCHAR(36) PRIMARY KEY,request_id VARCHAR(36),action VARCHAR(30),action_label VARCHAR(50),details TEXT,previous_value TEXT,new_value TEXT,user_id VARCHAR(36),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) COLLATE=utf8mb4_general_ci',
      'CREATE TABLE crms_completion_reports (id VARCHAR(36) PRIMARY KEY,change_request_id VARCHAR(36),version_number INT,status VARCHAR(20),summary_of_change TEXT,implemented_solution TEXT,testing_performed TEXT,outstanding_items TEXT,deployment_date DATE,acceptance_token VARCHAR(50))',
      'CREATE TABLE hardware_assets (id VARCHAR(36) PRIMARY KEY,subsidiary_id VARCHAR(36),status VARCHAR(20),archived_at DATETIME,deleted_at DATETIME)',
      'CREATE TABLE installation_budget_audit (id VARCHAR(36) PRIMARY KEY,installation_id VARCHAR(36),action VARCHAR(20),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
      'CREATE TABLE handover_uploads (id VARCHAR(36) PRIMARY KEY,client_id VARCHAR(36),upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
      'CREATE TABLE roles (id VARCHAR(36) PRIMARY KEY)',
      'CREATE TABLE permissions (id VARCHAR(36) PRIMARY KEY,module_id VARCHAR(12),code VARCHAR(50))',
      'CREATE TABLE role_permissions (role_id VARCHAR(36),permission_id VARCHAR(36),PRIMARY KEY(role_id,permission_id),FOREIGN KEY(role_id) REFERENCES roles(id),FOREIGN KEY(permission_id) REFERENCES permissions(id))',
    ];
    for (const sql of schema) await pool.query(sql);
    const seed = [
      "INSERT INTO subsidiaries VALUES ('a','Assigned'),('b','Another subsidiary')",
      "INSERT INTO clients VALUES ('ca','a','Own client'),('cb','b','Outside client')",
      "INSERT INTO user_profiles VALUES ('ta','a','A','Tech',TRUE),('tb','b','B','Tech',TRUE)",
      "INSERT INTO installations VALUES ('ia','ca','completed','2026-01-05','2026-01-01','2026-01-04','signed',2,3,4,5),('ib','cb','in_progress','2026-01-05','2026-01-01',NULL,'pending',90,90,90,90)",
      "INSERT INTO client_assignments (id,client_id,status,hardware_technician_id,software_technician_id) VALUES ('aa','ca','completed','ta','ta'),('ab','cb','assigned','tb',NULL)",
      "INSERT INTO installation_budgets VALUES ('ba','ia','KES',110.00,TRUE),('old','ia','KES',100.00,FALSE),('overseas','ia','USD',9.00,TRUE),('bb','ib','KES',999.00,TRUE)",
      "INSERT INTO crms_change_requests (id,client_id,ticket_number,status,priority,date_requested,estimated_completion_date,change_description) VALUES ('ra','ca','CR-OWN','pending_approval','high','2026-01-01','2026-01-10','Review scope'),('rb','cb','CR-OUTSIDE','pending_approval','high','2026-01-01','2026-01-10','Outside scope')",
      "INSERT INTO crms_completion_reports VALUES ('pa','ra',1,'sent','Scope','Implemented',NULL,NULL,NULL,'private-token'),('pb','rb',1,'accepted','Outside','Outside',NULL,NULL,NULL,'outside-token')",
      "INSERT INTO crms_audit_logs (id,request_id,action,action_label) VALUES ('wa','ra','status_changed','Submitted'),('wb','rb','status_changed','Submitted')",
      "INSERT INTO hardware_assets VALUES ('ha','a','Installed',NULL,NULL),('hb','b','Faulty',NULL,NULL),('old','a','Faulty',NOW(),NULL)",
      "INSERT INTO installation_budget_audit (id,installation_id,action) VALUES ('fa','ia','created'),('fb','ib','created')",
      "INSERT INTO handover_uploads (id,client_id) VALUES ('ua','ca'),('ub','cb')",
      "INSERT INTO roles VALUES ('cims:HeadOfBusiness')",
      "INSERT INTO permissions VALUES ('read-finance','cims','finances.view'),('write-finance','cims','finances.manage'),('read-hardware','cims','inventory.view')",
    ];
    for (const sql of seed) await pool.query(sql);

    const result = await queryBusinessOverview(pool, 'a', { inventoryEnabled: true });
    assert.deepEqual(result.installation_statuses, [{ status: 'completed', total: 1 }]);
    assert.equal(result.business.clients, 1);
    assert.equal(result.installations.kiosks, '2');
    assert.equal(Number(result.installations.average_days), 3);
    assert.equal(result.team.active_technicians, 1);
    assert.equal(result.team.completed_assignments, 1);
    assert.equal(result.request_totals.pending_approvals, 1);
    assert.deepEqual(result.inventory, { allocated: 1, deployed: 1, faulty: 0 });
    assert.deepEqual(result.finance.map(row => [row.currency, row.recorded_budget]), [['KES', '110.00'], ['USD', '9.00']]);
    assert.deepEqual((await queryBusinessRequests(pool, 'a', { category: 'approvals' })).rows.map(row => row.id), ['ra']);
    assert.deepEqual((await queryBusinessRequests(pool, 'a', { search: 'CR-OUTSIDE' })).rows, []);
    assert.deepEqual((await queryBusinessRequests(pool, 'a', { search: "' OR 1=1" })).rows, []);
    assert.equal(await queryBusinessRequest(pool, 'a', 'rb'), null);
    const detail = await queryBusinessRequest(pool, 'a', 'ra');
    assert.equal(detail.report.status, 'sent');
    assert.equal(detail.report.acceptance_token, undefined);
    assert.deepEqual(detail.history.map(row => row.id), ['wa']);
    const events = await queryBusinessActivity(pool, 'a');
    assert.deepEqual(new Set(events.map(row => row.id)), new Set(['fa', 'aa', 'ua', 'wa']));
    assert.ok(events.every(event => event.client_name === 'Own client'));

    const migration = fs.readFileSync(path.join(__dirname, '../migrations/20261127_business_module_access.sql'), 'utf8');
    await pool.query(migration);
    await pool.query(migration);
    const [permissions] = await pool.query('SELECT permission_id FROM role_permissions ORDER BY permission_id');
    assert.deepEqual(permissions.map(row => row.permission_id), ['read-finance', 'read-hardware']);
  } finally { await pool.end(); }
});
