const test = require('node:test');
const assert = require('node:assert/strict');
const {createHardwareInventory} = require('./hardwareInventory');

const officer = {id:'officer', role:'InventoryOfficer', subsidiary_id:'a'};
test('inventory report totals distinguish recorded stock from assignable stock and preserve scope', async () => {
  let statement;
  const service = createHardwareInventory({query:async(sql,args) => {
    statement={sql,args};
    return [[{status:'Available',total:5,eligible:3,pending:1},
      {status:'Faulty',total:2,eligible:0,pending:0},
      {status:'Installed',total:4,eligible:0,pending:0}]];
  }});
  const result = await service.summary(officer, {status:'Faulty', report:'out', location_id:'warehouse'});
  assert.equal(result.total,11);
  assert.equal(result.counts.Available,3);
  assert.equal(result.status_totals.Available,5);
  assert.equal(result.status_totals.Faulty,2);
  assert.equal(result.pending,1);
  assert.equal(Object.values(result.status_totals).reduce((a,b)=>a+b,0),result.total);
  assert.match(statement.sql,/a.subsidiary_id=\?/);
  assert.deepEqual(statement.args,['a','warehouse']);
  assert.match(statement.sql,/a.archived_at IS NULL/);
  await assert.rejects(service.summary(officer,{subsidiary_id:'b'}),/restricted to your subsidiary/);
  await assert.rejects(service.summary({id:'tech',role:'User',subsidiary_id:'a'}),/permissions/);
});

test('in-stock and issued drill-down reports filter the same lifecycle groups as totals', async () => {
  const statements=[];
  const service=createHardwareInventory({query:async(sql,args)=> {
    statements.push({sql,args});
    return sql.startsWith('SELECT COUNT')?[[{total:0}]]:[[]];
  }});
  await service.list(officer,{report:'in_stock'});
  assert.ok(statements.some(({sql})=>sql.includes("a.status IN ('Available','Reserved','Returned')")));
  statements.length=0;
  await service.list(officer,{report:'out'});
  assert.ok(statements.some(({sql})=>sql.includes("a.status IN ('Assigned','Installed','In Transit')")));
  assert.ok(statements.every(({args})=>args[0]==='a'));
});
