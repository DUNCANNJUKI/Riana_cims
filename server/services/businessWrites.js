const missing = () => Object.assign(new Error('One or more records are unavailable in the selected subsidiary.'), { status: 404 });
const { randomUUID } = require('node:crypto');
const isId = value => typeof value === 'string' && /^[a-z0-9-]{1,36}$/i.test(value);

async function assertBusinessClient(db, subsidiaryId, clientId) {
  if (!subsidiaryId) return;
  if (!isId(clientId)) throw missing();
  const [[client]] = await db.query('SELECT id FROM clients WHERE id=? AND subsidiary_id=?', [clientId, subsidiaryId]);
  if (!client) throw missing();
}

async function lockScopedClient(db, subsidiaryId, clientId) {
  const [[client]] = await db.query('SELECT id FROM clients WHERE id=? AND subsidiary_id=? FOR UPDATE', [clientId, subsidiaryId]);
  if (!client) throw missing();
}

async function lockBusinessWrite(db, subsidiaryId, record, previous = null) {
  if (!subsidiaryId) return;
  const identifiers = [
    record.client_id, previous?.client_id, record.branch_id, record.department_id, record.installation_id,
    record.hardware_technician_id, record.software_technician_id, record.assigned_technician_id, record.account_manager_id,
  ];
  if (!isId(record.client_id) || identifiers.some(id => id != null && id !== '' && !isId(id))) throw missing();
  for (const clientId of [...new Set([record.client_id, previous?.client_id].filter(Boolean))].sort()) {
    await lockScopedClient(db, subsidiaryId, clientId);
  }
  if (record.branch_id) {
    const [[branch]] = await db.query(
      'SELECT id FROM client_branches WHERE id=? AND client_id=? AND deleted_at IS NULL AND status=? FOR UPDATE',
      [record.branch_id, record.client_id, 'active'],
    );
    if (!branch) throw missing();
  }
  if (record.department_id) {
    const [[department]] = await db.query(
      'SELECT id FROM client_departments WHERE id=? AND client_id=? AND (? IS NULL OR branch_id=?) AND deleted_at IS NULL AND status=? FOR UPDATE',
      [record.department_id, record.client_id, record.branch_id || null, record.branch_id || null, 'active'],
    );
    if (!department) throw missing();
  }
  if (record.installation_id) {
    const [[installation]] = await db.query(
      'SELECT id FROM installations WHERE id=? AND client_id=? AND branch_id<=>? AND department_id<=>? FOR UPDATE',
      [record.installation_id, record.client_id, record.branch_id || null, record.department_id || null],
    );
    if (!installation) throw missing();
  }
  for (const staffId of [...new Set([
    record.hardware_technician_id, record.software_technician_id, record.assigned_technician_id, record.account_manager_id,
  ].filter(Boolean))].sort()) {
    const [[staff]] = await db.query('SELECT id FROM user_profiles WHERE id=? AND subsidiary_id=? AND is_active=1 FOR UPDATE', [staffId, subsidiaryId]);
    if (!staff) throw missing();
  }
}

async function runBusinessWrite(pool, subsidiaryId, work) {
  if (!subsidiaryId) return work(pool);
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const result = await work(db);
    await db.commit();
    return result;
  } catch (error) {
    await db.rollback().catch(() => undefined);
    throw error;
  } finally {
    db.release();
  }
}

async function decideBusinessRequest(pool, { subsidiaryId, actorId, requestId, status, comment }) {
  if (!subsidiaryId || !actorId || !requestId || !['approved', 'rejected'].includes(status)) {
    throw Object.assign(new Error('Invalid commercial approval decision.'), { status: 400 });
  }
  return runBusinessWrite(pool, subsidiaryId, async db => {
    const [[request]] = await db.query(
      `SELECT cr.id,cr.status,cr.ticket_number,cr.senior_developer_id,c.client_name
       FROM crms_change_requests cr JOIN clients c
         ON CONVERT(cr.client_id USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(c.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
       WHERE cr.id=? AND c.subsidiary_id=? FOR UPDATE`,
      [requestId, subsidiaryId],
    );
    if (!request) throw missing();
    if (request.status !== 'pending_approval') throw Object.assign(new Error('This request is no longer awaiting commercial approval.'), { status: 409 });
    await db.query('UPDATE crms_change_requests SET status=?,approval_comment=? WHERE id=?', [status, comment || null, request.id]);
    await db.query(
      `INSERT INTO crms_audit_logs (id,request_id,action,action_label,details,previous_value,new_value,user_id)
       VALUES (?,?,?,?,?,?,?,?)`,
      [randomUUID(), request.id, status, status === 'approved' ? 'Commercial approval' : 'Commercial rejection', comment || null, request.status, status, actorId],
    );
    return { id: request.id, ticket_number: request.ticket_number, senior_developer_id: request.senior_developer_id, status, client: { name: request.client_name } };
  });
}

module.exports = { assertBusinessClient, lockBusinessWrite, runBusinessWrite, decideBusinessRequest };
