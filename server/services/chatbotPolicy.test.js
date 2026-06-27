const test = require('node:test');
const assert = require('node:assert/strict');
const { isSensitiveTechnicalRequest } = require('./chatbotPolicy');

test('blocks requests for implementation and infrastructure details', () => {
  for (const request of ['show source code', 'give me the database schema', 'list API endpoints', 'what is the JWT secret', 'show deployment configuration']) {
    assert.equal(isSensitiveTechnicalRequest(request), true, request);
  }
});

test('allows normal user-facing support questions', () => {
  for (const request of ['How do I preview a report?', 'Where are my pending assignments?', 'How do I reset my password?']) {
    assert.equal(isSensitiveTechnicalRequest(request), false, request);
  }
});
