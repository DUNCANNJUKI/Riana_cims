const test = require('node:test');
const assert = require('node:assert/strict');
const { clientRequestProgress } = require('./clientRequestProgress');

test('development completion of a client request awaits manager and client confirmation', () => {
  const progress = clientRequestProgress({ status: 'completed', is_client_request: 1 });
  assert.equal(progress.current_step, 4);
  assert.equal(progress.is_closed, false);
  assert.equal(progress.stages.length, 8);
});
test('legacy completed requests preserve their closed state', () => {
  assert.equal(clientRequestProgress({ status: 'completed', is_client_request: 0 }).is_closed, true);
});
test('tracking exposes only a published unexpired review link', () => {
  const row = { status: 'awaiting_client_acceptance', report_status: 'sent', acceptance_token: 'review-token', token_expires_at: new Date(Date.now() + 60000) };
  assert.equal(clientRequestProgress(row).latest_completion_report.acceptance_token, 'review-token');
  for (const status of ['draft', 'superseded']) assert.equal(clientRequestProgress({ ...row, report_status: status }).latest_completion_report, null);
  assert.equal(clientRequestProgress({ ...row, token_expires_at: new Date(0) }).latest_completion_report, null);
});
test('client acceptance and feedback remain visible through administrative closure', () => {
  const row = { status: 'closed_client_accepted', feedback_rating: 5, feedback_comment: 'Delivered as requested', feedback_submitted_at: new Date() };
  const progress = clientRequestProgress(row);
  assert.equal(progress.is_closed, true);
  assert.equal(progress.feedback.rating, 5);
  assert.ok(progress.stages.every(stage => stage.completed));
  assert.equal(progress.representative, undefined);
});
