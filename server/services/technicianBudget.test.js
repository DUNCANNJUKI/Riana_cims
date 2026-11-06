const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTechnicianExpenses } = require('./technicianBudget');

test('calculates one and multiple technician totals without floating point arithmetic', () => {
  const result = normalizeTechnicianExpenses([
    { technician_id: 'a', accommodation_cost: '1000.10', transport_cost: '20.20', meals_cost: '30.30', other_expenses: '0' },
    { technician_id: 'b', accommodation_cost: '0', transport_cost: '5', meals_cost: '0', other_expenses: '4.40' },
  ], ['a', 'b']);
  assert.equal(result.rows[0].technician_total, '1050.60');
  assert.equal(result.rows[1].technician_total, '9.40');
  assert.equal(result.total_budget, '1060.00');
});

test('accepts zero-expense assigned technicians', () => {
  const result = normalizeTechnicianExpenses([{ technician_id: 'a' }], ['a']);
  assert.equal(result.total_budget, '0.00');
});

test('rejects unrelated and duplicate technicians', () => {
  assert.throws(() => normalizeTechnicianExpenses([{ technician_id: 'x' }], ['a']), /assigned technician/);
  assert.throws(() => normalizeTechnicianExpenses([{ technician_id: 'a' }, { technician_id: 'a' }], ['a']), /only once/);
});

test('rejects negative, over-precision, and malformed amounts', () => {
  for (const value of ['-1', '1.001', 'NaN', '1e3']) {
    assert.throws(() => normalizeTechnicianExpenses([{ technician_id: 'a', transport_cost: value }], ['a']), /must be a non-negative amount/);
  }
});
