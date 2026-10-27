const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { createChallenge, verifyChallenge } = require('../utils/twoFactor');
const { getSmsBalance, sendEmail, sendSms, sendWhatsApp, whatsappConfigured, whatsappStatus } = require('../services/notifications');
const { sendUserNotification, sendUsersNotification } = require('../services/notificationDispatcher');
const { canonicalAppUrl } = require('../security/apiSecurity');
const { createSingleActiveSession, validateAuthenticatedSession } = require('../security/sessionStore');
const { normalizeNotificationType } = require('../services/notificationTypes');
const { deliveryForCrmsEvent, resolveCompletionRecipientId } = require('./crmsNotificationPolicy');

const CRMS_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const ALLOWED_ROLES = new Set(['SuperAdmin', 'Admin', 'Management', 'Teamlead', 'Developer', 'Sales']);
const roleToCrms = (role) => ({ SuperAdmin: 'admin', Admin: 'admin', Management: 'admin', Teamlead: 'senior_developer', Developer: 'developer', Sales: 'sales' })[role];
const roleFromCrms = (role) => ({ admin: 'Admin', senior_developer: 'Teamlead', developer: 'Developer', sales: 'Sales' })[role];
const fullName = (user) => `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
const profileShape = (user) => ({
  id: user.id,
  user_id: user.id,
  name: fullName(user),
  email: user.email,
  department: user.designation || user.department_name || '',
  avatar_url: user.avatar_url || null,
  phone_number: user.phone_number || null,
  status: user.is_active ? 'active' : 'suspended',
  role: roleToCrms(user.role),
  created_at: user.created_at,
  updated_at: user.updated_at,
});

const isBcryptHash = (value) => /^\$2[aby]\$\d{2}\$/.test(String(value || ''));
const passwordMatches = async (password, storedPassword) => {
  if (!storedPassword) return false;
  return isBcryptHash(storedPassword)
    ? bcrypt.compare(String(password || ''), storedPassword)
    : String(password || '') === String(storedPassword);
};

const hasRole = (req, ...roles) => ['SuperAdmin', 'Management'].includes(req.user.role) || roles.includes(req.user.role);
const denyUnlessRole = (req, res, ...roles) => {
  if (hasRole(req, ...roles)) return false;
  res.status(403).json({ error: 'You do not have permission to perform this action.' });
  return true;
};

const REQUEST_UPDATE_FIELDS = {
  SuperAdmin: new Set(['client_id','branch_id','department_id','installation_id','department','source','change_description','priority','status','modules_affected','estimated_completion_date','senior_developer_id','assigned_developer_id','approval_comment','is_chargeable','sales_remarks','commencement_date','completion_date']),
  Admin: new Set(['client_id','branch_id','department_id','installation_id','department','source','change_description','priority','status','modules_affected','estimated_completion_date','senior_developer_id','assigned_developer_id','approval_comment','is_chargeable','sales_remarks','commencement_date','completion_date']),
  Management: new Set(['client_id','branch_id','department_id','installation_id','department','source','change_description','priority','status','modules_affected','estimated_completion_date','senior_developer_id','assigned_developer_id','approval_comment','is_chargeable','sales_remarks','commencement_date','completion_date']),
  Sales: new Set(['status','approval_comment','is_chargeable','sales_remarks']),
  Teamlead: new Set(['priority','status','estimated_completion_date','senior_developer_id','assigned_developer_id','commencement_date','completion_date']),
  Developer: new Set(['status','commencement_date','completion_date']),
};

const REQUEST_STATUSES = {
  Sales: new Set(['pending_approval', 'approved', 'rejected', 'waiting_clarification']),
  Teamlead: new Set(['approved', 'assigned', 'in_progress', 'waiting_clarification', 'completed']),
  Developer: new Set(['in_progress', 'waiting_clarification', 'completed']),
};
const storedRequestStatus = (status) => status === 'waiting_clarification' ? 'waiting' : status;

module.exports = function createCrmsRouter({ pool, jwtSecret }) {
  const router = express.Router();
  const tableColumnCache = new Map();

  const getTableColumns = async (tableName) => {
    if (tableColumnCache.has(tableName)) return tableColumnCache.get(tableName);
    const [rows] = await pool.query(`SHOW COLUMNS FROM \`${tableName}\``);
    const columns = new Set(rows.map((row) => row.Field));
    tableColumnCache.set(tableName, columns);
    return columns;
  };

  const hasTableColumn = async (tableName, columnName) => (await getTableColumns(tableName)).has(columnName);

  const normalizeNullableId = (value) => {
    const normalized = String(value || '').trim();
    return normalized && normalized !== 'all' && normalized !== 'none' ? normalized : null;
  };

  const validateRequestScope = async ({ clientId, branchId, departmentId, installationId }) => {
    const normalizedClientId = normalizeNullableId(clientId);
    let normalizedBranchId = normalizeNullableId(branchId);
    const normalizedDepartmentId = normalizeNullableId(departmentId);
    const normalizedInstallationId = normalizeNullableId(installationId);

    if (!normalizedClientId) throw Object.assign(new Error('client_id is required.'), { status: 400 });

    const [clients] = await pool.query('SELECT id FROM clients WHERE id = ? LIMIT 1', [normalizedClientId]);
    if (!clients.length) throw Object.assign(new Error('Client not found.'), { status: 404 });

    if (normalizedDepartmentId) {
      const [departments] = await pool.query(
        'SELECT id,client_id,branch_id,department_name,status,deleted_at FROM client_departments WHERE id = ? LIMIT 1',
        [normalizedDepartmentId],
      );
      const department = departments[0];
      if (!department || String(department.client_id) !== String(normalizedClientId) || department.deleted_at || String(department.status || 'active').toLowerCase() !== 'active') {
        throw Object.assign(new Error('Selected department does not belong to this active client.'), { status: 400 });
      }
      if (normalizedBranchId && String(department.branch_id) !== String(normalizedBranchId)) {
        throw Object.assign(new Error('Selected department does not belong to the selected branch.'), { status: 400 });
      }
      normalizedBranchId = normalizedBranchId || department.branch_id;
    }

    if (normalizedBranchId) {
      const [branches] = await pool.query(
        'SELECT id,client_id,status,deleted_at FROM client_branches WHERE id = ? LIMIT 1',
        [normalizedBranchId],
      );
      const branch = branches[0];
      if (!branch || String(branch.client_id) !== String(normalizedClientId) || branch.deleted_at || String(branch.status || 'active').toLowerCase() !== 'active') {
        throw Object.assign(new Error('Selected branch does not belong to this active client.'), { status: 400 });
      }
    }

    if (normalizedInstallationId) {
      const [installations] = await pool.query(
        'SELECT id,client_id,branch_id,department_id FROM installations WHERE id = ? LIMIT 1',
        [normalizedInstallationId],
      );
      const installation = installations[0];
      if (!installation || String(installation.client_id) !== String(normalizedClientId)) {
        throw Object.assign(new Error('Selected installation does not belong to this client.'), { status: 400 });
      }
      if (normalizedBranchId && installation.branch_id && String(installation.branch_id) !== String(normalizedBranchId)) {
        throw Object.assign(new Error('Selected installation does not belong to the selected branch.'), { status: 400 });
      }
      if (normalizedDepartmentId && installation.department_id && String(installation.department_id) !== String(normalizedDepartmentId)) {
        throw Object.assign(new Error('Selected installation does not belong to the selected department.'), { status: 400 });
      }
      normalizedBranchId = normalizedBranchId || installation.branch_id || null;
    }

    return {
      clientId: normalizedClientId,
      branchId: normalizedBranchId || null,
      departmentId: normalizedDepartmentId,
      installationId: normalizedInstallationId,
    };
  };

  const finishLogin = async (req, res, user) => {
    const sessionId = uuidv4();
    const sessionVersion = Number(user.session_version || 0);
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, scope: 'crms', sv: sessionVersion, sid: sessionId },
      jwtSecret,
      { expiresIn: '12h' },
    );
    await createSingleActiveSession({
      pool,
      userId: user.id,
      sessionId,
      token,
      req,
      expiresAt: new Date(Date.now() + CRMS_SESSION_MAX_AGE_MS),
    });
    res.json({ success: true, user: profileShape(user), token });
  };

  const requestActionUrl = (req, requestId) =>
    `${canonicalAppUrl(req).replace(/\/+$/, '')}/developers/requests/${encodeURIComponent(requestId)}`;

  const requestSummary = (request) => ({
    ticketNumber: request.ticket_number,
    clientName: request.client?.name || 'Unknown Client',
    requestDescription: request.change_description,
  });

  const notifySalesApprovalNeeded = async (req, request) => {
    if (request.status !== 'pending_approval') return;
    const [salesUsers] = await pool.query(
      `SELECT u.id
       FROM user_profiles u
       LEFT JOIN user_module_roles umr ON umr.user_id = u.id AND umr.module_id = 'crms'
       LEFT JOIN roles r ON r.id = umr.role_id
       WHERE u.is_active = TRUE AND COALESCE(r.code,u.role) = 'Sales'`,
    );
    const userIds = salesUsers.map((user) => user.id);
    if (!userIds.length) return;
    const actionUrl = requestActionUrl(req, request.id);
    const delivery = deliveryForCrmsEvent('approval_needed');
    await sendUsersNotification({
      pool,
      userIds,
      title: 'Change request awaiting approval',
      message: `${request.ticket_number} for ${request.client?.name || 'Unknown Client'} is awaiting Sales approval. Open RIANA CIMS to review it: ${actionUrl}`,
      type: 'warning',
      actionUrl,
      requestId: request.id,
      notificationType: 'approval_needed',
      ...delivery,
      smsMessage: `RIANA CIMS: ${request.ticket_number} is awaiting Sales approval. Review: ${actionUrl}`,
      details: requestSummary(request),
    });
  };

  const notifyAssignedDeveloper = async (req, request) => {
    if (!request.assigned_developer_id) return;
    const actionUrl = requestActionUrl(req, request.id);
    const delivery = deliveryForCrmsEvent('assigned');
    await sendUserNotification({
      pool,
      userId: request.assigned_developer_id,
      title: 'Change request assigned',
      message: `You have been assigned ${request.ticket_number} for ${request.client?.name || 'Unknown Client'}. Open RIANA CIMS to review it: ${actionUrl}`,
      type: 'info',
      actionUrl,
      requestId: request.id,
      notificationType: 'assigned',
      ...delivery,
      smsMessage: `RIANA CIMS: ${request.ticket_number} assigned to you. Review: ${actionUrl}`,
      details: {
        ...requestSummary(request),
        developerName: request.assigned_developer?.name,
      },
    });
  };

  const notifySeniorDeveloperStatus = async (req, request, previousStatus) => {
    if (!request.senior_developer_id || previousStatus === request.status) return;
    const notificationType = ({
      approved: 'approved',
      rejected: 'rejected',
      waiting_clarification: 'waiting_clarification',
      waiting: 'waiting_clarification',
      in_progress: 'commenced',
    })[request.status];
    if (!notificationType) return;
    const actionUrl = requestActionUrl(req, request.id);
    await sendUserNotification({
      pool,
      userId: request.senior_developer_id,
      title: `Change request ${String(request.status).replace(/_/g, ' ')}`,
      message: `${request.ticket_number} for ${request.client?.name || 'Unknown Client'} changed from ${String(previousStatus).replace(/_/g, ' ')} to ${String(request.status).replace(/_/g, ' ')}. Open RIANA CIMS: ${actionUrl}`,
      type: request.status === 'rejected' ? 'error' : ['waiting', 'waiting_clarification'].includes(request.status) ? 'warning' : 'success',
      actionUrl,
      requestId: request.id,
      notificationType,
      email: true,
      sms: false,
      details: requestSummary(request),
    });
  };

  const recordAssignmentActor = async (req, request, previousAssigneeId) => {
    await pool.query(
      `INSERT INTO crms_audit_logs
        (id,request_id,action,action_label,details,previous_value,new_value,user_id)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        uuidv4(),
        request.id,
        'assigned',
        `Assigned to ${request.assigned_developer?.name || 'developer'}`,
        `Request assigned to ${request.assigned_developer?.name || 'developer'}`,
        previousAssigneeId || null,
        request.assigned_developer_id,
        req.user.id,
      ],
    );
  };

  const notifyAssignerOnCompletion = async (req, request) => {
    const [assignmentEvents] = await pool.query(
      `SELECT user_id
       FROM crms_audit_logs
       WHERE request_id = ? AND action = 'assigned' AND user_id IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [request.id],
    );
    const recipientId = resolveCompletionRecipientId({
      assignedByUserId: assignmentEvents[0]?.user_id,
      seniorDeveloperId: request.senior_developer_id,
      completedByUserId: req.user.id,
    });
    if (!recipientId) return;

    const actionUrl = requestActionUrl(req, request.id);
    const delivery = deliveryForCrmsEvent('completed');
    await sendUserNotification({
      pool,
      userId: recipientId,
      title: 'Assigned change request completed',
      message: `${request.ticket_number} for ${request.client?.name || 'Unknown Client'} has been marked complete by ${request.assigned_developer?.name || 'the assigned developer'}. Open RIANA CIMS to verify it: ${actionUrl}`,
      type: 'success',
      actionUrl,
      requestId: request.id,
      notificationType: 'completed',
      ...delivery,
      smsMessage: `RIANA CIMS: ${request.ticket_number} has been marked complete. Verify: ${actionUrl}`,
      details: {
        ...requestSummary(request),
        developerName: request.assigned_developer?.name,
      },
    });
  };

  router.post('/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      const [rows] = await pool.query(
        `SELECT u.*,d.department_name FROM user_profiles u
         LEFT JOIN departments d ON d.id = u.department_id
         WHERE LOWER(u.email) = LOWER(?) LIMIT 1`,
        [email],
      );
      if (!rows.length || !(await passwordMatches(password, rows[0].password))) return res.status(401).json({ error: 'Invalid email or password' });
      const user = rows[0];
      if (!user.is_active) return res.status(403).json({ error: 'Your account is suspended.' });
      if (!ALLOWED_ROLES.has(user.role)) return res.status(403).json({ error: 'Developers access requires an authorized Developers workspace role.' });
      if (!isBcryptHash(user.password)) {
        const passwordHash = await bcrypt.hash(String(password), 12);
        await pool.query('UPDATE user_profiles SET password = ? WHERE id = ? AND password = ?', [passwordHash, user.id, user.password]);
      }
      if (user.two_factor_enabled) {
        const challenge = await createChallenge(pool, user, jwtSecret);
        return res.json({ success: true, requiresTwoFactor: true, ...challenge });
      }
      await finishLogin(req, res, user);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/auth/verify-2fa', async (req, res) => {
    try {
      const challenge = await verifyChallenge(pool, req.body.challengeId, req.body.code, jwtSecret);
      if (!challenge) return res.status(401).json({ error: 'Invalid or expired verification code.' });
      const [rows] = await pool.query('SELECT * FROM user_profiles WHERE id = ? AND is_active = TRUE LIMIT 1', [challenge.user_id]);
      if (!rows.length || !ALLOWED_ROLES.has(rows[0].role)) return res.status(403).json({ error: 'Access denied.' });
      await finishLogin(req, res, rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.use(async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Authentication required.' });
    try {
      const decoded = jwt.verify(token, jwtSecret);
      if (!decoded.id) return res.status(401).json({ error: 'Invalid session.' });
      const [users] = await pool.query(
        `SELECT u.id,u.email,CASE WHEN u.role = 'SuperAdmin' THEN 'SuperAdmin' ELSE COALESCE(r.code,u.role) END AS role,u.is_active,u.session_version
         FROM user_profiles u
         LEFT JOIN user_module_roles umr ON umr.user_id = u.id AND umr.module_id = 'crms'
         LEFT JOIN roles r ON r.id = umr.role_id
         WHERE u.id = ? LIMIT 1`,
        [decoded.id],
      );
      if (!users.length || !users[0].is_active) return res.status(401).json({ success: false, code: 'ACCOUNT_DISABLED', error: 'Account is unavailable.', message: 'Your account is disabled. Contact an administrator.' });
      if (!ALLOWED_ROLES.has(users[0].role)) return res.status(403).json({ error: 'Developers access denied.' });
      if (Number(decoded.sv || 0) !== Number(users[0].session_version || 0)) return res.status(401).json({ success: false, code: 'SESSION_REVOKED', error: 'Session has been revoked. Please sign in again.', message: 'Your session is no longer active. Please sign in again.' });
      const session = await validateAuthenticatedSession(pool, { userId: users[0].id, sessionId: decoded.sid, token });
      if (!session.valid) return res.status(401).json({ success: false, code: session.code, error: session.message, message: session.message });
      req.user = { ...decoded, id: users[0].id, email: users[0].email, role: users[0].role, sid: decoded.sid || null, sv: Number(users[0].session_version || 0) };
      next();
    } catch (error) {
      const expired = error?.name === 'TokenExpiredError';
      res.status(401).json({ success: false, code: expired ? 'TOKEN_EXPIRED' : 'SESSION_REVOKED', error: expired ? 'Your session has expired. Please sign in again.' : 'Invalid or expired session.', message: expired ? 'Your session has expired. Please sign in again.' : 'Invalid or expired session.' });
    }
  });

  router.get('/profiles', async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT u.*,COALESCE(r.code,u.role) AS role,d.department_name FROM user_profiles u
         LEFT JOIN departments d ON d.id = u.department_id
         LEFT JOIN user_module_roles umr ON umr.user_id = u.id AND umr.module_id = 'crms'
         LEFT JOIN roles r ON r.id = umr.role_id
         WHERE COALESCE(r.code,u.role) IN ('SuperAdmin','Admin','Management','Teamlead','Developer','Sales') ORDER BY u.first_name,u.last_name`,
      );
      res.json(rows.map(profileShape));
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  const denyCrmsUserManagement = (_req, res) => res.status(403).json({
    error: 'Users and roles are managed from the main CIMS Users module.',
  });

  router.post('/profiles', denyCrmsUserManagement);

  router.patch('/profiles/:id', denyCrmsUserManagement);

  router.delete('/profiles/:id', denyCrmsUserManagement);

  router.get('/user_roles', async (_req, res) => {
    try {
      const [rows] = await pool.query(`SELECT umr.user_id,r.code AS role FROM user_module_roles umr JOIN roles r ON r.id=umr.role_id WHERE umr.module_id='crms'`);
      res.json(rows.map((row) => ({ id: `role-${row.user_id}`, user_id: row.user_id, role: roleToCrms(row.role) })));
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  router.post('/user_roles', denyCrmsUserManagement);

  router.patch('/user_roles/:id', denyCrmsUserManagement);

  router.delete('/user_roles/:id', denyCrmsUserManagement);

  const clientSelect = `SELECT c.id,c.client_name AS name,c.branch,LOWER(c.contract_type) AS contract_type,
    c.contact_person_name AS contact_person,c.contact_email,c.contact_phone,c.subsidiary_id,
    s.subsidiary_name,c.created_at,c.updated_at FROM clients c
    LEFT JOIN subsidiaries s ON s.id = c.subsidiary_id`;
  router.get('/clients', async (_req, res) => {
    try { const [rows] = await pool.query(`${clientSelect} ORDER BY client_name`); res.json(rows); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });
  router.get('/clients/:id/scope', async (req, res) => {
    try {
      const [clients] = await pool.query('SELECT id,branch FROM clients WHERE id = ? LIMIT 1', [req.params.id]);
      if (!clients.length) return res.status(404).json({ error: 'Client not found.' });

      const [branches] = await pool.query(
        `SELECT id,client_id,branch_name,branch_code,status,contact_person_name,contact_email,contact_phone,created_at,updated_at
         FROM client_branches
         WHERE client_id = ? AND deleted_at IS NULL AND LOWER(COALESCE(status,'active')) = 'active'
         ORDER BY branch_name ASC`,
        [req.params.id],
      );
      const [departments] = await pool.query(
        `SELECT d.id,d.client_id,d.branch_id,d.department_name,d.department_code,d.status,d.notes,d.created_at,d.updated_at,
          b.branch_name
         FROM client_departments d
         INNER JOIN client_branches b ON b.id COLLATE utf8mb4_general_ci=d.branch_id
         WHERE d.client_id = ? AND d.deleted_at IS NULL AND LOWER(COALESCE(d.status,'active')) = 'active'
         ORDER BY b.branch_name ASC, d.department_name ASC`,
        [req.params.id],
      );

      res.json({
        branches,
        departments,
        fallback_branch: clients[0].branch || null,
      });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });
  router.get('/clients/:id/departments', async (req, res) => {
    try {
      const [clients] = await pool.query('SELECT id FROM clients WHERE id = ? LIMIT 1', [req.params.id]);
      if (!clients.length) return res.status(404).json({ error: 'Client not found.' });
      const [rows] = await pool.query(
        `SELECT d.id,d.client_id,d.branch_id,d.department_name,d.department_code,d.status,d.notes,d.created_at,d.updated_at,
          b.branch_name
         FROM client_departments d
         INNER JOIN client_branches b ON b.id COLLATE utf8mb4_general_ci=d.branch_id
         WHERE d.client_id = ? AND d.deleted_at IS NULL AND LOWER(COALESCE(d.status,'active')) = 'active'
         ORDER BY b.branch_name ASC, d.department_name ASC`,
        [req.params.id],
      );
      res.json(rows);
    } catch (error) { res.status(500).json({ error: error.message }); }
  });
  router.post('/clients', async (req, res) => {
    try {
      if (denyUnlessRole(req, res, 'Admin', 'Sales')) return;
      const id = uuidv4();
      const c = req.body;
      await pool.query(
        `INSERT INTO clients (id,client_name,branch,contract_type,contact_person_name,contact_email,contact_phone,start_date,added_by_user_id)
         VALUES (?,?,?,?,?,?,?,CURDATE(),?)`,
        [id,c.name,c.branch,c.contract_type,c.contact_person,c.contact_email,c.contact_phone,req.user.id],
      );
      const [rows] = await pool.query(`${clientSelect} WHERE c.id = ?`, [id]);
      res.status(201).json(rows[0]);
    } catch (error) { res.status(500).json({ error: error.message }); }
  });
  router.patch('/clients/:id', async (req, res) => {
    try {
      if (denyUnlessRole(req, res, 'Admin', 'Sales')) return;
      const c = req.body;
      await pool.query(
        `UPDATE clients SET client_name=?,branch=?,contract_type=?,contact_person_name=?,contact_email=?,contact_phone=? WHERE id=?`,
        [c.name,c.branch,c.contract_type,c.contact_person,c.contact_email,c.contact_phone,req.params.id],
      );
      const [rows] = await pool.query(`${clientSelect} WHERE c.id = ?`, [req.params.id]);
      res.json(rows[0]);
    } catch (error) { res.status(500).json({ error: error.message }); }
  });
  router.delete('/clients/:id', async (req, res) => {
    try {
      if (denyUnlessRole(req, res, 'Admin')) return;
      const [[usage]] = await pool.query(
        'SELECT COUNT(*) AS request_count FROM crms_change_requests WHERE client_id = ?',
        [req.params.id],
      );
      if (Number(usage.request_count) > 0) {
        return res.status(409).json({ error: 'This shared client has Developers requests and cannot be deleted.' });
      }
      await pool.query('DELETE FROM clients WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    }
    catch (error) { res.status(500).json({ error: error.message }); }
  });

  const getRequestJoins = async () => {
    const hasBranchId = await hasTableColumn('crms_change_requests', 'branch_id');
    const hasDepartmentId = await hasTableColumn('crms_change_requests', 'department_id');
    const hasInstallationId = await hasTableColumn('crms_change_requests', 'installation_id');
    const branchNameExpression = hasBranchId ? 'COALESCE(cb.branch_name,c.branch)' : 'c.branch';
    const scopeColumns = [
      hasBranchId ? 'cr.branch_id' : 'NULL AS branch_id',
      hasDepartmentId ? 'cr.department_id' : 'NULL AS department_id',
      hasInstallationId ? 'cr.installation_id' : 'NULL AS installation_id',
    ].join(',');
    const branchScope = hasBranchId
      ? `IF(cb.id IS NULL,NULL,JSON_OBJECT('id',cb.id,'name',cb.branch_name,'status',cb.status)) branch_scope`
      : 'NULL branch_scope';
    const departmentScope = hasDepartmentId
      ? `IF(cd.id IS NULL,NULL,JSON_OBJECT('id',cd.id,'name',cd.department_name,'status',cd.status,'branch_id',cd.branch_id)) department_scope`
      : 'NULL department_scope';
    const branchJoin = hasBranchId ? 'LEFT JOIN client_branches cb ON cb.id COLLATE utf8mb4_general_ci=cr.branch_id' : '';
    const departmentJoin = hasDepartmentId ? 'LEFT JOIN client_departments cd ON cd.id COLLATE utf8mb4_general_ci=cr.department_id' : '';

    return `SELECT cr.*,${scopeColumns},
    IF(c.id IS NULL,NULL,JSON_OBJECT('id',c.id,'name',c.client_name,'branch',${branchNameExpression},'contact_person',c.contact_person_name,'contact_email',c.contact_email,'contact_phone',c.contact_phone,'contract_type',LOWER(c.contract_type),'subsidiary_id',c.subsidiary_id,'subsidiary_name',s.subsidiary_name)) client,
    IF(ad.id IS NULL,NULL,JSON_OBJECT('id',ad.id,'name',CONCAT_WS(' ',ad.first_name,ad.last_name))) assigned_developer,
    IF(sd.id IS NULL,NULL,JSON_OBJECT('id',sd.id,'name',CONCAT_WS(' ',sd.first_name,sd.last_name))) senior_developer,
    ${branchScope},
    ${departmentScope}
    FROM crms_change_requests cr
    LEFT JOIN clients c ON c.id COLLATE utf8mb4_general_ci=cr.client_id
    LEFT JOIN subsidiaries s ON s.id COLLATE utf8mb4_general_ci=c.subsidiary_id
    ${branchJoin}
    ${departmentJoin}
    LEFT JOIN user_profiles ad ON ad.id COLLATE utf8mb4_general_ci=cr.assigned_developer_id
    LEFT JOIN user_profiles sd ON sd.id COLLATE utf8mb4_general_ci=cr.senior_developer_id`;
  };
  const formatRequest = (row) => ({
    ...row,
    client: typeof row.client === 'string' ? JSON.parse(row.client) : row.client,
    assigned_developer: typeof row.assigned_developer === 'string' ? JSON.parse(row.assigned_developer) : row.assigned_developer,
    senior_developer: typeof row.senior_developer === 'string' ? JSON.parse(row.senior_developer) : row.senior_developer,
    branch_scope: typeof row.branch_scope === 'string' ? JSON.parse(row.branch_scope) : row.branch_scope,
    department_scope: typeof row.department_scope === 'string' ? JSON.parse(row.department_scope) : row.department_scope,
    modules_affected: typeof row.modules_affected === 'string' ? JSON.parse(row.modules_affected) : row.modules_affected,
  });
  router.get('/change_requests', async (req, res) => {
    try {
      const developerOnly = req.user.role === 'Developer';
      const requestJoins = await getRequestJoins();
      const [rows] = await pool.query(
        `${requestJoins}${developerOnly ? ' WHERE cr.assigned_developer_id = ?' : ''} ORDER BY cr.created_at DESC`,
        developerOnly ? [req.user.id] : [],
      );
      res.json(rows.map(formatRequest));
    }
    catch (error) { res.status(500).json({ error: error.message }); }
  });
  router.get('/change_requests/:id', async (req, res) => {
    try {
      const developerOnly = req.user.role === 'Developer';
      const requestJoins = await getRequestJoins();
      const [rows] = await pool.query(
        `${requestJoins} WHERE cr.id = ?${developerOnly ? ' AND cr.assigned_developer_id = ?' : ''}`,
        developerOnly ? [req.params.id, req.user.id] : [req.params.id],
      );
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      res.json(formatRequest(rows[0]));
    } catch (error) { res.status(500).json({ error: error.message }); }
  });
  router.get('/assigned_requests/:developerId', async (req, res) => {
    try {
      if (req.user.role === 'Developer' && req.params.developerId !== req.user.id) {
        return res.status(403).json({ error: 'Developers may only view their own assignments.' });
      }
      const requestJoins = await getRequestJoins();
      const [rows] = await pool.query(`${requestJoins} WHERE cr.assigned_developer_id = ? ORDER BY cr.created_at DESC`, [req.params.developerId]); res.json(rows.map(formatRequest));
    }
    catch (error) { res.status(500).json({ error: error.message }); }
  });
  router.post('/change_requests', async (req, res) => {
    try {
      if (denyUnlessRole(req, res, 'Admin', 'Sales', 'Teamlead')) return;
      const id = uuidv4();
      const ticket = `CR-${Date.now().toString().slice(-8)}`;
      const r = req.body;
      const scope = await validateRequestScope({ clientId: r.client_id, branchId: r.branch_id, departmentId: r.department_id, installationId: r.installation_id });
      const requestColumns = await getTableColumns('crms_change_requests');
      const insertColumns = ['id','ticket_number','client_id'];
      const insertValues = [id,ticket,scope.clientId];
      for (const [column, value] of [
        ['branch_id', scope.branchId],
        ['department_id', scope.departmentId],
        ['installation_id', scope.installationId],
      ]) {
        if (requestColumns.has(column)) {
          insertColumns.push(column);
          insertValues.push(value);
        }
      }
      insertColumns.push('department','date_requested','source','change_description','priority','status','modules_affected','estimated_completion_date','senior_developer_id','assigned_developer_id','is_chargeable','sales_remarks','commencement_date','completion_date');
      insertValues.push(r.department,r.date_requested || new Date().toISOString().slice(0, 10),r.source,r.change_description,r.priority,r.status || 'pending_approval',JSON.stringify(r.modules_affected || []),r.estimated_completion_date,r.senior_developer_id,r.assigned_developer_id || null,!!r.is_chargeable,r.sales_remarks || null,r.commencement_date || null,r.completion_date || null);
      await pool.query(
        `INSERT INTO crms_change_requests (${insertColumns.map((column) => `\`${column}\``).join(',')}) VALUES (${insertColumns.map(() => '?').join(',')})`,
        insertValues,
      );
      const requestJoins = await getRequestJoins();
      const [rows] = await pool.query(`${requestJoins} WHERE cr.id = ?`, [id]);
      const created = formatRequest(rows[0]);
      await notifySalesApprovalNeeded(req, created);
      if (created.assigned_developer_id) {
        await recordAssignmentActor(req, created, null);
        await notifyAssignedDeveloper(req, created);
      }
      res.status(201).json(created);
    } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
  });
  router.patch('/change_requests/:id', async (req, res) => {
    try {
      const [existingRows] = await pool.query(
        'SELECT id,status,assigned_developer_id FROM crms_change_requests WHERE id = ? LIMIT 1',
        [req.params.id],
      );
      if (!existingRows.length) return res.status(404).json({ error: 'Not found' });
      if (req.user.role === 'Developer' && existingRows[0].assigned_developer_id !== req.user.id) {
        return res.status(403).json({ error: 'Developers may only update their assigned requests.' });
      }
      const allowed = REQUEST_UPDATE_FIELDS[req.user.role] || new Set();
      const requestedKeys = Object.keys(req.body);
      if (requestedKeys.some((key) => !allowed.has(key))) {
        return res.status(403).json({ error: 'One or more request fields are not permitted for your role.' });
      }
      const allowedStatuses = REQUEST_STATUSES[req.user.role];
      if (req.body.status !== undefined && allowedStatuses && !allowedStatuses.has(req.body.status)) {
        return res.status(403).json({ error: 'This status transition is not permitted for your role.' });
      }
      const requestColumns = await getTableColumns('crms_change_requests');
      const fields = []; const values = [];
      for (const [key,value] of Object.entries(req.body)) if (allowed.has(key) && requestColumns.has(key)) {
        fields.push(`\`${key}\`=?`);
        values.push(key === 'modules_affected' ? JSON.stringify(value) : key === 'status' ? storedRequestStatus(value) : value);
      }
      if (fields.length) await pool.query(`UPDATE crms_change_requests SET ${fields.join(',')} WHERE id=?`, [...values,req.params.id]);
      const requestJoins = await getRequestJoins();
      const [rows] = await pool.query(`${requestJoins} WHERE cr.id=?`, [req.params.id]);
      const updated = formatRequest(rows[0]);
      const assignmentChanged = updated.assigned_developer_id
        && updated.assigned_developer_id !== existingRows[0].assigned_developer_id;
      if (assignmentChanged) {
        await recordAssignmentActor(req, updated, existingRows[0].assigned_developer_id);
        await notifyAssignedDeveloper(req, updated);
      }
      await notifySeniorDeveloperStatus(req, updated, existingRows[0].status);
      if (updated.status === 'completed' && existingRows[0].status !== updated.status) {
        await notifyAssignerOnCompletion(req, updated);
      }
      res.json(updated);
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  router.get('/audit_logs', async (req, res) => {
    try {
      const params = []; let where = '';
      if (req.query.request_id) {
        if (req.user.role === 'Developer') {
          const [requests] = await pool.query(
            'SELECT id FROM crms_change_requests WHERE id = ? AND assigned_developer_id = ? LIMIT 1',
            [req.query.request_id, req.user.id],
          );
          if (!requests.length) return res.status(403).json({ error: 'You may only view audit history for assigned requests.' });
        }
        where = 'WHERE al.request_id=?'; params.push(req.query.request_id);
      } else if (req.user.role === 'Developer') {
        where = 'WHERE al.request_id IN (SELECT id FROM crms_change_requests WHERE assigned_developer_id = ?)';
        params.push(req.user.id);
      } else if (req.user.role === 'Sales') {
        where = "WHERE al.action IN ('created','approved','rejected','status_changed')";
      }
      const limit = Math.min(Number(req.query.limit) || 100, 250);
      const [rows] = await pool.query(
        `SELECT al.*,JSON_OBJECT('id',u.id,'name',CONCAT_WS(' ',u.first_name,u.last_name),'email',u.email) profiles
         FROM crms_audit_logs al LEFT JOIN user_profiles u ON u.id COLLATE utf8mb4_general_ci=al.user_id ${where} ORDER BY al.created_at DESC LIMIT ${limit}`, params,
      );
      res.json(rows.map((row) => ({ ...row, profiles: typeof row.profiles === 'string' ? JSON.parse(row.profiles) : row.profiles })));
    } catch (error) { res.status(500).json({ error: error.message }); }
  });
  router.post('/audit_logs', async (req, res) => {
    try {
      const id=uuidv4(); const a=req.body;
      await pool.query('INSERT INTO crms_audit_logs (id,request_id,action,action_label,details,previous_value,new_value,user_id) VALUES (?,?,?,?,?,?,?,?)',[id,a.request_id,a.action,a.action_label,a.details,a.previous_value,a.new_value,req.user.id]);
      const [rows]=await pool.query('SELECT * FROM crms_audit_logs WHERE id=?',[id]); res.status(201).json(rows[0]);
    } catch (error) { res.status(500).json({ error:error.message }); }
  });

  router.get('/notifications', async (req,res) => {
    try {
      if (req.query.userId && req.query.userId !== req.user.id) return res.status(403).json({ error: 'Notifications are private to each user.' });
      const [rows]=await pool.query('SELECT * FROM crms_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100',[req.user.id]); res.json(rows);
    }
    catch (error) { res.status(500).json({ error:error.message }); }
  });
  router.get('/notifications/sms-balance', async (req,res) => {
    try {
      if (denyUnlessRole(req, res, 'Admin')) return;
      res.json({ success: true, balance: await getSmsBalance() });
    } catch (error) { res.status(502).json({ success: false, error: error.message }); }
  });
  router.post('/notifications/read-all', async (req,res) => {
    try {
      await pool.query('UPDATE crms_notifications SET `read`=1 WHERE user_id=?',[req.user.id]);
      res.json({success:true});
    }
    catch (error) { res.status(500).json({ error:error.message }); }
  });
  router.get('/notifications/:userId', async (req,res) => {
    try {
      if (req.params.userId !== req.user.id) return res.status(403).json({ error: 'Notifications are private to each user.' });
      const [rows]=await pool.query('SELECT * FROM crms_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100',[req.user.id]); res.json(rows);
    }
    catch (error) { res.status(500).json({ error:error.message }); }
  });
  router.post('/notifications/:userId/read-all', async (req,res) => {
    try {
      if (req.params.userId !== req.user.id) return res.status(403).json({ error: 'Notifications are private to each user.' });
      await pool.query('UPDATE crms_notifications SET `read`=1 WHERE user_id=?',[req.user.id]); res.json({success:true});
    }
    catch (error) { res.status(500).json({ error:error.message }); }
  });
  router.post('/notifications', async (req,res) => {
    try {
      if (denyUnlessRole(req, res, 'Admin')) return;
      const id=uuidv4(); const n=req.body; const notificationType = normalizeNotificationType(n.notificationType || n.notification_type, n.message); await pool.query('INSERT INTO crms_notifications (id,user_id,title,message,type,notification_type,action_url,request_id) VALUES (?,?,?,?,?,?,?,?)',[id,n.user_id,n.title,n.message,n.type,notificationType,n.action_url,n.request_id]); const [rows]=await pool.query('SELECT * FROM crms_notifications WHERE id=?',[id]); res.status(201).json(rows[0]);
    }
    catch (error) { res.status(500).json({ error:error.message }); }
  });
  router.patch('/notifications/:id', async (req,res) => {
    try { await pool.query('UPDATE crms_notifications SET `read`=? WHERE id=? AND user_id=?',[!!req.body.read,req.params.id,req.user.id]); res.json({success:true}); }
    catch (error) { res.status(500).json({ error:error.message }); }
  });
  router.post('/notifications/send-email', async (req,res) => {
    try {
      if (denyUnlessRole(req, res, 'Admin')) return;
      const identifier = req.body.userId || req.body.recipientEmail;
      const lookup = req.body.userId ? 'id = ?' : 'LOWER(email) = LOWER(?)';
      const [users] = await pool.query(`SELECT id,email,first_name,last_name FROM user_profiles WHERE ${lookup} AND is_active = TRUE LIMIT 1`, [identifier]);
      if (!users.length) return res.status(404).json({ error: 'Active recipient not found.' });
      const recipient = users[0];
      const notification = {
        recipientEmail: recipient.email,
        recipientName: fullName(recipient),
        notificationType: req.body.notificationType || 'general',
        requestDescription: req.body.requestDescription || req.body.message,
        ticketNumber: req.body.ticketNumber,
        clientName: req.body.clientName,
        comment: req.body.comment,
        actionUrl: req.body.actionUrl,
      };
      res.json({ success: true, ...(await sendEmail(notification)) });
    }
    catch (error) { res.status(502).json({ success: false, error: error.message }); }
  });
  router.post('/notifications/send-sms', async (req,res) => {
    try {
      if (denyUnlessRole(req, res, 'Admin')) return;
      const identifier = req.body.userId || req.body.phoneNumber;
      const lookup = req.body.userId ? 'id = ?' : 'phone_number = ?';
      const [users] = await pool.query(`SELECT id,phone_number FROM user_profiles WHERE ${lookup} AND is_active = TRUE LIMIT 1`, [identifier]);
      if (!users.length || !users[0].phone_number) return res.status(404).json({ error: 'Active SMS recipient not found.' });
      res.json({ success: true, ...(await sendSms({ phoneNumber: users[0].phone_number, message: req.body.message })) });
    }
    catch (error) { res.status(502).json({ success: false, error: error.message }); }
  });
  router.get('/notifications/whatsapp-status', async (req,res) => {
    if (denyUnlessRole(req, res, 'Admin')) return;
    res.json({ success: true, whatsapp: whatsappStatus() });
  });
  router.post('/notifications/send-whatsapp', async (req,res) => {
    try {
      if (denyUnlessRole(req, res, 'Admin')) return;
      if (!whatsappConfigured()) return res.status(400).json({ success: false, error: 'WhatsApp notifications are not configured or disabled.' });
      const identifier = req.body.userId || req.body.phoneNumber;
      const lookup = req.body.userId ? 'id = ?' : 'phone_number = ?';
      const [users] = await pool.query(`SELECT id,phone_number,first_name,last_name,email FROM user_profiles WHERE ${lookup} AND is_active = TRUE LIMIT 1`, [identifier]);
      if (!users.length || !users[0].phone_number) return res.status(404).json({ error: 'Active WhatsApp recipient not found.' });
      const recipient = users[0];
      res.json({ success: true, ...(await sendWhatsApp({
        phoneNumber: recipient.phone_number,
        message: req.body.message || 'RIANA CIMS notification',
        recipientName: fullName(recipient),
        serviceName: req.body.serviceName || req.body.notificationType || 'RIANA CIMS',
        bookingDate: req.body.bookingDate || new Date().toLocaleDateString('en-GB'),
        notificationType: req.body.notificationType || 'general',
        clientName: req.body.clientName,
        templateParams: req.body.templateParams,
      })) });
    }
    catch (error) { res.status(502).json({ success: false, error: error.message }); }
  });

  router.get('/dashboard/stats', async (_req,res) => {
    try {
      const [rows] = await pool.query(`
        SELECT
          COUNT(*) totalRequests,
          SUM(status='pending_approval') pendingApproval,
          SUM(status='in_progress') inProgress,
          SUM(status='completed') completed,
          SUM(estimated_completion_date IS NOT NULL AND status <> 'completed' AND estimated_completion_date < CURDATE()) overdue,
          COALESCE(ROUND(AVG(CASE WHEN commencement_date IS NOT NULL AND completion_date IS NOT NULL THEN DATEDIFF(completion_date, commencement_date) END), 1), 0) avgCompletionDays
        FROM crms_change_requests
      `);
      res.json({
        totalRequests: Number(rows[0].totalRequests || 0),
        pendingApproval: Number(rows[0].pendingApproval || 0),
        inProgress: Number(rows[0].inProgress || 0),
        completed: Number(rows[0].completed || 0),
        overdue: Number(rows[0].overdue || 0),
        avgCompletionDays: Number(rows[0].avgCompletionDays || 0),
      });
    } catch (error) { res.status(500).json({ error:error.message }); }
  });

  return router;
};











