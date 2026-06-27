const test = require('node:test');
const assert = require('node:assert/strict');
const { getAssistantResponse } = require('./chatbotKnowledge');

test('returns workflow-specific pending guidance', () => {
  const response = getAssistantResponse({ message: 'What work is pending from my end?', role: 'Developer' });
  assert.equal(response.topic, 'pending');
  assert.match(response.reply, /Developers and select Pending/);
  assert.equal(response.suggestions.length, 3);
});

test('explains role constraints without exposing implementation details', () => {
  const response = getAssistantResponse({ message: 'What can Management users do?', role: 'Management' });
  assert.equal(response.topic, 'roles');
  assert.match(response.reply, /cannot add, edit, or update installations/);
  assert.doesNotMatch(response.reply, /database|source code|endpoint|server/i);
});

test('returns the corrected E-Handover zero-quantity rule', () => {
  const response = getAssistantResponse({ message: 'What happens when equipment quantity is zero?', role: 'User' });
  assert.equal(response.topic, 'handover');
  assert.match(response.reply, /Not installed/);
});

test('uses a safe generic response for unknown questions', () => {
  const response = getAssistantResponse({ message: 'Tell me something useful', role: 'User' });
  assert.equal(response.topic, 'general');
  assert.match(response.reply, /user-facing guidance/);
});
