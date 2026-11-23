const { v4: uuid } = require('uuid');
const error = (message, status = 400) => Object.assign(new Error(message), { status });
const canManage = user => ['SuperAdmin', 'Teamlead'].includes(user?.role);
const nameOf = value => {
  if (typeof value !== 'string') throw error('Module name is required.');
  const name = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) throw error('Use a module name of 1–100 characters without control characters.');
  return name;
};
const listModules = async pool => (await pool.query('SELECT id,name,is_active,sort_order,version FROM crms_affected_modules ORDER BY sort_order,name'))[0];

async function saveModule(pool, user, id, data) {
  if (!canManage(user) || !user?.id) throw error('Only SuperAdmin or Developer Lead can manage affected modules.', 403);
  if (!data || typeof data !== 'object' || Object.keys(data).some(k => !['name','is_active','sort_order','version'].includes(k))) throw error('Invalid module fields.');
  const name = nameOf(data.name);
  if (typeof data.is_active !== 'boolean' || !Number.isInteger(data.sort_order) || data.sort_order < 0 || data.sort_order > 10000) throw error('Provide an active state and an order from 0 to 10000.');
  if (id && (!Number.isInteger(data.version) || data.version < 1)) throw error('Refresh the catalogue before updating this module.', 409);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    let previous = null;
    if (id) {
      const [rows] = await connection.query('SELECT id,name,is_active,sort_order,version FROM crms_affected_modules WHERE id=? FOR UPDATE', [id]);
      previous = rows[0];
      if (!previous) throw error('Module not found.', 404);
      if (previous.version !== data.version) throw error('This module was changed by someone else. Refresh and retry.', 409);
    } else {
      const [[count]] = await connection.query('SELECT COUNT(*) AS total FROM crms_affected_modules');
      if (count.total >= 200) throw error('The catalogue supports up to 200 modules.');
    }
    const moduleId = id || uuid();
    const next = { id: moduleId, name, is_active: data.is_active, sort_order: data.sort_order, version: previous ? previous.version + 1 : 1 };
    if (previous) await connection.query('UPDATE crms_affected_modules SET name=?,is_active=?,sort_order=?,version=version+1 WHERE id=? AND version=?', [name, data.is_active, data.sort_order, id, data.version]);
    else await connection.query('INSERT INTO crms_affected_modules (id,name,is_active,sort_order) VALUES (?,?,?,?)', [moduleId, name, data.is_active, data.sort_order]);
    await connection.query('INSERT INTO crms_affected_module_events (id,module_id,actor_user_id,action,previous_values,next_values) VALUES (?,?,?,?,?,?)', [uuid(), moduleId, user.id, previous ? 'updated' : 'created', previous ? JSON.stringify(previous) : null, JSON.stringify(next)]);
    await connection.commit();
    return next;
  } catch (cause) {
    await connection.rollback();
    if (cause.code === 'ER_DUP_ENTRY') throw error('A module with this name already exists.', 409);
    throw cause;
  } finally { connection.release(); }
}

async function validateSelection(pool, values, existing = []) {
  if (!Array.isArray(values) || values.length > 50) throw error('Choose up to 50 affected modules.');
  if (!values.length) return [];
  let historical = existing;
  if (typeof historical === 'string') { try { historical = JSON.parse(historical); } catch { historical = []; } }
  if (!Array.isArray(historical)) historical = [];
  const active = (await listModules(pool)).filter(m => m.is_active);
  const approved = new Map(active.map(m => [m.name.toLowerCase(), m.name]));
  for (const old of historical) if (typeof old === 'string') approved.set(old.toLowerCase(), old);
  return [...new Set(values.map(v => {
    if (typeof v === 'string' && historical.includes(v)) return v;
    const name = nameOf(v), match = approved.get(name.toLowerCase());
    if (!match) throw error(`Choose an active catalogue module: ${name}`);
    return match;
  }))];
}

module.exports = { listModules, saveModule, validateSelection, canManage, nameOf };
