const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { createChallenge, verifyChallenge } = require('../utils/twoFactor');
const { getSmsBalance, sendEmail, sendSms } = require('../services/notifications');

const ALLOWED_ROLES = new Set(['SuperAdmin', 'Admin', 'Teamlead', 'Developer', 'Sales']);
const roleToCrms = (role) => ({ SuperAdmin: 'admin', Admin: 'admin', Teamlead: 'senior_developer', Developer: 'developer', Sales: 'sales' })[role];
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

const hasRole = (req, ...roles) => req.user.role === 'SuperAdmin' || roles.includes(req.user.role);
const denyUnlessRole = (req, res, ...roles) => {
  if (hasRole(req, ...roles)) return false;
  res.status(403).json({ error: 'You do not have permission to perform this action.' });
  return true;
};

const REQUEST_UPDATE_FIELDS = {
  SuperAdmin: new Set(['client_id','department','source','change_description','priority','status','modules_affected','estimated_completion_date','senior_developer_id','assigned_developer_id','approval_comment','is_chargeable','sales_remarks','commencement_date','completion_date']),
  Admin: new Set(['client_id','department','source','change_description','priority','status','modules_affected','estimated_completion_date','senior_developer_id','assigned_developer_id','approval_comment','is_chargeable','sales_remarks','commencement_date','completion_date']),
  Sales: new Set(['status','approval_comment','is_chargeable','sales_remarks']),
  Teamlead: new Set(['priority','status','estimated_completion_date','senior_developer_id','assigned_developer_id','commencement_date','completion_date']),
  Developer: new Set(['status','commencement_date','completion_date']),
};

const REQUEST_STATUSES = {
  Sales: new Set(['pending_approval', 'approved', 'rejected', 'waiting_clarification']),
  Teamlead: new Set(['approved', 'in_progress', 'waiting_clarification', 'completed']),
  Developer: new Set(['in_progress', 'waiting_clarification', 'completed']),
};

module.exports = function createCrmsRouter({ pool, jwtSecret }) {
  const router = express.Router();

  const finishLogin = (res, user) => {
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, scope: 'crms' },
      jwtSecret,
      { expiresIn: '12h' },
    );
    res.json({ success: true, user: profileShape(user), token });
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
      if (!ALLOWED_ROLES.has(user.role)) return res.status(403).json({ error: 'Developers access requires SuperAdmin, Admin, Teamlead, Developer, or Sales role.' });
      if (!isBcryptHash(user.password)) {
        const passwordHash = await bcrypt.hash(String(password), 12);
        await pool.query('UPDATE user_profiles SET password = ? WHERE id = ? AND password = ?', [passwordHash, user.id, user.password]);
      }
      if (user.two_factor_enabled) {
        const challenge = await createChallenge(pool, user, jwtSecret);
        return res.json({ success: true, requiresTwoFactor: true, ...challenge });
      }
      finishLogin(res, user);
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
      finishLogin(res, rows[0]);
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
        `SELECT u.id,u.email,COALESCE(r.code,u.role) AS role,u.is_active
         FROM user_profiles u
         LEFT JOIN user_module_roles umr ON umr.user_id = u.id AND umr.module_id = 'crms'
         LEFT JOIN roles r ON r.id = umr.role_id
         WHERE u.id = ? LIMIT 1`,
        [decoded.id],
      );
      if (!users.length || !users[0].is_active) return res.status(401).json({ error: 'Account is unavailable.' });
      if (!ALLOWED_ROLES.has(users[0].role)) return res.status(403).json({ error: 'Developers access denied.' });
      req.user = { ...decoded, id: users[0].id, email: users[0].email, role: users[0].role };
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired session.' });
    }
  });

  router.get('/profiles', async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT u.*,COALESCE(r.code,u.role) AS role,d.department_name FROM user_profiles u
         LEFT JOIN departments d ON d.id = u.department_id
         LEFT JOIN user_module_roles umr ON umr.user_id = u.id AND umr.module_id = 'crms'
         LEFT JOIN roles r ON r.id = umr.role_id
         WHERE r.code IN ('SuperAdmin','Admin','Teamlead','Developer','Sales') ORDER BY u.first_name,u.last_name`,
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

  const clientSelect = `SELECT id,client_name AS name,branch,LOWER(contract_type) AS contract_type,
    contact_person_name AS contact_person,contact_email,contact_phone,created_at,updated_at FROM clients`;
  router.get('/clients', async (_req, res) => {
    try { const [rows] = await pool.query(`${clientSelect} ORDER BY client_name`); res.json(rows); }
    catch (error) { res.status(500).json({ error: error.message }); }
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
      const [rows] = await pool.query(`${clientSelect} WHERE id = ?`, [id]);
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
      const [rows] = await pool.query(`${clientSelect} WHERE id = ?`, [req.params.id]);
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

  const requestJoins = `SELECT cr.*,
    IF(c.id IS NULL,NULL,JSON_OBJECT('id',c.id,'name',c.client_name,'branch',c.branch,'contact_person',c.contact_person_name,'contact_email',c.contact_email,'contact_phone',c.contact_phone,'contract_type',LOWER(c.contract_type))) client,
    IF(ad.id IS NULL,NULL,JSON_OBJECT('id',ad.id,'name',CONCAT_WS(' ',ad.first_name,ad.last_name))) assigned_developer,
    IF(sd.id IS NULL,NULL,JSON_OBJECT('id',sd.id,'name',CONCAT_WS(' ',sd.first_name,sd.last_name))) senior_developer
    FROM crms_change_requests cr
    LEFT JOIN clients c ON c.id COLLATE utf8mb4_general_ci=cr.client_id
    LEFT JOIN user_profiles ad ON ad.id COLLATE utf8mb4_general_ci=cr.assigned_developer_id
    LEFT JOIN user_profiles sd ON sd.id COLLATE utf8mb4_general_ci=cr.senior_developer_id`;
  const formatRequest = (row) => ({
    ...row,
    client: typeof row.client === 'string' ? JSON.parse(row.client) : row.client,
    assigned_developer: typeof row.assigned_developer === 'string' ? JSON.parse(row.assigned_developer) : row.assigned_developer,
    senior_developer: typeof row.senior_developer === 'string' ? JSON.parse(row.senior_developer) : row.senior_developer,
    modules_affected: typeof row.modules_affected === 'string' ? JSON.parse(row.modules_affected) : row.modules_affected,
  });
  router.get('/change_requests', async (req, res) => {
    try {
      const developerOnly = req.user.role === 'Developer';
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
      await pool.query(
        `INSERT INTO crms_change_requests
         (id,ticket_number,client_id,department,date_requested,source,change_description,priority,status,modules_affected,estimated_completion_date,senior_developer_id,assigned_developer_id,is_chargeable,sales_remarks,commencement_date,completion_date)
         VALUES (?,?,?,?,CURDATE(),?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id,ticket,r.client_id,r.department,r.source,r.change_description,r.priority,r.status || 'pending_approval',JSON.stringify(r.modules_affected || []),r.estimated_completion_date,r.senior_developer_id,r.assigned_developer_id || null,!!r.is_chargeable,r.sales_remarks || null,r.commencement_date || null,r.completion_date || null],
      );
      const [rows] = await pool.query('SELECT * FROM crms_change_requests WHERE id = ?', [id]);
      res.status(201).json(formatRequest(rows[0]));
    } catch (error) { res.status(500).json({ error: error.message }); }
  });
  router.patch('/change_requests/:id', async (req, res) => {
    try {
      const [existingRows] = await pool.query(
        'SELECT id,assigned_developer_id FROM crms_change_requests WHERE id = ? LIMIT 1',
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
      const fields = []; const values = [];
      for (const [key,value] of Object.entries(req.body)) if (allowed.has(key)) { fields.push(`\`${key}\`=?`); values.push(key === 'modules_affected' ? JSON.stringify(value) : value); }
      if (fields.length) await pool.query(`UPDATE crms_change_requests SET ${fields.join(',')} WHERE id=?`, [...values,req.params.id]);
      const [rows] = await pool.query('SELECT * FROM crms_change_requests WHERE id=?', [req.params.id]);
      res.json(formatRequest(rows[0]));
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
      const id=uuidv4(); const n=req.body; await pool.query('INSERT INTO crms_notifications (id,user_id,title,message,type,action_url,request_id) VALUES (?,?,?,?,?,?,?)',[id,n.user_id,n.title,n.message,n.type,n.action_url,n.request_id]); const [rows]=await pool.query('SELECT * FROM crms_notifications WHERE id=?',[id]); res.status(201).json(rows[0]);
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
      res.json({ success: true, ...(await sendEmail({ ...req.body, recipientEmail: recipient.email, recipientName: fullName(recipient) })) });
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
