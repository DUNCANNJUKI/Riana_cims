const MONEY_PATTERN = /^\d{1,13}(?:\.\d{1,2})?$/;

const moneyToCents = (value, field) => {
  const normalized = String(value ?? '0').trim();
  if (!MONEY_PATTERN.test(normalized)) {
    const error = new Error(`${field} must be a non-negative amount with at most two decimal places.`);
    error.status = 400;
    throw error;
  }
  const [whole, fraction = ''] = normalized.split('.');
  const cents = (BigInt(whole) * 100n) + BigInt(fraction.padEnd(2, '0'));
  if (cents > 999999999999999n) {
    const error = new Error(`${field} exceeds the supported monetary limit.`);
    error.status = 400;
    throw error;
  }
  return cents;
};

const centsToDecimal = (cents) => `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;

const normalizeTechnicianExpenses = (expenses, assignedTechnicianIds) => {
  if (!Array.isArray(expenses) || expenses.length === 0) {
    const error = new Error('At least one assigned technician expense row is required.');
    error.status = 400;
    throw error;
  }
  const assigned = new Set(assignedTechnicianIds);
  const seen = new Set();
  let installationCents = 0n;
  const rows = expenses.map((expense, index) => {
    const technicianId = String(expense?.technician_id || '').trim();
    if (!assigned.has(technicianId)) {
      const error = new Error(`Expense row ${index + 1} does not belong to an assigned technician.`);
      error.status = 400;
      throw error;
    }
    if (seen.has(technicianId)) {
      const error = new Error('Each assigned technician can appear only once in a budget revision.');
      error.status = 409;
      throw error;
    }
    seen.add(technicianId);
    const accommodation = moneyToCents(expense.accommodation_cost, 'Accommodation cost');
    const transport = moneyToCents(expense.transport_cost, 'Transport cost');
    const meals = moneyToCents(expense.meals_cost, 'Meals / per diem');
    const other = moneyToCents(expense.other_expenses, 'Other expenses');
    const total = accommodation + transport + meals + other;
    installationCents += total;
    return {
      technician_id: technicianId,
      accommodation_cost: centsToDecimal(accommodation),
      transport_cost: centsToDecimal(transport),
      meals_cost: centsToDecimal(meals),
      other_expenses: centsToDecimal(other),
      technician_total: centsToDecimal(total),
      expense_notes: String(expense.expense_notes || '').trim().slice(0, 1000) || null,
    };
  });
  return { rows, total_budget: centsToDecimal(installationCents) };
};

module.exports = { moneyToCents, centsToDecimal, normalizeTechnicianExpenses };
