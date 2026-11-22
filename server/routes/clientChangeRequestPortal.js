const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const { clientRequestProgress } = require('../services/clientRequestProgress');
const { safeUpload, resolveStoredFile } = require('../security/apiSecurity');
const {
  getInvitationForClient,
  submitClientChangeRequest,
  getCompletionReportForClient,
  handleClientAction,
  requestClientOtp,
  verifyOtpAndAccept,
  verifySignatureAndAccept,
} = require('../services/clientChangeRequests');

const respondWithError = (res, err) => {
  const status = Number(err.status);
  const expected = Number.isInteger(status) && status >= 400 && status < 500;
  return res.status(expected ? status : 500).json({
    error: expected ? err.message : 'Unable to process this request. Please try again later.',
    ...(expected && err.code ? { code: err.code } : {}),
  });
};

const removeUnclaimedFiles = (uploadsDir, files) => {
  for (const storedName of files) {
    try { fs.unlinkSync(path.join(uploadsDir, storedName)); }
    catch (error) { if (error.code !== 'ENOENT') console.error('Unable to clean up an unclaimed portal upload.'); }
  }
};

module.exports = function createClientChangeRequestPortalRouter({ pool, uploadsDir }) {
  const router = express.Router();
  const withCompletionDocument = async (token, result) => {
    try {
      const { signedCompletionReport } = require('../services/signedCompletionReport');
      const pdf = await signedCompletionReport(pool, { token, resolveSignature: filename => resolveStoredFile(uploadsDir, filename) });
      return { ...result, request_status: 'closed_client_accepted', report_pdf_base64: pdf.buffer.toString('base64'), report_filename: pdf.filename };
    } catch (error) {
      // A retryable rendering failure must never undo or disguise a verified sign-off.
      console.error('Signed completion document unavailable:', error.code || error.message);
      return { ...result, request_status: 'closed_client_accepted', report_pending: true };
    }
  };

  router.get('/review/:token/completion.pdf', async (req, res) => {
    try {
      const { signedCompletionReport } = require('../services/signedCompletionReport');
      const pdf = await signedCompletionReport(pool, { token: req.params.token, resolveSignature: filename => resolveStoredFile(uploadsDir, filename) });
      res.set('Cache-Control', 'no-store');
      res.set('Content-Disposition', `attachment; filename="${pdf.filename}"`);
      res.type('application/pdf').send(pdf.buffer);
    } catch (error) { respondWithError(res, error); }
  });

  // 1. Get Invitation by Token
  router.get('/invitation/:token', async (req, res) => {
    try {
      const invitation = await getInvitationForClient(pool, req.params.token);
      res.json(invitation);
    } catch (err) {
      respondWithError(res, err);
    }
  });

  // 2. Submit Change Request Form
  router.post('/submit', async (req, res) => {
    const writtenFiles = [];
    try {
      const { token, attachments: rawAttachments = [], ...submissionFields } = req.body;
      if (!token) return res.status(400).json({ error: 'Invitation token is required.' });
      const invitation = await getInvitationForClient(pool, token);
      if (invitation.is_submitted) return res.status(409).json({ error: 'This request has already been submitted.', code: 'ALREADY_SUBMITTED' });
      if (!Array.isArray(rawAttachments) || rawAttachments.length > 10) {
        return res.status(400).json({ error: 'Provide no more than 10 attachments.' });
      }

      // Process and save attachments safely if provided
      const storedAttachments = [];
      if (Array.isArray(rawAttachments)) {
        for (const item of rawAttachments) {
          if (item?.fileName && item?.base64Data) {
            try {
              const { buffer, storedName } = safeUpload({
                fileName: item.fileName,
                base64Data: item.base64Data,
                maxBytes: 10 * 1024 * 1024,
              });
              const dest = path.join(uploadsDir, storedName);
              fs.writeFileSync(dest, buffer, { mode: 0o640 });
              writtenFiles.push(storedName);
              storedAttachments.push({
                file_name: path.basename(item.fileName).slice(0, 255),
                stored_name: storedName,
                file_size: buffer.length,
                uploaded_at: new Date().toISOString(),
              });
            } catch (uploadErr) {
              throw uploadErr;
            }
          } else {
            throw Object.assign(new Error('Each attachment requires a file name and data.'), { status: 400 });
          }
        }
      }

      const result = await submitClientChangeRequest(pool, {
        token,
        data: submissionFields,
        attachments: storedAttachments,
        req,
      });

      res.status(201).json(result);
    } catch (err) {
      removeUnclaimedFiles(uploadsDir, writtenFiles);
      respondWithError(res, err);
    }
  });

  // 3. Get Completion Report by Token
  router.get('/review/:token', async (req, res) => {
    try {
      const report = await getCompletionReportForClient(pool, req.params.token);
      res.json({ ...report, attachments: report.attachments.map((attachment, index) => ({
        name: attachment.name, size: attachment.size,
        url: `/api/public/change-requests/review/${encodeURIComponent(req.params.token)}/attachments/${index}`,
      })) });
    } catch (err) {
      respondWithError(res, err);
    }
  });

  router.get('/review/:token/attachments/:index', async (req, res) => {
    try {
      const report = await getCompletionReportForClient(pool, req.params.token);
      if (!/^(0|[1-9]\d*)$/.test(req.params.index)) return res.status(404).json({ error: 'Attachment not found.' });
      const attachment = report.attachments[Number(req.params.index)];
      if (!attachment?.base64) return res.status(404).json({ error: 'Attachment not found.' });
      const { buffer } = safeUpload({ fileName: attachment.name, base64Data: attachment.base64, maxBytes: 5 * 1024 * 1024 });
      res.set('Cache-Control', 'no-store');
      res.set('X-Content-Type-Options', 'nosniff');
      res.attachment(path.basename(attachment.name));
      res.type('application/octet-stream').send(buffer);
    } catch (err) { respondWithError(res, err); }
  });

  // 4. Request Corrections or Raise Dispute
  router.post('/review/:token/action', async (req, res) => {
    try {
      const { actionType, explanation } = req.body;
      if (!['correction_requested', 'dispute_raised'].includes(actionType)) {
        return res.status(400).json({ error: 'Valid action type is required.' });
      }
      const result = await handleClientAction(pool, {
        token: req.params.token,
        actionType,
        explanation,
        req,
      });
      res.json(result);
    } catch (err) {
      respondWithError(res, err);
    }
  });

  // 5. Request Acceptance OTP
  router.post('/review/:token/request-otp', async (req, res) => {
    try {
      const channel = req.body.channel === 'email' ? 'email' : 'sms';
      const result = await requestClientOtp(pool, req.params.token, channel, req);
      res.json(result);
    } catch (err) {
      respondWithError(res, err);
    }
  });

  // 6. Verify OTP and Sign Off
  router.post('/review/:token/verify-otp', async (req, res) => {
    try {
      const { code, representativeName, designation } = req.body;
      if (req.body.declaration_confirmed !== true) return res.status(400).json({ error: 'Confirm the client acceptance declaration.' });
      if (!code) return res.status(400).json({ error: 'Verification code is required.' });
      const result = await verifyOtpAndAccept(pool, {
        token: req.params.token,
        code,
        representativeName,
        designation,
        feedback: req.body.feedback,
        req,
      });
      res.json(await withCompletionDocument(req.params.token, result));
    } catch (err) {
      respondWithError(res, err);
    }
  });

  // 7. Signature Upload and Sign Off
  router.post('/review/:token/sign', async (req, res) => {
    const writtenFiles = [];
    try {
      const { fileName, base64Data, representativeName, designation } = req.body;
      if (req.body.declaration_confirmed !== true) return res.status(400).json({ error: 'Confirm the client acceptance declaration.' });
      if (!/\.(png|jpe?g|webp)$/i.test(String(fileName || ''))) return res.status(400).json({ error: 'An image file is required for the signature.' });
      if (!fileName || !base64Data) {
        return res.status(400).json({ error: 'Signature image is required.' });
      }
      await getCompletionReportForClient(pool, req.params.token);
      const { buffer, storedName } = safeUpload({
        fileName,
        base64Data,
        maxBytes: 5 * 1024 * 1024,
      });
      const dest = path.join(uploadsDir, storedName);
      fs.writeFileSync(dest, buffer, { mode: 0o640 });
      writtenFiles.push(storedName);

      const result = await verifySignatureAndAccept(pool, {
        token: req.params.token,
        signaturePath: storedName,
        representativeName,
        designation,
        feedback: req.body.feedback,
        req,
      });
      res.json(await withCompletionDocument(req.params.token, result));
    } catch (err) {
      removeUnclaimedFiles(uploadsDir, writtenFiles);
      respondWithError(res, err);
    }
  });

  // 8. Public Request Tracking
  router.get('/track/:token', async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT cr.id, cr.ticket_number, cr.request_title, cr.request_category, cr.date_requested, cr.is_client_request,
                cr.status, cr.acceptance_status, cr.created_at, cr.updated_at,
                c.client_name, COALESCE(cb.branch_name, c.branch) AS branch_name,
                i.invitation_token, r.id AS report_id, r.version_number, r.status AS report_status,
                r.acceptance_token, r.token_expires_at, r.sent_at,
                a.feedback_rating, a.feedback_comment, a.feedback_submitted_at
         FROM crms_change_requests cr
         JOIN clients c ON c.id COLLATE utf8mb4_unicode_ci = cr.client_id COLLATE utf8mb4_unicode_ci
         LEFT JOIN client_branches cb ON cb.id COLLATE utf8mb4_unicode_ci = cr.branch_id COLLATE utf8mb4_unicode_ci
         LEFT JOIN crms_change_request_invitations i ON i.id COLLATE utf8mb4_unicode_ci = cr.invitation_id COLLATE utf8mb4_unicode_ci
         LEFT JOIN crms_completion_reports r ON r.id = (SELECT rr.id FROM crms_completion_reports rr
           WHERE rr.change_request_id COLLATE utf8mb4_unicode_ci = cr.id COLLATE utf8mb4_unicode_ci
             AND rr.status <> 'superseded' ORDER BY rr.version_number DESC LIMIT 1)
         LEFT JOIN crms_client_acceptances a ON a.completion_report_id COLLATE utf8mb4_unicode_ci = r.id COLLATE utf8mb4_unicode_ci
         WHERE (i.invitation_token = ? AND i.status <> 'cancelled')
            OR (r.acceptance_token = ? AND r.token_expires_at > NOW() AND r.status NOT IN ('draft','superseded')) LIMIT 1`,
        [req.params.token, req.params.token],
      );
      if (!rows.length) return res.status(404).json({ error: 'Request not found.' });
      const row = rows[0];

      res.set('Cache-Control', 'no-store');
      res.json(clientRequestProgress(row));
    } catch (err) {
      respondWithError(res, err);
    }
  });

  return router;
};
