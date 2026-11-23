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
  assert.ok(text.includes('/Subtype /Image')); // E-handover branding is present even for OTP.
  assert.ok(text.includes('Page 1 of'));
  assert.ok(text.includes('CLIENT COMPLETION REPORT'));
  assert.equal(result.filename, 'CR-TEST-signed-completion.pdf');
});

test('electronic-signature report does not silently omit unavailable signature evidence', async () => {
  const pool = { query: async () => [[{ ...accepted, sign_off_method: 'signature', signature_image_path: 'missing-signature.png' }]] };
  await assert.rejects(signedCompletionReport(pool, { requestId: 'test-request', resolveSignature: () => null }), { status: 409 });
});

test('long report and feedback content stay above the e-handover footer on every page', async () => {
  const result = await signedCompletionReport({ query: async () => [[{
    ...accepted,
    implemented_solution: Array.from({ length: 140 }, (_, n) => `BOUNDARY-${n} Implemented and verified reporting changes with the client.`).join('\n'),
    feedback_rating: 5, feedback_comment: 'Feedback verification: ' + 'Delivered successfully. '.repeat(50),
  }]] }, { requestId: 'long-request' });
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const path = require('node:path');
  const standardFontDataUrl = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts').replace(/\\/g, '/') + '/';
  const task = getDocument({ data: new Uint8Array(result.buffer), isEvalSupported: false, standardFontDataUrl });
  try {
    const pdf = await task.promise;
    assert.ok(pdf.numPages >= 4);
    let boundaryLines = 0;
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const height = page.getViewport({ scale: 1 }).height;
      for (const item of content.items.filter(item => item.str?.startsWith('BOUNDARY-'))) {
        const y = (height - item.transform[5]) * 25.4 / 72;
        assert.ok(y >= 39 && y <= 252, `Page ${n} body baseline ${y} overlaps branding`);
        boundaryLines++;
      }
      assert.ok(content.items.some(item => item.str === `Page ${n} of ${pdf.numPages}`));
    }
    assert.equal(boundaryLines, 140);
  } finally { await task.destroy(); }
});

test('signed completion respects the client or responsible manager MAREZI identity', async () => {
  for (const identity of [{ client_subsidiary: 'MAREZI Kenya' }, { manager_subsidiary: 'MAREZI' }]) {
    const result = await signedCompletionReport({ query: async () => [[{ ...accepted, ...identity }]] }, { requestId: 'marezi-request' });
    assert.ok(result.buffer.toString('latin1').includes('MAREZI | Official & Confidential'));
    assert.ok(result.buffer.toString('latin1').includes('OTP attestation'));
  }
});
