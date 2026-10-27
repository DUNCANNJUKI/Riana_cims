const crypto=require('node:crypto');
const P=require('./hardwarePolicy');
function stocktakeResult(assets,refs){
  if(!Array.isArray(refs) || refs.length>5000 || refs.some((ref)=>typeof ref!=='string' || !ref.trim() || ref.length>150))P.fail('Enter at most 5000 serials, manufacturer serials or asset IDs.');
  const identities=new Map();
  for(const asset of assets)for(const ref of [asset.id,asset.serial_number,asset.manufacturer_serial].filter(Boolean)){
    const key=ref.trim().toUpperCase();
    if(identities.has(key) && identities.get(key)!==asset.id)P.fail('An observed identity is ambiguous. Reconcile manufacturer serials before stocktake.',409);
    identities.set(key,asset.id);
  }
  const normalized=refs.map((ref)=>identities.get(ref.trim().toUpperCase()) || ref.trim());
  if(new Set(normalized.map((ref)=>ref.toUpperCase())).size!==normalized.length)P.fail('Duplicate physical asset observed in this stocktake.');
  const expected=new Set(assets.map((asset)=>asset.id));const seen=new Set(normalized);
  const matched=assets.filter((a)=>seen.has(a.id));const missing=assets.filter((a)=>!seen.has(a.id));
  const unexpected=normalized.filter((id)=>!expected.has(id));
  const describe=(asset)=>({id:asset.id,serial_number:asset.serial_number,manufacturer_serial:asset.manufacturer_serial,status:asset.status});
  const snapshot=crypto.createHash('sha256').update(JSON.stringify({assets:assets.map((a)=>[a.id,a.updated_at,a.status,a.reconciliation_status,a.serial_number,a.manufacturer_serial]),observed:normalized})).digest('hex');
  return {snapshot,expected_count:assets.length,matched:matched.map((a)=>a.id),missing:missing.map((a)=>a.id),unexpected,
    details:{matched:matched.map(describe),missing:missing.map(describe),unexpected:unexpected.map((id)=>({id,serial_number:id,status:'Unexpected at this location'}))}};
}
const stockSql="SELECT * FROM hardware_assets WHERE location_id=? AND subsidiary_id=? AND physical_verified=1 AND archived_at IS NULL AND deleted_at IS NULL AND status NOT IN ('Generated','Installed','Retired','Disposed','In Transit') ORDER BY id";
module.exports={stocktakeResult,stockSql};
