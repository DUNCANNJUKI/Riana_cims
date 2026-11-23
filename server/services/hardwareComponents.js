const { v4: uuid } = require('uuid');
const P = require('./hardwarePolicy');

const text = (value, max, label, required = false) => {
  if (value != null && typeof value !== 'string') P.fail(`${label} must be text.`);
  const result = (value || '').trim();
  if (result.length > max || (required && !result)) P.fail(`${label} is required and must be at most ${max} characters.`);
  return result || null;
};
const id = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9-]{1,36}$/.test(value)) P.fail('Invalid component identifier.');
  return value;
};

function createHardwareComponents(pool, { scopeWhere, transaction, lockAsset, location, event }) {
  const scopedAsset = async (user, assetId) => {
    const scope = scopeWhere(user);
    const [[asset]] = await pool.query(`SELECT a.* FROM hardware_assets a WHERE a.id=? AND a.deleted_at IS NULL AND ${scope.sql}`, [id(assetId), ...scope.args]);
    if (!asset) P.fail('Asset not found.', 404);
    return asset;
  };
  const listStock = async (user, query = {}) => {
    P.requirePermission(user, 'inventory.view');
    const scope = scopeWhere(user, 's', query.subsidiary_id);
    const args = [...scope.args];
    let filter = '';
    if (query.model_id) { filter += ' AND (s.compatible_model_id IS NULL OR s.compatible_model_id=?)'; args.push(id(query.model_id)); }
    if (query.q) { const q = `%${text(query.q, 150, 'Search')}%`; filter += ' AND (s.item_code LIKE ? OR s.item_name LIKE ?)'; args.push(q, q); }
    const [rows] = await pool.query(`SELECT s.*,l.name AS location_name,m.model_number,
      COALESCE(used.allocated,0) AS allocated_quantity,s.quantity-COALESCE(used.allocated,0) AS available_quantity
      FROM hardware_component_stock s JOIN hardware_locations l ON l.id=s.location_id
      LEFT JOIN hardware_models m ON m.id=s.compatible_model_id
      LEFT JOIN (SELECT stock_item_id,SUM(quantity) allocated FROM hardware_asset_components WHERE removed_at IS NULL GROUP BY stock_item_id) used ON used.stock_item_id=s.id
      WHERE ${scope.sql}${filter} ORDER BY s.item_name,s.item_code LIMIT 100`, args);
    return { rows: rows.map(row => ({ ...row, quantity: Number(row.quantity), allocated_quantity: Number(row.allocated_quantity), available_quantity: Number(row.available_quantity) })) };
  };
  const receiveStock = req => {
    P.requirePermission(req.user, 'inventory.receive');
    const b = req.body;
    const subsidiary = P.scopedSubsidiary(req.user, b.subsidiary_id);
    const quantity = P.integer(b.quantity, 1, 1000000, 'Received quantity');
    const reason = text(b.reason, 2000, 'Receipt reference or reason', true);
    return transaction(req, 'component-stock:receive', async db => {
      let stock;
      if (b.stock_item_id) {
        [[stock]] = await db.query('SELECT * FROM hardware_component_stock WHERE id=? AND subsidiary_id=? FOR UPDATE', [id(b.stock_item_id), subsidiary]);
        if (!stock) P.fail('Stock item not found.', 404);
        if (Number(stock.quantity) + quantity > 1000000000) P.fail('Stock quantity exceeds the supported limit.');
        await db.query('UPDATE hardware_component_stock SET quantity=quantity+? WHERE id=?', [quantity, stock.id]);
      } else {
        const itemCode = text(b.item_code, 64, 'Item code', true).toUpperCase();
        if (!/^[A-Z0-9._/-]+$/.test(itemCode)) P.fail('Use letters, numbers, dots, slashes, underscores or hyphens for the item code.');
        const name = text(b.item_name, 150, 'Item name', true);
        const unit = text(b.unit || 'pieces', 20, 'Unit', true);
        const locationId = await location(db, b.location_id, subsidiary);
        if (!locationId) P.fail('Select the receiving stock location.');
        const modelId = b.compatible_model_id ? id(b.compatible_model_id) : null;
        if (modelId) {
          const [[model]] = await db.query('SELECT id FROM hardware_models WHERE id=? AND approval_status=\'Approved\'', [modelId]);
          if (!model) P.fail('Select an approved compatible equipment model.');
        }
        stock = { id: uuid(), subsidiary_id: subsidiary, quantity: 0 };
        await db.query(`INSERT INTO hardware_component_stock (id,subsidiary_id,location_id,compatible_model_id,item_code,item_name,unit,quantity,created_by) VALUES (?,?,?,?,?,?,?,?,?)`, [stock.id, subsidiary, locationId, modelId, itemCode, name, unit, quantity, req.user.id]);
      }
      await event(db, req, 'component_stock_received', { subsidiary_id: subsidiary }, { stock_item_id: stock.id, quantity, previous_quantity: Number(stock.quantity), received_quantity: Number(stock.quantity) + quantity, reason });
      return { id: stock.id, quantity: Number(stock.quantity) + quantity };
    });
  };
  const list = async (user, assetId) => {
    P.requirePermission(user, 'inventory.view');
    const asset = await scopedAsset(user, assetId);
    const [rows] = await pool.query(`SELECT x.*,a.serial_number,a.model_id,m.model_number,a.status AS component_status,
      s.item_code,s.item_name,s.unit,s.location_id AS stock_location_id
      FROM hardware_asset_components x
      LEFT JOIN hardware_assets a ON a.id=x.component_asset_id AND a.subsidiary_id=?
      LEFT JOIN hardware_models m ON m.id=a.model_id
      LEFT JOIN hardware_component_stock s ON s.id=x.stock_item_id AND s.subsidiary_id=?
      WHERE x.parent_asset_id=? ORDER BY x.removed_at IS NULL DESC,x.attached_at DESC`, [asset.subsidiary_id, asset.subsidiary_id, asset.id]);
    const [parents] = await pool.query(`SELECT x.id,x.relationship,p.id AS parent_asset_id,p.serial_number FROM hardware_asset_components x JOIN hardware_assets p ON p.id=x.parent_asset_id WHERE x.component_asset_id=? AND x.removed_at IS NULL AND p.subsidiary_id=?`, [asset.id, asset.subsidiary_id]);
    return { rows, linked_to: parents[0] || null };
  };
  const attach = (req, assetId) => {
    P.requirePermission(req.user, 'inventory.edit');
    const b = req.body;
    if (!['accessory', 'spare'].includes(b.relationship)) P.fail('Select accessory or spare.');
    if (Boolean(b.component_asset_id) === Boolean(b.stock_item_id)) P.fail('Select exactly one serialized asset or quantity-based stock item.');
    const parentId = id(assetId), childId = b.component_asset_id ? id(b.component_asset_id) : null;
    if (parentId === childId) P.fail('Equipment cannot be its own accessory.');
    const quantity = P.integer(b.quantity ?? 1, 1, childId ? 1 : 1000000, 'Quantity');
    const slot = text(b.slot_label, 100, 'Position or purpose');
    const notes = text(b.notes, 2000, 'Notes');
    return transaction(req, `component:attach:${parentId}`, async db => {
      const locked = new Map();
      for (const asset of [parentId, childId].filter(Boolean).sort()) locked.set(asset, await lockAsset(db, req.user, asset));
      const parent = locked.get(parentId), child = locked.get(childId);
      if (!parent.serial_number || !Number(parent.physical_verified) || parent.approval_status !== 'Approved' || parent.archived_at || ['Retired', 'Disposed', 'In Transit'].includes(parent.status)) P.fail('Receive and verify the equipment before associating accessories or spares.', 409);
      if (parent.component_parent_id) P.fail('Associate parts with the main equipment; nested accessory links are not supported.', 409);
      let stock;
      if (child) {
        if (child.subsidiary_id !== parent.subsidiary_id) P.fail('Equipment and accessories must belong to the same subsidiary.', 403);
        const sameInstallation = parent.installation_id && parent.installation_id === child.installation_id && ['Assigned', 'Installed', 'Reserved'].includes(child.status) && !child.component_parent_id && !child.archived_at && Number(child.physical_verified) && child.approval_status === 'Approved' && child.serial_number && ['New','Good','Fair'].includes(child.condition_grade) && child.reconciliation_status === 'Matched';
        if (!P.eligible(child) && !sameInstallation) P.fail('Select verified available stock or equipment assigned to the same installation.', 409);
        const [[nested]] = await db.query('SELECT id FROM hardware_asset_components WHERE parent_asset_id=? AND removed_at IS NULL LIMIT 1', [child.id]);
        if (nested) P.fail('This item already has accessories. Detach them before linking it as a component.', 409);
      } else {
        [[stock]] = await db.query('SELECT * FROM hardware_component_stock WHERE id=? AND subsidiary_id=? FOR UPDATE', [id(b.stock_item_id), parent.subsidiary_id]);
        if (!stock) P.fail('Stock item not found.', 404);
        if (stock.compatible_model_id && stock.compatible_model_id !== parent.model_id) P.fail('This part is configured for a different equipment model.', 409);
        const [allocations] = await db.query('SELECT quantity FROM hardware_asset_components WHERE stock_item_id=? AND removed_at IS NULL FOR UPDATE', [stock.id]);
        const allocated = allocations.reduce((sum, item) => sum + Number(item.quantity), 0);
        if (quantity > Number(stock.quantity) - allocated) P.fail('Insufficient available accessory or spare stock.', 409);
      }
      const [[duplicate]] = await db.query('SELECT id FROM hardware_asset_components WHERE parent_asset_id=? AND removed_at IS NULL AND (component_asset_id=? OR stock_item_id=?) LIMIT 1', [parent.id, childId, stock?.id || null]);
      if (duplicate) P.fail('This item is already associated. Remove its current association before changing it.', 409);
      const linkId = uuid();
      await db.query('INSERT INTO hardware_asset_components (id,parent_asset_id,component_asset_id,stock_item_id,relationship,quantity,slot_label,notes,attached_by) VALUES (?,?,?,?,?,?,?,?,?)', [linkId,parent.id,childId,stock?.id || null,b.relationship,quantity,slot,notes,req.user.id]);
      const details = { association_id: linkId, component_asset_id: childId, stock_item_id: stock?.id || null, relationship: b.relationship, quantity, slot_label: slot, notes };
      await event(db, req, 'component_associated', parent, details);
      if (child) await event(db, req, 'associated_to_equipment', child, { ...details, parent_asset_id: parent.id, parent_serial: parent.serial_number });
      return { id: linkId };
    });
  };
  const remove = (req, assetId, linkId) => {
    P.requirePermission(req.user, 'inventory.edit');
    const reason = text(req.body.reason, 2000, 'Removal reason', true);
    return transaction(req, `component:remove:${id(linkId)}`, async db => {
      // Discover the endpoints, then use the same deterministic asset lock order as attachment.
      const [[reference]] = await db.query('SELECT * FROM hardware_asset_components WHERE id=? AND parent_asset_id=?', [linkId,id(assetId)]);
      if (!reference) P.fail('Association not found.', 404);
      const locked = new Map();
      for (const value of [assetId, reference.component_asset_id].filter(Boolean).sort()) locked.set(value, await lockAsset(db, req.user, value));
      const parent = locked.get(assetId);
      if (reference.stock_item_id) await db.query('SELECT id FROM hardware_component_stock WHERE id=? FOR UPDATE', [reference.stock_item_id]);
      const [[link]] = await db.query('SELECT * FROM hardware_asset_components WHERE id=? FOR UPDATE', [linkId]);
      if (link.removed_at) P.fail('This association has already been removed.', 409);
      const disposition = req.body.disposition || 'returned';
      if (!['returned', 'consumed'].includes(disposition)) P.fail('Select returned or consumed/unserviceable.');
      if (link.component_asset_id && disposition !== 'returned') P.fail('Remove the serialized association, then record its condition through the existing asset lifecycle.');
      if (link.stock_item_id && disposition === 'consumed') {
        const [result] = await db.query('UPDATE hardware_component_stock SET quantity=quantity-? WHERE id=? AND quantity>=?', [link.quantity,link.stock_item_id,link.quantity]);
        if (!result.affectedRows) P.fail('Stock balance changed; refresh and retry the removal.', 409);
      }
      await db.query('UPDATE hardware_asset_components SET removed_at=NOW(),removed_by=?,removal_reason=? WHERE id=?', [req.user.id,reason,link.id]);
      const details = { association_id: link.id, component_asset_id: link.component_asset_id, stock_item_id: link.stock_item_id, quantity: link.quantity, disposition, reason };
      await event(db,req,'component_removed',parent,details);
      if (link.component_asset_id) await event(db,req,'removed_from_equipment',locked.get(link.component_asset_id),{ ...details,parent_asset_id:parent.id });
      return { id:link.id, removed:true };
    });
  };
  return { listStock, receiveStock, list, attach, remove };
}

module.exports = { createHardwareComponents };
