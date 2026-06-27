const test = require('node:test');
const assert = require('node:assert/strict');
const {
  deliveryForCrmsEvent,
  resolveCompletionRecipientId,
} = require('./crmsNotificationPolicy');

test('required Developers events use email, SMS, and the dispatcher in-app record', () => {
  for (const eventName of ['approval_needed', 'assigned', 'completed']) {
    assert.deepEqual(deliveryForCrmsEvent(eventName), { email: true, sms: true });
  }
});

test('completion targets the assigning user and falls back for legacy requests', () => {
  assert.equal(resolveCompletionRecipientId({
    assignedByUserId: 'assigner',
    seniorDeveloperId: 'senior',
    completedByUserId: 'developer',
  }), 'assigner');
  assert.equal(resolveCompletionRecipientId({
    assignedByUserId: null,
    seniorDeveloperId: 'senior',
    completedByUserId: 'developer',
  }), 'senior');
});

test('completion does not generate a notification to the same acting user', () => {
  assert.equal(resolveCompletionRecipientId({
    assignedByUserId: 'developer',
    seniorDeveloperId: 'senior',
    completedByUserId: 'developer',
  }), null);
});
