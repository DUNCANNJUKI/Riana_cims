const utf8 = column => `CONVERT(${column} USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
const uuidEquals = (left, right) => `${utf8(left)} = ${utf8(right)}`;

const installationScope = `FROM installations i JOIN clients c ON ${uuidEquals('c.id', 'i.client_id')} WHERE c.subsidiary_id=?`;
const requestScope = `FROM crms_change_requests r JOIN clients c ON ${uuidEquals('c.id', 'r.client_id')}`;
const completedRequest = "r.status IN ('completed','ready_for_completion_report','awaiting_client_acceptance','client_accepted','closed_client_accepted')";
const closedRequest = "r.status IN ('completed','client_accepted','closed_client_accepted','rejected')";
const openInstallation = "COALESCE(i.status,'pending') <> 'completed'";

async function queryBusinessOverview(pool, subsidiaryId, { inventoryEnabled = false } = {}) {
  const [summary, installations, rollup, requests, finance, attention, staff, hardware] = await Promise.all([
    pool.query(
      `SELECT s.subsidiary_name,
         (SELECT COUNT(*) FROM clients c WHERE c.subsidiary_id=s.id) AS clients
       FROM subsidiaries s WHERE s.id=?`, [subsidiaryId],
    ),
    pool.query(`SELECT i.status,COUNT(*) AS total ${installationScope} GROUP BY i.status`, [subsidiaryId]),
    pool.query(
      `SELECT COUNT(CASE WHEN ${openInstallation} AND i.scheduled_end_date<CURDATE() THEN 1 END) AS overdue,
         COUNT(CASE WHEN i.status='completed' AND COALESCE(i.handover_status,'pending')<>'signed' THEN 1 END) AS pending_handovers,
         COALESCE(SUM(i.kiosk_count),0) AS kiosks, COALESCE(SUM(i.screen_count),0) AS displays,
         COALESCE(SUM(i.service_points),0) AS service_points, COALESCE(SUM(i.media_controllers),0) AS media_controllers,
         AVG(CASE WHEN i.status='completed' AND i.completion_date>=i.assigned_date
           THEN DATEDIFF(i.completion_date,i.assigned_date) END) AS average_days,
         COUNT(CASE WHEN i.status='completed' AND i.completion_date IS NOT NULL AND i.scheduled_end_date IS NOT NULL THEN 1 END) AS measured,
         COUNT(CASE WHEN i.status='completed' AND i.completion_date<=i.scheduled_end_date THEN 1 END) AS on_time
       ${installationScope}`, [subsidiaryId],
    ),
    pool.query(
      `SELECT COUNT(CASE WHEN NOT (${closedRequest}) THEN 1 END) AS open,
         COUNT(CASE WHEN ${completedRequest} THEN 1 END) AS completed,
         COUNT(CASE WHEN r.status='pending_approval' THEN 1 END) AS pending_approvals,
         COUNT(CASE WHEN r.status='awaiting_client_acceptance' THEN 1 END) AS pending_acceptance,
         COUNT(CASE WHEN NOT (${closedRequest}) AND r.estimated_completion_date<CURDATE() THEN 1 END) AS overdue
       ${requestScope} WHERE c.subsidiary_id=?`, [subsidiaryId],
    ),
    pool.query(
      `SELECT b.currency,COUNT(*) AS budgets,CAST(SUM(b.total_budget) AS CHAR) AS recorded_budget
       FROM installation_budgets b JOIN installations i ON ${uuidEquals('i.id','b.installation_id')}
       JOIN clients c ON ${uuidEquals('c.id','i.client_id')}
       WHERE c.subsidiary_id=? AND b.is_current=TRUE GROUP BY b.currency ORDER BY b.currency`, [subsidiaryId],
    ),
    pool.query(
      `SELECT i.id,c.client_name,i.status,DATE_FORMAT(i.scheduled_end_date,'%Y-%m-%d') AS due_date,
         CASE WHEN i.status='completed' THEN 'Pending signed handover'
           WHEN i.scheduled_end_date<CURDATE() THEN 'Overdue installation' ELSE 'Upcoming installation deadline' END AS reason
       ${installationScope}
       AND ((${openInstallation} AND i.scheduled_end_date<=DATE_ADD(CURDATE(),INTERVAL 7 DAY))
         OR (i.status='completed' AND COALESCE(i.handover_status,'pending')<>'signed'))
       ORDER BY (i.scheduled_end_date IS NULL),i.scheduled_end_date,i.id LIMIT 15`, [subsidiaryId],
    ),
    pool.query(
      `SELECT COUNT(*) AS assignments, COUNT(CASE WHEN a.status='completed' THEN 1 END) AS completed_assignments,
         COUNT(CASE WHEN COALESCE(a.status,'assigned')<>'completed' AND a.scheduled_end_date<CURDATE() THEN 1 END) AS overdue_assignments,
         (SELECT COUNT(*) FROM user_profiles u WHERE u.subsidiary_id=? AND u.is_active=TRUE
           AND EXISTS (SELECT 1 FROM client_assignments ca JOIN clients cl ON ${uuidEquals('cl.id','ca.client_id')}
             WHERE cl.subsidiary_id=u.subsidiary_id AND (${uuidEquals('ca.hardware_technician_id','u.id')} OR
               ${uuidEquals('ca.software_technician_id','u.id')}))) AS active_technicians
       FROM client_assignments a JOIN clients c ON ${uuidEquals('c.id','a.client_id')}
       WHERE c.subsidiary_id=?`,
      [subsidiaryId, subsidiaryId],
    ),
    inventoryEnabled ? pool.query(
      `SELECT COUNT(*) AS allocated, COUNT(CASE WHEN status='Installed' THEN 1 END) AS deployed,
         COUNT(CASE WHEN status='Faulty' THEN 1 END) AS faulty
       FROM hardware_assets WHERE subsidiary_id=? AND deleted_at IS NULL AND archived_at IS NULL`, [subsidiaryId],
    ) : Promise.resolve([[null]]),
  ]);
  return {
    business: summary[0][0] || null,
    installation_statuses: installations[0],
    installations: rollup[0][0],
    request_totals: requests[0][0],
    finance: finance[0],
    attention: attention[0],
    team: staff[0][0],
    inventory: hardware[0][0],
  };
}

async function queryBusinessRequests(pool, subsidiaryId, { category = 'all', search = '', after = '', before = '', offset = 0 } = {}) {
  const filter = {
    approvals: " AND r.status='pending_approval'",
    overdue: ` AND NOT (${closedRequest}) AND r.estimated_completion_date<CURDATE()`,
    development: " AND r.status IN ('approved','assigned','in_progress','waiting','ready_for_completion_report','awaiting_client_acceptance')",
    all: '',
  }[category] ?? '';
  const clauses = [];
  const values = [subsidiaryId];
  if (search) {
    clauses.push(' AND (LOCATE(?,r.ticket_number)>0 OR LOCATE(?,c.client_name)>0 OR LOCATE(?,r.change_description)>0)');
    values.push(search, search, search);
  }
  if (after) { clauses.push(' AND r.date_requested>=?'); values.push(after); }
  if (before) { clauses.push(' AND r.date_requested<=?'); values.push(before); }
  const [rows] = await pool.query(
    `SELECT r.id,r.ticket_number,r.status,r.priority,c.client_name,
       DATE_FORMAT(r.date_requested,'%Y-%m-%d') AS requested_on, DATE_FORMAT(r.estimated_completion_date,'%Y-%m-%d') AS due_date
     ${requestScope} WHERE c.subsidiary_id=?${filter}${clauses.join('')}
     ORDER BY ${category === 'overdue' ? 'r.estimated_completion_date,' : ''}r.updated_at DESC,r.id LIMIT 51 OFFSET ?`,
    [...values, offset],
  );
  return { rows: rows.slice(0, 50), hasMore: rows.length > 50 };
}

async function queryBusinessRequest(pool, subsidiaryId, id) {
  const [[request]] = await pool.query(
    `SELECT r.id,r.ticket_number,r.status,r.priority,c.client_name,
       r.change_description,r.approval_comment,r.is_chargeable,r.department,
       DATE_FORMAT(r.date_requested,'%Y-%m-%d') AS requested_on,
       DATE_FORMAT(r.estimated_completion_date,'%Y-%m-%d') AS due_date,
       CONCAT_WS(' ',d.first_name,d.last_name) AS developer
     ${requestScope} LEFT JOIN user_profiles d ON ${uuidEquals('d.id','r.assigned_developer_id')}
     WHERE c.subsidiary_id=? AND r.id=?`, [subsidiaryId, id],
  );
  if (!request) return null;

  const [reports, history] = await Promise.all([
    pool.query(
      `SELECT p.version_number,p.status,p.summary_of_change,p.implemented_solution,p.testing_performed,p.outstanding_items,
         DATE_FORMAT(p.deployment_date,'%Y-%m-%d') AS deployed_on
       FROM crms_completion_reports p JOIN crms_change_requests r ON ${uuidEquals('r.id','p.change_request_id')}
       JOIN clients c ON ${uuidEquals('c.id','r.client_id')}
       WHERE c.subsidiary_id=? AND r.id=? AND p.status IN ('sent','accepted','rejected','disputed')
       ORDER BY p.version_number DESC LIMIT 1`, [subsidiaryId, id],
    ),
    pool.query(
      `SELECT a.id,a.action_label,a.details,a.previous_value,a.new_value,a.created_at,
         CONCAT_WS(' ',u.first_name,u.last_name) AS actor
       FROM crms_audit_logs a JOIN crms_change_requests r ON ${uuidEquals('r.id','a.request_id')}
       JOIN clients c ON ${uuidEquals('c.id','r.client_id')}
       LEFT JOIN user_profiles u ON ${uuidEquals('u.id','a.user_id')}
       WHERE c.subsidiary_id=? AND r.id=? AND a.action IN ('approved','rejected','status_changed','assigned','started','completed')
       ORDER BY a.created_at DESC,a.id LIMIT 30`, [subsidiaryId, id],
    ),
  ]);
  return { ...request, report: reports[0][0] || null, history: history[0] };
}

async function queryBusinessActivity(pool, subsidiaryId) {
  const [rows] = await pool.query(
    `SELECT * FROM (
       SELECT ${utf8('a.id')} AS id,'Budget' AS category,${utf8('a.action')} AS action,c.client_name,a.created_at
       FROM installation_budget_audit a JOIN installations i ON ${uuidEquals('i.id','a.installation_id')}
       JOIN clients c ON ${uuidEquals('c.id','i.client_id')} WHERE c.subsidiary_id=?
       UNION ALL
       SELECT ${utf8('a.id')},'Change request',${utf8('a.action')},c.client_name,a.created_at
       FROM crms_audit_logs a JOIN crms_change_requests r ON ${uuidEquals('r.id','a.request_id')}
       JOIN clients c ON ${uuidEquals('c.id','r.client_id')} WHERE c.subsidiary_id=?
       UNION ALL
       SELECT ${utf8('h.id')},'Handover','uploaded',c.client_name,h.upload_date
       FROM handover_uploads h JOIN clients c ON ${uuidEquals('c.id','h.client_id')} WHERE c.subsidiary_id=?
       UNION ALL
       SELECT ${utf8('a.id')},'Assignment','updated',c.client_name,a.updated_at
       FROM client_assignments a JOIN clients c ON ${uuidEquals('c.id','a.client_id')} WHERE c.subsidiary_id=?
     ) activity ORDER BY created_at DESC,id LIMIT 100`,
    [subsidiaryId, subsidiaryId, subsidiaryId, subsidiaryId],
  );
  return rows;
}
module.exports = { queryBusinessOverview, queryBusinessRequests, queryBusinessRequest, queryBusinessActivity };
