const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const notifications = require('./notifications');
const deliveredNotifications = [];
const originalProviders = { sendEmail: notifications.sendEmail, sendSms: notifications.sendSms };
// Capture providers before loading this service so these regression tests never send live messages.
notifications.sendEmail = async value => { deliveredNotifications.push({ channel: 'email', value }); return { provider: 'test' }; };
notifications.sendSms = async value => { deliveredNotifications.push({ channel: 'sms', value }); return { provider: 'test' }; };
const {
  createInvitation, createOrUpdateCompletionReport, getCompletionReportForClient,
  handleClientAction, requestClientOtp, verifyOtpAndAccept, verifySignatureAndAccept,
} = require('./clientChangeRequests');
Object.assign(notifications, originalProviders);
const createCrmsRouter = require('../routes/crms');

const response = () => ({ statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } });
const request = { protocol: 'http', headers: {}, get: () => 'localhost:8081' };
const activeReport = () => ({ id: 'report-1', change_request_id: 'request-1', account_manager_id: 'manager-1', status: 'sent', request_status: 'awaiting_client_acceptance', token_expires_at: new Date(Date.now() + 60000), ticket_number: 'CR-TEST', client_representative_name: 'Client', client_representative_phone: '+254700000000', client_representative_email: 'client@example.com' });
const transactionPool = (report, onQuery = () => [{ affectedRows: 1 }]) => {
  const events = [];
  const connection = {
    beginTransaction: async () => events.push('begin'),
    query: async (sql, values) => {
      events.push(sql);
      if (sql.includes('FROM crms_completion_reports r')) { assert.match(sql, /FOR UPDATE/); return [[report]]; }
      return onQuery(sql, values);
    },
    commit: async () => events.push('commit'),
    rollback: async () => events.push('rollback'),
    release: () => events.push('release'),
  };
  return { events, getConnection: async () => connection, query: async (sql, values) => onQuery(sql, values) };
};

test('invitation all-scope sentinels are stored and returned as nullable IDs', async () => {
  let inserted;
  const pool = { query: async (sql, values) => {
    if (sql.startsWith('SELECT id, client_name')) return [[{ id: 'client-1', client_name: 'Client' }]];
    if (sql.includes('INSERT INTO crms_change_request_invitations')) inserted = values;
    return [{ affectedRows: 1 }];
  } };
  const result = await createInvitation(pool, { clientId: 'client-1', branchId: 'all', departmentId: 'all', accountManagerId: 'manager-1', clientRepresentativeName: 'Client', clientRepresentativePhone: '+254700000000', clientRepresentativeEmail: 'client@example.com', user: { role: 'Admin' } });
  assert.equal(result.branch_id, null);
  assert.equal(result.department_id, null);
  assert.deepEqual(inserted.slice(3, 5), [null, null]);
});

test('completion report POST passes form data and saves a draft without dispatching', async () => {
  let reportValues;
  const pool = { query: async (sql, values) => {
    if (sql.includes('SELECT * FROM crms_change_requests')) return [[{ id: 'request-1' }]];
    if (sql.includes('MAX(version_number)')) return [[{ max_v: 0 }]];
    if (sql.includes('INSERT INTO crms_completion_reports')) reportValues = values;
    return [{ affectedRows: 1 }];
  } };
  const router = createCrmsRouter({ pool, jwtSecret: 's'.repeat(48) });
  const route = router.stack.find(layer => layer.route?.path === '/completion_reports' && layer.route.methods.post).route;
  const res = response();
  await route.stack[0].handle({ ...request, user: { id: 'manager-1', role: 'Admin' }, body: { change_request_id: 'request-1', summary_of_change: 'Delivered change', implemented_solution: 'Working solution', send_to_client: false } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.status, 'draft');
  assert.equal(res.body.delivery, null);
  assert.equal(reportValues[4], 'Delivered change');
  assert.equal(reportValues[5], 'Working solution');
});

test('completion report POST dispatches a prepared report and escapes client-controlled email content', async () => {
  const deliveredBefore = deliveredNotifications.length;
  const updates = [];
  const pool = { query: async (sql, values) => {
    if (sql.includes('SELECT * FROM crms_change_requests')) return [[{ id: 'request-1' }]];
    if (sql.includes('MAX(version_number)')) return [[{ max_v: 0 }]];
    if (sql.includes('FROM crms_completion_reports r')) return [[{ ...activeReport(), summary_of_change: '<img src=x onerror=alert(1)>', acceptance_token: 'secret-review-token' }]];
    updates.push({ sql, values });
    return [{ affectedRows: 1 }];
  } };
  const router = createCrmsRouter({ pool, jwtSecret: 's'.repeat(48) });
  const route = router.stack.find(layer => layer.route?.path === '/completion_reports' && layer.route.methods.post).route;
  const res = response();
  await route.stack[0].handle({ ...request, user: { id: 'manager-1', role: 'Admin' }, body: { change_request_id: 'request-1', summary_of_change: 'Summary', implemented_solution: 'Solution', send_to_client: true } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.delivery.smsStatus, 'sent');
  assert.equal(res.body.delivery.emailStatus, 'sent');
  const deliveries = deliveredNotifications.slice(deliveredBefore);
  assert.equal(deliveries.length, 2);
  const email = deliveries.find(delivery => delivery.channel === 'email').value;
  assert.match(email.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(email.html, /<img src=x/);
  assert.equal(updates.some(update => update.sql.includes("status = 'awaiting_client_acceptance'")), true);
});

test('another account manager cannot send invitations, publish reports or close a request', async () => {
  const pool = { query: async (sql) => {
    assert.match(sql, /^SELECT \* FROM `/);
    return [[{ id: 'other-record', account_manager_id: 'other-manager' }]];
  } };
  const router = createCrmsRouter({ pool, jwtSecret: 's'.repeat(48) });
  for (const path of ['/invitations/:id/send', '/invitations/:id/cancel', '/completion_reports', '/completion_reports/:id/send', '/change_requests/:id/close']) {
    const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods.post).route;
    const res = response();
    const originalError = console.error;
    try {
      console.error = () => {};
      await route.stack[0].handle({ user: { id: 'manager-1', role: 'User' }, params: { id: 'other-record' }, body: { change_request_id: 'other-record' } }, res);
    } finally { console.error = originalError; }
    assert.equal(res.statusCode, 403, path);
  }
});

test('completion attachment validation rejects executable content before any write', async () => {
  const queries = [];
  const pool = { query: async (sql) => { queries.push(sql); return [[{ id: 'request-1' }]]; } };
  await assert.rejects(createOrUpdateCompletionReport(pool, { changeRequestId: 'request-1', data: { summary_of_change: 'Summary', implemented_solution: 'Solution', attachments: [{ name: 'fake.pdf', base64: Buffer.from('<script>bad</script>').toString('base64') }] } }), /does not match/);
  assert.equal(queries.length, 1);
});

test('expired completion links cannot be read, send OTPs, accept or change workflow state', async () => {
  const report = { ...activeReport(), token_expires_at: new Date(0) };
  const readPool = { query: async () => [[report]] };
  await assert.rejects(getCompletionReportForClient(readPool, 'token'), { status: 410 });
  await assert.rejects(requestClientOtp(readPool, 'token'), { status: 410 });
  for (const operation of [
    pool => handleClientAction(pool, { token: 'token', actionType: 'dispute_raised', explanation: 'Details' }),
    pool => verifyOtpAndAccept(pool, { token: 'token', code: '123456' }),
    pool => verifySignatureAndAccept(pool, { token: 'token', signaturePath: 'signature.png', representativeName: 'Client', designation: 'Manager' }),
  ]) {
    const pool = transactionPool(report);
    await assert.rejects(operation(pool), { status: 410 });
    assert.equal(pool.events.includes('commit'), false);
    assert.deepEqual(pool.events.slice(-2), ['rollback', 'release']);
  }
});

test('superseded and already accepted reports cannot be accepted again', async () => {
  for (const status of ['draft', 'superseded', 'accepted', 'rejected', 'disputed']) {
    const pool = transactionPool({ ...activeReport(), status });
    await assert.rejects(verifySignatureAndAccept(pool, { token: 'token', signaturePath: 'signature.png', representativeName: 'Client', designation: 'Manager' }), { status: 409 });
    assert.equal(pool.events.some(sql => sql.startsWith('INSERT')), false);
  }
});

test('failed OTP attempts are committed while wrong codes cannot create acceptance', async () => {
  const pool = transactionPool(activeReport(), (sql) => {
    if (sql.includes('FROM crms_client_otp_verifications')) {
      assert.match(sql, /FOR UPDATE/);
      return [[{ id: 'otp-1', otp_hash: crypto.createHmac('sha256', 'salt').update('654321').digest('hex'), salt: 'salt' }]];
    }
    return [{ affectedRows: 1 }];
  });
  await assert.rejects(verifyOtpAndAccept(pool, { token: 'token', code: '123456' }), /Invalid verification code/);
  assert.equal(pool.events.some(sql => sql.includes('attempts = attempts + 1')), true);
  assert.equal(pool.events.includes('commit'), true);
  assert.equal(pool.events.some(sql => sql.includes('INSERT INTO crms_client_acceptances')), false);
});

test('acceptance persistence errors roll back the OTP claim and workflow changes', async () => {
  const pool = transactionPool(activeReport(), (sql) => {
    if (sql.includes('FROM crms_client_otp_verifications')) return [[{ id: 'otp-1', otp_hash: crypto.createHmac('sha256', 'salt').update('123456').digest('hex'), salt: 'salt' }]];
    if (sql.includes('INSERT INTO crms_client_acceptances')) throw new Error('database unavailable');
    return [{ affectedRows: 1 }];
  });
  await assert.rejects(verifyOtpAndAccept(pool, { token: 'token', code: '123456' }), /database unavailable/);
  assert.equal(pool.events.includes('commit'), false);
  assert.deepEqual(pool.events.slice(-2), ['rollback', 'release']);
});
