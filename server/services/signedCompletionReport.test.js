const test = require('node:test');
const assert = require('node:assert/strict');
const { signedCompletionReport } = require('./signedCompletionReport');

const accepted = {
  ticket_number: 'CR-TEST', version_number: 2, client_name: 'Example Client', request_title: 'Implemented reporting',
  summary_of_change: 'Requested changes', implemented_solution: 'Delivered solution',
  acceptance_id: 'verified-acceptance', client_representative_name: 'Alex Client', client_representative_designation: 'Manager',
  accepted_at: new Date('2026-11-22T10:00:00Z'), otp_verified_at: new Date('2026-11-22T10:00:00Z'),
  sign_off_method: 'otp', declaration_text: 'I confirm the delivered work.',
};

test('signed report refuses a token without an eligible acceptance', async () => {
  const pool = { query: async (_sql, params) => { assert.deepEqual(params, ['unknown-token']); return [[]]; } };
  await assert.rejects(signedCompletionReport(pool, { token: 'unknown-token' }), { status: 404 });
});

test('OTP report records the client and verified method without inventing handwriting', async () => {
  const result = await signedCompletionReport({ query: async () => [[accepted]] }, { requestId: 'test-request' });
  assert.equal(result.buffer.subarray(0, 5).toString(), '%PDF-');
  const text = result.buffer.toString('latin1');
  assert.ok(text.includes('Alex Client'));
  assert.ok(text.includes('OTP attestation'));
  assert.ok(text.includes('handwritten'));
  assert.ok(!text.includes('/Subtype /Image'));
  assert.equal(result.filename, 'CR-TEST-signed-completion.pdf');
});

test('electronic-signature report does not silently omit unavailable signature evidence', async () => {
  const pool = { query: async () => [[{ ...accepted, sign_off_method: 'signature', signature_image_path: 'missing-signature.png' }]] };
  await assert.rejects(signedCompletionReport(pool, { requestId: 'test-request', resolveSignature: () => null }), { status: 409 });
});
