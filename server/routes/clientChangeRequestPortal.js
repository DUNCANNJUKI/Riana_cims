const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const { safeUpload } = require('../security/apiSecurity');
const {
  getInvitationForClient,
  submitClientChangeRequest,
  getCompletionReportForClient,
  handleClientAction,
  requestClientOtp,
  verifyOtpAndAccept,
  verifySignatureAndAccept,
} = require('../services/clientChangeRequests');

module.exports = function createClientChangeRequestPortalRouter({ pool, uploadsDir }) {
  const router = express.Router();

  // 1. Get Invitation by Token
  router.get('/invitation/:token', async (req, res) => {
    try {
      const invitation = await getInvitationForClient(pool, req.params.token);
      res.json(invitation);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message, code: err.code });
    }
  });

  // 2. Submit Change Request Form
  router.post('/submit', async (req, res) => {
    try {
      const { token, attachments: rawAttachments = [], ...submissionFields } = req.body;
      if (!token) return res.status(400).json({ error: 'Invitation token is required.' });

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
              storedAttachments.push({
                file_name: path.basename(item.fileName).slice(0, 255),
                stored_name: storedName,
                file_size: buffer.length,
                uploaded_at: new Date().toISOString(),
              });
            } catch (uploadErr) {
              return res.status(uploadErr.status || 400).json({ error: `Attachment upload error: ${uploadErr.message}` });
            }
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
      res.status(err.status || 500).json({ error: err.message, code: err.code });
    }
  });

  // 3. Get Completion Report by Token
  router.get('/review/:token', async (req, res) => {
    try {
      const report = await getCompletionReportForClient(pool, req.params.token);
      res.json(report);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
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
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // 5. Request Acceptance OTP
  router.post('/review/:token/request-otp', async (req, res) => {
    try {
      const channel = req.body.channel === 'email' ? 'email' : 'sms';
      const result = await requestClientOtp(pool, req.params.token, channel, req);
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // 6. Verify OTP and Sign Off
  router.post('/review/:token/verify-otp', async (req, res) => {
    try {
      const { code, representativeName, designation } = req.body;
      if (!code) return res.status(400).json({ error: 'Verification code is required.' });
      const result = await verifyOtpAndAccept(pool, {
        token: req.params.token,
        code,
        representativeName,
        designation,
        req,
      });
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // 7. Signature Upload and Sign Off
  router.post('/review/:token/sign', async (req, res) => {
    try {
      const { fileName, base64Data, representativeName, designation } = req.body;
      if (!fileName || !base64Data) {
        return res.status(400).json({ error: 'Signature image is required.' });
      }
      const { buffer, storedName } = safeUpload({
        fileName,
        base64Data,
        maxBytes: 5 * 1024 * 1024,
      });
      const dest = path.join(uploadsDir, storedName);
      fs.writeFileSync(dest, buffer, { mode: 0o640 });

      const result = await verifySignatureAndAccept(pool, {
        token: req.params.token,
        signaturePath: storedName,
        representativeName,
        designation,
        req,
      });
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // 8. Public Request Tracking
  router.get('/track/:token', async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT cr.id, cr.ticket_number, cr.request_title, cr.request_category, cr.date_requested,
                cr.status, cr.acceptance_status, cr.created_at, cr.updated_at,
                c.client_name, COALESCE(cb.branch_name, c.branch) AS branch_name,
                i.invitation_token
         FROM crms_change_requests cr
         JOIN clients c ON c.id COLLATE utf8mb4_unicode_ci = cr.client_id COLLATE utf8mb4_unicode_ci
         LEFT JOIN client_branches cb ON cb.id COLLATE utf8mb4_unicode_ci = cr.branch_id COLLATE utf8mb4_unicode_ci
         LEFT JOIN crms_change_request_invitations i ON i.id COLLATE utf8mb4_unicode_ci = cr.invitation_id COLLATE utf8mb4_unicode_ci
         WHERE i.invitation_token = ? OR cr.ticket_number = ? LIMIT 1`,
        [req.params.token, req.params.token],
      );
      if (!rows.length) return res.status(404).json({ error: 'Request not found.' });
      const row = rows[0];

      // Map internal statuses to safe client-facing stages
      const statusMap = {
        pending_approval: { step: 1, label: 'Under Review', description: 'Your request is undergoing internal commercial and technical review.' },
        waiting: { step: 1, label: 'Pending Clarification', description: 'Our team is reviewing the commercial scope.' },
        approved: { step: 2, label: 'Approved', description: 'Request approved. Scheduled for developer assignment.' },
        assigned: { step: 2, label: 'Developer Assigned', description: 'A developer has been assigned to implement the change.' },
        in_progress: { step: 3, label: 'In Development', description: 'Implementation is actively in progress.' },
        ready_for_completion_report: { step: 4, label: 'Testing & Verification', description: 'Implementation verified. Completion report being finalized.' },
        awaiting_client_acceptance: { step: 5, label: 'Completion Report Sent', description: 'Delivered work is ready for your review and formal acceptance.' },
        client_requested_corrections: { step: 3, label: 'Corrections in Progress', description: 'Our team is addressing the adjustments you requested.' },
        client_disputed: { step: 3, label: 'Dispute Review', description: 'Your feedback is under leadership review.' },
        client_accepted: { step: 6, label: 'Accepted by Client', description: 'Completion acknowledged. Pending administrative closure.' },
        closed_client_accepted: { step: 7, label: 'Closed – Accepted', description: 'Change request has been completed, accepted, and closed.' },
        completed: { step: 7, label: 'Completed', description: 'Change request completed.' },
        rejected: { step: 0, label: 'Declined', description: 'The change request could not be approved at this time.' },
      };

      const stageInfo = statusMap[row.status] || { step: 1, label: row.status, description: '' };

      res.json({
        ticket_number: row.ticket_number,
        title: row.request_title,
        category: row.request_category,
        client: {
          name: row.client_name,
          branch: row.branch_name,
        },
        date_requested: row.date_requested,
        current_status: stageInfo.label,
        current_step: stageInfo.step,
        status_description: stageInfo.description,
        is_closed: row.status === 'closed_client_accepted' || row.status === 'completed',
        acceptance_status: row.acceptance_status,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
