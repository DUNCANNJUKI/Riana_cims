const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { randomBytes } = require('crypto');
const { createChallenge, verifyChallenge } = require('../utils/twoFactor');
const { getSmsBalance, sendEmail, sendSms, sendWelcomeCredentials } = require('../services/notifications');
const { sendUserNotification } = require('../services/notificationDispatcher');

const ALLOWED_ROLES = new Set(['Admin', 'Teamlead', 'Developer', 'Sales']);
const roleToCrms = (role) => ({ Admin: 'admin', Teamlead: 'senior_developer', Developer: 'developer', Sales: 'sales' })[role];
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
      if (!rows.length || rows[0].password !== password) return res.status(401).json({ error: 'Invalid email or password' });
      const user = rows[0];
      if (!user.is_active) return res.status(403).json({ error: 'Your account is suspended.' });
      if (!ALLOWED_ROLES.has(user.role)) return res.status(403).json({ error: 'Developers access requires Admin, Teamlead, Developer, or Sales role.' });
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
      const [rows] = await pool.query('SELECT * FROM user_profiles WHERE id = ? LIMIT 1', [challenge.user_id]);
      if (!rows.length || !ALLOWED_ROLES.has(rows[0].role)) return res.status(403).json({ error: 'Access denied.' });
      finishLogin(res, rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.use((req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Authentication required.' });
    try {
      const decoded = jwt.verify(token, jwtSecret);
      if (!ALLOWED_ROLES.has(decoded.role)) return res.status(403).json({ error: 'Developers access denied.' });
      req.user = decoded;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired session.' });
    }
  });

  router.get('/profiles', async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT u.*,d.department_name FROM user_profiles u
         LEFT JOIN departments d ON d.id = u.department_id
         WHERE u.role IN ('Admin','Teamlead','Developer','Sales') ORDER BY u.first_name,u.last_name`,
      );
      res.json(rows.map(profileShape));
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  router.post('/profiles', async (req, res) => {
    try {
      if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can create users.' });
      const { name, email, password, department, phone_number, role = 'developer' } = req.body;
      const normalizedEmail = String(email || '').trim().toLowerCase();
      if (!/^[^\s@]+@riana\.co$/i.test(normalizedEmail)) return res.status(400).json({ error: 'New users must use a @riana.co email address.' });
      if (!roleFromCrms(role)) return res.status(400).json({ error: 'Invalid user role.' });
      const parts = String(name || '').trim().split(/\s+/);
      const id = uuidv4();
      const temporaryPassword = password || `R!${randomBytes(9).toString('base64url')}`;
      await pool.query(
        `INSERT INTO user_profiles
         (id,email,password,role,designation,phone_number,first_name,last_name,first_login,is_active)
         VALUES (?,?,?,?,?,?,?,?,TRUE,TRUE)`,
        [id, normalizedEmail, temporaryPassword, roleFromCrms(role), department || 'Developer', phone_number || null, parts.shift() || 'Developer', parts.join(' ') || 'User'],
      );
      const [rows] = await pool.query('SELECT * FROM user_profiles WHERE id = ?', [id]);
      const loginUrl = process.env.CIMS_LOGIN_URL || 'http://localhost:8090/';
      const delivery = await sendWelcomeCredentials({ email: normalizedEmail, phoneNumber: phone_number, name, password: temporaryPassword, loginUrl });
      const inAppDelivery = await sendUserNotification({
        pool, userId: id, title: 'Welcome to RIANA CIMS',
        message: 'Your RIANA CIMS account is ready. Change your temporary password when you first sign in.',
        type: 'success', actionUrl: loginUrl, notificationType: 'welcome', email: false, sms: false,
      });
      res.status(201).json({ ...profileShape(rows[0]), welcome_delivery: delivery, in_app_notification: inAppDelivery });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  router.patch('/profiles/:id', async (req, res) => {
    try {
      const updates = [];
      const values = [];
      if (req.body.name !== undefined) {
        const parts = String(req.body.name).trim().split(/\s+/);
        updates.push('first_name = ?', 'last_name = ?');
        values.push(parts.shift() || '', parts.join(' '));
      }
      const map = { email: 'email', department: 'designation', phone_number: 'phone_number', status: 'is_active' };
      for (const [key, column] of Object.entries(map)) {
        if (req.body[key] !== undefined) {
          updates.push(`${column} = ?`);
          values.push(key === 'status' ? req.body[key] !== 'suspended' : req.body[key]);
        }
      }
      if (updates.length) await pool.query(`UPDATE user_profiles SET ${updates.join(',')} WHERE id = ?`, [...values, req.params.id]);
      const [rows] = await pool.query('SELECT * FROM user_profiles WHERE id = ?', [req.params.id]);
      res.json(profileShape(rows[0]));
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  router.delete('/profiles/:id', async (req, res) => {
    try {
      if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can deactivate users.' });
      await pool.query('UPDATE user_profiles SET is_active = FALSE WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  router.get('/user_roles', async (_req, res) => {
    try {
      const [rows] = await pool.query(`SELECT id AS user_id,role FROM user_profiles WHERE role IN ('Admin','Teamlead','Developer','Sales')`);
      res.json(rows.map((row) => ({ id: `role-${row.user_id}`, user_id: row.user_id, role: roleToCrms(row.role) })));
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  router.post('/user_roles', async (req, res) => {
    try {
      await pool.query('UPDATE user_profiles SET role = ? WHERE id = ?', [roleFromCrms(req.body.role), req.body.user_id]);
      res.json({ id: `role-${req.body.user_id}`, user_id: req.body.user_id, role: req.body.role });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  router.patch('/user_roles/:id', async (req, res) => {
    try {
      const userId = req.params.id.replace(/^role-/, '');
      await pool.query('UPDATE user_profiles SET role = ? WHERE id = ?', [roleFromCrms(req.body.role), userId]);
      res.json({ id: `role-${userId}`, user_id: userId, role: req.body.role });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  router.delete('/user_roles/:id', async (req, res) => {
    try {
      const userId = req.params.id.replace(/^role-/, '');
      await pool.query("UPDATE user_profiles SET role = 'User' WHERE id = ?", [userId]);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  const clientSelect = `SELECT id,client_name AS name,branch,LOWER(contract_type) AS contract_type,
    contact_person_name AS contact_person,contact_email,contact_phone,created_at,updated_at FROM clients`;
  router.get('/clients', async (_req, res) => {
    try { const [rows] = await pool.query(`${clientSelect} ORDER BY client_name`); res.json(rows); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });
  router.post('/clients', async (req, res) => {
    try {
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
  router.get('/change_requests', async (_req, res) => {
    try { const [rows] = await pool.query(`${requestJoins} ORDER BY cr.created_at DESC`); res.json(rows.map(formatRequest)); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });
  router.get('/change_requests/:id', async (req, res) => {
    try {
      const [rows] = await pool.query(`${requestJoins} WHERE cr.id = ?`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      res.json(formatRequest(rows[0]));
    } catch (error) { res.status(500).json({ error: error.message }); }
  });
  router.get('/assigned_requests/:developerId', async (req, res) => {
    try { const [rows] = await pool.query(`${requestJoins} WHERE cr.assigned_developer_id = ? ORDER BY cr.created_at DESC`, [req.params.developerId]); res.json(rows.map(formatRequest)); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });
  router.post('/change_requests', async (req, res) => {
    try {
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
      const allowed = new Set(['client_id','department','source','change_description','priority','status','modules_affected','estimated_completion_date','senior_developer_id','assigned_developer_id','approval_comment','is_chargeable','sales_remarks','commencement_date','completion_date']);
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
      if (req.query.request_id) { where = 'WHERE al.request_id=?'; params.push(req.query.request_id); }
      const [rows] = await pool.query(
        `SELECT al.*,JSON_OBJECT('id',u.id,'name',CONCAT_WS(' ',u.first_name,u.last_name),'email',u.email) profiles
         FROM crms_audit_logs al LEFT JOIN user_profiles u ON u.id COLLATE utf8mb4_general_ci=al.user_id ${where} ORDER BY al.created_at DESC`, params,
      );
      res.json(rows.map((row) => ({ ...row, profiles: typeof row.profiles === 'string' ? JSON.parse(row.profiles) : row.profiles })));
    } catch (error) { res.status(500).json({ error: error.message }); }
  });
  router.post('/audit_logs', async (req, res) => {
    try {
      const id=uuidv4(); const a=req.body;
      await pool.query('INSERT INTO crms_audit_logs (id,request_id,action,action_label,details,previous_value,new_value,user_id) VALUES (?,?,?,?,?,?,?,?)',[id,a.request_id,a.action,a.action_label,a.details,a.previous_value,a.new_value,a.user_id || req.user.id]);
      const [rows]=await pool.query('SELECT * FROM crms_audit_logs WHERE id=?',[id]); res.status(201).json(rows[0]);
    } catch (error) { res.status(500).json({ error:error.message }); }
  });

  router.get('/notifications', async (req,res) => {
    try { const params=[]; const where=req.query.userId ? (params.push(req.query.userId),'WHERE user_id=?') : ''; const [rows]=await pool.query(`SELECT * FROM crms_notifications ${where} ORDER BY created_at DESC`,params); res.json(rows); }
    catch (error) { res.status(500).json({ error:error.message }); }
  });
  router.get('/notifications/sms-balance', async (req,res) => {
    try {
      if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can view the SMS balance.' });
      res.json({ success: true, balance: await getSmsBalance() });
    } catch (error) { res.status(502).json({ success: false, error: error.message }); }
  });
  router.get('/notifications/:userId', async (req,res) => {
    try { const [rows]=await pool.query('SELECT * FROM crms_notifications WHERE user_id=? ORDER BY created_at DESC',[req.params.userId]); res.json(rows); }
    catch (error) { res.status(500).json({ error:error.message }); }
  });
  router.post('/notifications/:userId/read-all', async (req,res) => {
    try { await pool.query('UPDATE crms_notifications SET `read`=1 WHERE user_id=?',[req.params.userId]); res.json({success:true}); }
    catch (error) { res.status(500).json({ error:error.message }); }
  });
  router.post('/notifications', async (req,res) => {
    try { const id=uuidv4(); const n=req.body; await pool.query('INSERT INTO crms_notifications (id,user_id,title,message,type,action_url,request_id) VALUES (?,?,?,?,?,?,?)',[id,n.user_id,n.title,n.message,n.type,n.action_url,n.request_id]); const [rows]=await pool.query('SELECT * FROM crms_notifications WHERE id=?',[id]); res.status(201).json(rows[0]); }
    catch (error) { res.status(500).json({ error:error.message }); }
  });
  router.patch('/notifications/:id', async (req,res) => {
    try { await pool.query('UPDATE crms_notifications SET `read`=? WHERE id=?',[req.body.read,req.params.id]); res.json({success:true}); }
    catch (error) { res.status(500).json({ error:error.message }); }
  });
  router.post('/notifications/send-email', async (req,res) => {
    try { res.json({ success: true, ...(await sendEmail(req.body)) }); }
    catch (error) { res.status(502).json({ success: false, error: error.message }); }
  });
  router.post('/notifications/send-sms', async (req,res) => {
    try { res.json({ success: true, ...(await sendSms(req.body)) }); }
    catch (error) { res.status(502).json({ success: false, error: error.message }); }
  });

  router.get('/dashboard/stats', async (_req,res) => {
    try {
      const [[total],[pending],[inProgress],[completed]] = await Promise.all([
        pool.query('SELECT COUNT(*) count FROM crms_change_requests'),
        pool.query("SELECT COUNT(*) count FROM crms_change_requests WHERE status='pending_approval'"),
        pool.query("SELECT COUNT(*) count FROM crms_change_requests WHERE status='in_progress'"),
        pool.query("SELECT COUNT(*) count FROM crms_change_requests WHERE status='completed'"),
      ]);
      res.json({totalRequests:total[0].count,pendingApproval:pending[0].count,inProgress:inProgress[0].count,completed:completed[0].count,overdue:0,avgCompletionDays:0});
    } catch (error) { res.status(500).json({ error:error.message }); }
  });

  return router;
};
