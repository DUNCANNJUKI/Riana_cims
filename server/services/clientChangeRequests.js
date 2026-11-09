const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const { v4: uuidv4 } = require('uuid');
const { sendEmail, sendSms, normalizePhone } = require('./notifications');
const { sendUserNotification, sendUsersNotification } = require('./notificationDispatcher');
const { canonicalAppUrl } = require('../security/apiSecurity');

const INVITATION_EXPIRY_DAYS = 14;
const COMPLETION_REPORT_EXPIRY_DAYS = 30;
const OTP_EXPIRY_MINUTES = 10;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;

const generateSecureToken = () => crypto.randomBytes(32).toString('hex');

const generateReference = (prefix = 'CR') => {
  const year = new Date().getFullYear();
  const random = crypto.randomInt(10000, 99999);
  return `${prefix}-${year}-${random}`;
};

const hashOtp = (otp, salt) => {
  return crypto.createHmac('sha256', salt).update(String(otp).trim()).digest('hex');
};

const generateOtp = () => {
  const otp = String(crypto.randomInt(100000, 999999));
  const salt = crypto.randomBytes(16).toString('hex');
  const otpHash = hashOtp(otp, salt);
  return { otp, salt, otpHash };
};

const recordDeliveryLog = async (pool, {
  eventType,
  recipientType,
  recipientId = null,
  recipientContact,
  channel,
  changeRequestId = null,
  invitationId = null,
  status,
  providerResponse = null,
  errorMessage = null,
}) => {
  try {
    const id = uuidv4();
    await pool.query(
      `INSERT INTO crms_notification_delivery_logs
       (id, event_type, recipient_type, recipient_id, recipient_contact, channel, change_request_id, invitation_id, status, provider_response, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        eventType,
        recipientType,
        recipientId,
        String(recipientContact || '').slice(0, 255),
        channel,
        changeRequestId,
        invitationId,
        status,
        typeof providerResponse === 'object' ? JSON.stringify(providerResponse) : String(providerResponse || ''),
        errorMessage ? String(errorMessage).slice(0, 1000) : null,
      ],
    );
    return id;
  } catch (err) {
    console.error('Failed to record notification delivery log:', err.message);
    return null;
  }
};

const recordCrmsAudit = async (pool, {
  requestId,
  userId = null,
  action,
  actionLabel,
  details = null,
  previousValue = null,
  newValue = null,
  metadata = null,
}) => {
  try {
    const id = uuidv4();
    await pool.query(
      `INSERT INTO crms_audit_logs
       (id, request_id, action, action_label, details, previous_value, new_value, metadata, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        requestId,
        action,
        actionLabel,
        details,
        previousValue,
        newValue,
        metadata ? JSON.stringify(metadata) : null,
        userId,
      ],
    );
    return id;
  } catch (err) {
    console.error('Failed to record CRMS audit log:', err.message);
    return null;
  }
};

// -------------------------------------------------------------
// INVITATIONS
// -------------------------------------------------------------

const createInvitation = async (pool, {
  clientId,
  branchId = null,
  departmentId = null,
  accountManagerId,
  clientRepresentativeName,
  clientRepresentativePhone,
  clientRepresentativeEmail,
  user,
}) => {
  const trimmedName = String(clientRepresentativeName || '').trim();
  const trimmedPhone = String(clientRepresentativePhone || '').trim();
  const trimmedEmail = String(clientRepresentativeEmail || '').trim().toLowerCase();

  if (!clientId) throw Object.assign(new Error('Client selection is required.'), { status: 400 });
  if (!trimmedName) throw Object.assign(new Error('Client representative name is required.'), { status: 400 });
  if (!trimmedPhone) throw Object.assign(new Error('Client representative phone number is required.'), { status: 400 });
  if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    throw Object.assign(new Error('A valid client representative email address is required.'), { status: 400 });
  }

  // Validate Client exists
  const [clients] = await pool.query('SELECT id, client_name, branch FROM clients WHERE id = ? LIMIT 1', [clientId]);
  if (!clients.length) throw Object.assign(new Error('Selected client was not found.'), { status: 404 });
  const client = clients[0];

  // Validate Branch if provided
  let branchName = client.branch || 'Main Branch';
  if (branchId) {
    const [branches] = await pool.query(
      'SELECT id, branch_name FROM client_branches WHERE id = ? AND client_id = ? AND deleted_at IS NULL LIMIT 1',
      [branchId, clientId],
    );
    if (!branches.length) throw Object.assign(new Error('Selected branch does not belong to this client.'), { status: 400 });
    branchName = branches[0].branch_name;
  }

  // Validate Department if provided
  let departmentName = null;
  if (departmentId) {
    const [departments] = await pool.query(
      'SELECT id, department_name, branch_id FROM client_departments WHERE id = ? AND client_id = ? AND deleted_at IS NULL LIMIT 1',
      [departmentId, clientId],
    );
    if (!departments.length) throw Object.assign(new Error('Selected department does not belong to this client.'), { status: 400 });
    if (branchId && departments[0].branch_id && departments[0].branch_id !== branchId) {
      throw Object.assign(new Error('Selected department does not belong to the selected branch.'), { status: 400 });
    }
    departmentName = departments[0].department_name;
  }

  // Account manager assignment validation
  const isPrivileged = ['SuperAdmin', 'Admin', 'Management', 'Sales'].includes(user.role);
  if (!isPrivileged) {
    const [assignments] = await pool.query(
      `SELECT id FROM client_assignments
       WHERE client_id = ? AND (hardware_technician_id = ? OR software_technician_id = ?)
       LIMIT 1`,
      [clientId, accountManagerId, accountManagerId],
    );
    if (!assignments.length) {
      throw Object.assign(new Error('You are only authorized to initiate change requests for clients assigned to you.'), { status: 403 });
    }
  }

  const id = uuidv4();
  const token = generateSecureToken();
  const requestReference = generateReference('CR-INV');
  const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO crms_change_request_invitations
     (id, invitation_token, client_id, branch_id, department_id, account_manager_id, client_representative_name, client_representative_phone, client_representative_email, request_reference, status, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
    [
      id,
      token,
      clientId,
      branchId || null,
      departmentId || null,
      accountManagerId,
      trimmedName,
      trimmedPhone,
      trimmedEmail,
      requestReference,
      expiresAt,
    ],
  );

  return {
    id,
    invitation_token: token,
    client_id: clientId,
    client_name: client.client_name,
    branch_id: branchId,
    branch_name: branchName,
    department_id: departmentId,
    department_name: departmentName,
    account_manager_id: accountManagerId,
    client_representative_name: trimmedName,
    client_representative_phone: trimmedPhone,
    client_representative_email: trimmedEmail,
    request_reference: requestReference,
    status: 'draft',
    expires_at: expiresAt,
  };
};

const sendInvitation = async (pool, invitationId, req) => {
  const [rows] = await pool.query(
    `SELECT i.*, c.client_name, COALESCE(cb.branch_name, c.branch) AS branch_name, cd.department_name,
            u.first_name AS am_first_name, u.last_name AS am_last_name, u.email AS am_email
     FROM crms_change_request_invitations i
     JOIN clients c ON c.id = i.client_id
     LEFT JOIN client_branches cb ON cb.id = i.branch_id
     LEFT JOIN client_departments cd ON cd.id = i.department_id
     JOIN user_profiles u ON u.id = i.account_manager_id
     WHERE i.id = ? LIMIT 1`,
    [invitationId],
  );

  if (!rows.length) throw Object.assign(new Error('Invitation not found.'), { status: 404 });
  const invitation = rows[0];

  if (['submitted', 'cancelled'].includes(invitation.status)) {
    throw Object.assign(new Error(`Cannot send an invitation that has already been ${invitation.status}.`), { status: 400 });
  }

  const publicUrl = `${canonicalAppUrl(req).replace(/\/+$/, '')}/change-request/submit/${encodeURIComponent(invitation.invitation_token)}`;
  const amName = `${invitation.am_first_name || ''} ${invitation.am_last_name || ''}`.trim() || 'Your Riana Account Manager';

  // 1. Send SMS
  let smsStatus = 'failed';
  try {
    const smsText = `RIANA CIMS: Hello ${invitation.client_representative_name}, you are invited to submit a Change Request for ${invitation.client_name} (${invitation.branch_name}). Open here: ${publicUrl}`;
    const smsResult = await sendSms({
      to: invitation.client_representative_phone,
      message: smsText,
    });
    smsStatus = 'sent';
    await recordDeliveryLog(pool, {
      eventType: 'invitation',
      recipientType: 'client',
      recipientContact: invitation.client_representative_phone,
      channel: 'sms',
      invitationId: invitation.id,
      status: 'sent',
      providerResponse: smsResult,
    });
  } catch (smsError) {
    console.error('Failed to send invitation SMS:', smsError.message);
    await recordDeliveryLog(pool, {
      eventType: 'invitation',
      recipientType: 'client',
      recipientContact: invitation.client_representative_phone,
      channel: 'sms',
      invitationId: invitation.id,
      status: 'failed',
      errorMessage: smsError.message,
    });
  }

  // 2. Send Email
  let emailStatus = 'failed';
  try {
    const emailResult = await sendEmail({
      recipientEmail: invitation.client_representative_email,
      recipientName: invitation.client_representative_name,
      notificationType: 'client_change_request_invitation',
      clientName: invitation.client_name,
      requestDescription: `Change Request Invitation (${invitation.request_reference})`,
      actionUrl: publicUrl,
      actionText: 'Submit Change Request',
      text: `Hello ${invitation.client_representative_name},\n\nYou have been invited by ${amName} to submit a formal Change Request for ${invitation.client_name} - ${invitation.branch_name}.\n\nPlease access the secure submission form using the link below:\n${publicUrl}\n\nReference: ${invitation.request_reference}\nThis link is confidential and single-use.\n\nRIANA Technologies`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #0f766e; padding: 24px; text-align: center; color: #ffffff;">
            <h2 style="margin: 0; font-size: 20px; font-weight: 600;">RIANA CIMS – Client Change Request</h2>
          </div>
          <div style="padding: 24px; color: #1e293b; line-height: 1.6;">
            <p style="margin-top: 0;">Hello <strong>${invitation.client_representative_name}</strong>,</p>
            <p>You have been registered by your Riana Account Manager (<strong>${amName}</strong>) to submit an official Change Request for:</p>
            <div style="background-color: #f8fafc; border-left: 4px solid #0f766e; padding: 12px 16px; margin: 16px 0;">
              <p style="margin: 0; font-weight: 600; color: #0f766e;">${invitation.client_name}</p>
              <p style="margin: 4px 0 0; font-size: 14px; color: #64748b;">Branch: ${invitation.branch_name}${invitation.department_name ? ` • Department: ${invitation.department_name}` : ''}</p>
              <p style="margin: 4px 0 0; font-size: 13px; color: #94a3b8;">Invitation Reference: ${invitation.request_reference}</p>
            </div>
            <p>Please click the button below to open your secure, pre-configured submission form:</p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${publicUrl}" style="background-color: #0f766e; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; display: inline-block;">Complete Change Request</a>
            </div>
            <p style="font-size: 13px; color: #64748b;">This secure link is single-use and will expire in ${INVITATION_EXPIRY_DAYS} days. If you did not request this, please contact your Riana Account Manager.</p>
          </div>
          <div style="background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #64748b;">
            &copy; ${new Date().getFullYear()} RIANA Group. All rights reserved.
          </div>
        </div>
      `,
    });
    emailStatus = 'sent';
    await recordDeliveryLog(pool, {
      eventType: 'invitation',
      recipientType: 'client',
      recipientContact: invitation.client_representative_email,
      channel: 'email',
      invitationId: invitation.id,
      status: 'sent',
      providerResponse: emailResult,
    });
  } catch (emailError) {
    console.error('Failed to send invitation Email:', emailError.message);
    await recordDeliveryLog(pool, {
      eventType: 'invitation',
      recipientType: 'client',
      recipientContact: invitation.client_representative_email,
      channel: 'email',
      invitationId: invitation.id,
      status: 'failed',
      errorMessage: emailError.message,
    });
  }

  // Update invitation record
  await pool.query(
    `UPDATE crms_change_request_invitations
     SET status = 'sent', delivery_sms_status = ?, delivery_email_status = ?, last_notification_sent_at = NOW()
     WHERE id = ?`,
    [smsStatus, emailStatus, invitation.id],
  );

  return {
    success: true,
    invitationId: invitation.id,
    smsStatus,
    emailStatus,
    publicUrl,
  };
};

const cancelInvitation = async (pool, invitationId, userId) => {
  const [rows] = await pool.query(
    'SELECT id, status, request_reference FROM crms_change_request_invitations WHERE id = ? LIMIT 1',
    [invitationId],
  );
  if (!rows.length) throw Object.assign(new Error('Invitation not found.'), { status: 404 });
  if (rows[0].status === 'submitted') throw Object.assign(new Error('Cannot cancel a submitted request.'), { status: 400 });

  await pool.query(
    "UPDATE crms_change_request_invitations SET status = 'cancelled', cancelled_at = NOW() WHERE id = ?",
    [invitationId],
  );

  return { success: true, message: `Invitation ${rows[0].request_reference} cancelled.` };
};

const getInvitationForClient = async (pool, token) => {
  const [rows] = await pool.query(
    `SELECT i.*, c.client_name, COALESCE(cb.branch_name, c.branch) AS branch_name, cd.department_name,
            u.first_name AS am_first_name, u.last_name AS am_last_name, u.email AS am_email, u.phone_number AS am_phone,
            (i.expires_at <= NOW()) AS is_expired
     FROM crms_change_request_invitations i
     JOIN clients c ON c.id = i.client_id
     LEFT JOIN client_branches cb ON cb.id = i.branch_id
     LEFT JOIN client_departments cd ON cd.id = i.department_id
     JOIN user_profiles u ON u.id = i.account_manager_id
     WHERE i.invitation_token = ? LIMIT 1`,
    [token],
  );

  if (!rows.length) throw Object.assign(new Error('Invitation link not found.'), { status: 404, code: 'INVITATION_NOT_FOUND' });
  const inv = rows[0];

  if (inv.status === 'submitted') {
    return {
      is_submitted: true,
      request_reference: inv.request_reference,
      submitted_at: inv.submitted_at,
      change_request_id: inv.change_request_id,
    };
  }

  if (inv.status === 'cancelled') {
    throw Object.assign(new Error('This invitation link has been cancelled by RIANA.'), { status: 410, code: 'INVITATION_CANCELLED' });
  }

  if (inv.is_expired) {
    throw Object.assign(new Error('This invitation link has expired.'), { status: 410, code: 'INVITATION_EXPIRED' });
  }

  // Mark opened if it was sent
  if (inv.status === 'sent') {
    await pool.query(
      "UPDATE crms_change_request_invitations SET status = 'opened', opened_at = COALESCE(opened_at, NOW()) WHERE id = ?",
      [inv.id],
    );
  }

  return {
    id: inv.id,
    request_reference: inv.request_reference,
    expires_at: inv.expires_at,
    client: {
      id: inv.client_id,
      name: inv.client_name,
      branch: inv.branch_name,
      department: inv.department_name,
    },
    representative: {
      name: inv.client_representative_name,
      phone: inv.client_representative_phone,
      email: inv.client_representative_email,
    },
    account_manager: {
      name: `${inv.am_first_name || ''} ${inv.am_last_name || ''}`.trim() || 'Account Manager',
      email: inv.am_email,
      phone: inv.am_phone,
    },
  };
};

// -------------------------------------------------------------
// CLIENT CHANGE REQUEST SUBMISSION
// -------------------------------------------------------------

const submitClientChangeRequest = async (pool, { token, data, attachments = [], req }) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [invitations] = await connection.query(
      `SELECT i.*, c.client_name, COALESCE(cb.branch_name, c.branch) AS branch_name, cd.department_name
       FROM crms_change_request_invitations i
       JOIN clients c ON c.id = i.client_id
       LEFT JOIN client_branches cb ON cb.id = i.branch_id
       LEFT JOIN client_departments cd ON cd.id = i.department_id
       WHERE i.invitation_token = ? LIMIT 1 FOR UPDATE`,
      [token],
    );

    if (!invitations.length) {
      throw Object.assign(new Error('Invitation not found.'), { status: 404, code: 'INVITATION_NOT_FOUND' });
    }

    const invitation = invitations[0];
    if (invitation.status === 'submitted') {
      throw Object.assign(new Error('This request has already been submitted.'), { status: 409, code: 'ALREADY_SUBMITTED' });
    }
    if (invitation.status === 'cancelled') {
      throw Object.assign(new Error('This invitation has been cancelled.'), { status: 410, code: 'INVITATION_CANCELLED' });
    }
    if (new Date(invitation.expires_at) <= new Date()) {
      throw Object.assign(new Error('This invitation has expired.'), { status: 410, code: 'INVITATION_EXPIRED' });
    }

    // Validation
    const title = String(data.request_title || '').trim();
    const description = String(data.description || data.change_description || '').trim();
    if (!title) throw Object.assign(new Error('Request title is required.'), { status: 400 });
    if (!description) throw Object.assign(new Error('Detailed description of the requested change is required.'), { status: 400 });
    if (!data.declaration_confirmed) {
      throw Object.assign(new Error('You must confirm the submission declaration.'), { status: 400 });
    }

    // Resolve default senior developer
    const [seniorDevs] = await connection.query(
      `SELECT u.id FROM user_profiles u
       LEFT JOIN user_module_roles umr ON umr.user_id = u.id AND umr.module_id = 'crms'
       LEFT JOIN roles r ON r.id = umr.role_id
       WHERE u.is_active = TRUE AND (COALESCE(r.code, u.role) = 'Teamlead' OR u.role = 'SuperAdmin')
       ORDER BY (u.role = 'SuperAdmin') DESC, u.created_at ASC LIMIT 1`,
    );
    const seniorDevId = seniorDevs[0]?.id || invitation.account_manager_id;

    const requestId = uuidv4();
    const ticketNumber = generateReference('CR');
    const category = data.request_category || 'enhancement';
    const priority = ['low', 'medium', 'high', 'critical'].includes(String(data.priority).toLowerCase())
      ? String(data.priority).toLowerCase()
      : 'medium';

    const clientSubmissionData = {
      submitted_by_representative: invitation.client_representative_name,
      representative_phone: invitation.client_representative_phone,
      representative_email: invitation.client_representative_email,
      request_title: title,
      request_category: category,
      change_description: description,
      current_behaviour: data.current_behaviour || null,
      expected_behaviour: data.expected_behaviour || null,
      business_problem: data.business_problem || null,
      business_justification: data.business_justification || null,
      impact_on_operations: data.impact_on_operations || null,
      preferred_timeline: data.preferred_timeline || null,
      additional_comments: data.additional_comments || null,
      declaration_confirmed: true,
      submitted_at: new Date().toISOString(),
    };

    // Insert change request
    await connection.query(
      `INSERT INTO crms_change_requests (
        id, ticket_number, client_id, branch_id, department_id, department, date_requested, source,
        is_client_request, invitation_id, account_manager_id, client_representative_name, client_representative_phone,
        client_representative_email, request_title, request_category, change_description, current_behaviour,
        expected_behaviour, business_problem, business_justification, impact_on_operations, preferred_timeline,
        additional_comments, client_declaration_confirmed, client_submission_timestamp, client_submission_data,
        client_attachments, priority, status, modules_affected, estimated_completion_date, senior_developer_id
      ) VALUES (?, ?, ?, ?, ?, ?, CURDATE(), 'meeting',
        TRUE, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, TRUE, NOW(), ?,
        ?, ?, 'pending_approval', JSON_ARRAY(), DATE_ADD(CURDATE(), INTERVAL 14 DAY), ?
      )`,
      [
        requestId,
        ticketNumber,
        invitation.client_id,
        invitation.branch_id,
        invitation.department_id,
        invitation.department_name || 'General',
        invitation.id,
        invitation.account_manager_id,
        invitation.client_representative_name,
        invitation.client_representative_phone,
        invitation.client_representative_email,
        title,
        category,
        description,
        data.current_behaviour || null,
        data.expected_behaviour || null,
        data.business_problem || null,
        data.business_justification || null,
        data.impact_on_operations || null,
        data.preferred_timeline || null,
        data.additional_comments || null,
        JSON.stringify(clientSubmissionData),
        JSON.stringify(attachments || []),
        priority,
        seniorDevId,
      ],
    );

    // Update invitation
    await connection.query(
      "UPDATE crms_change_request_invitations SET status = 'submitted', submitted_at = NOW(), change_request_id = ? WHERE id = ?",
      [requestId, invitation.id],
    );

    // Record audit log
    await recordCrmsAudit(connection, {
      requestId,
      action: 'created',
      actionLabel: 'Client Change Request Submitted',
      details: `Submitted by client representative ${invitation.client_representative_name} via secure portal.`,
      newValue: 'pending_approval',
      metadata: {
        invitationReference: invitation.request_reference,
        category,
        priority,
        attachmentsCount: attachments.length,
      },
    });

    await connection.commit();

    // Asynchronous notifications (post-commit)
    const actionUrl = `${canonicalAppUrl(req).replace(/\/+$/, '')}/developers/requests/${encodeURIComponent(requestId)}`;

    // 1. Notify Senior Developer / Teamleads
    try {
      const [leads] = await pool.query(
        `SELECT u.id FROM user_profiles u
         LEFT JOIN user_module_roles umr ON umr.user_id = u.id AND umr.module_id = 'crms'
         LEFT JOIN roles r ON r.id = umr.role_id
         WHERE u.is_active = TRUE AND (COALESCE(r.code, u.role) IN ('Teamlead', 'SuperAdmin', 'Sales'))`,
      );
      const leadIds = leads.map(l => l.id);
      if (leadIds.length) {
        await sendUsersNotification({
          pool,
          userIds: leadIds,
          title: `New Client Change Request: ${ticketNumber}`,
          message: `New client change request submitted by ${invitation.client_representative_name} for ${invitation.client_name}. Review here: ${actionUrl}`,
          type: 'info',
          actionUrl,
          requestId,
          notificationType: 'client_request_submitted',
          details: {
            ticketNumber,
            clientName: invitation.client_name,
            requestTitle: title,
            category,
            priority,
          },
        });
      }
    } catch (e) {
      console.error('Failed to notify senior developers of client request:', e.message);
    }

    // 2. Notify Assigned Account Manager
    try {
      await sendUserNotification({
        pool,
        userId: invitation.account_manager_id,
        title: `Client Request Submitted: ${ticketNumber}`,
        message: `${invitation.client_representative_name} from ${invitation.client_name} has submitted the change request. Review here: ${actionUrl}`,
        type: 'success',
        actionUrl,
        requestId,
        notificationType: 'client_request_submitted',
        email: true,
        details: {
          ticketNumber,
          clientName: invitation.client_name,
          requestTitle: title,
        },
      });
    } catch (e) {
      console.error('Failed to notify account manager of client request:', e.message);
    }

    // 3. Notify Client Representative (SMS + Email confirmation)
    try {
      const smsText = `RIANA CIMS: Hello ${invitation.client_representative_name}, your Change Request has been received. Reference: ${ticketNumber}. Our team has begun internal assessment.`;
      await sendSms({
        to: invitation.client_representative_phone,
        message: smsText,
      });
      await recordDeliveryLog(pool, {
        eventType: 'submission_confirmation',
        recipientType: 'client',
        recipientContact: invitation.client_representative_phone,
        channel: 'sms',
        changeRequestId: requestId,
        status: 'sent',
      });
    } catch (e) {
      console.error('Failed to send client submission confirmation SMS:', e.message);
    }

    try {
      await sendEmail({
        recipientEmail: invitation.client_representative_email,
        recipientName: invitation.client_representative_name,
        notificationType: 'client_change_request_received',
        clientName: invitation.client_name,
        requestDescription: `Change Request Submission Confirmation (${ticketNumber})`,
        text: `Hello ${invitation.client_representative_name},\n\nThank you for submitting your Change Request for ${invitation.client_name}.\n\nOfficial Reference: ${ticketNumber}\nSubmission Date: ${new Date().toLocaleDateString('en-GB')}\n\nYour request has been received and entered our internal technical and commercial assessment workflow. You will receive progress updates and a formal completion report once implemented.\n\nRIANA Technologies`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #0f766e; padding: 24px; text-align: center; color: #ffffff;">
              <h2 style="margin: 0; font-size: 20px; font-weight: 600;">RIANA CIMS – Request Received</h2>
            </div>
            <div style="padding: 24px; color: #1e293b; line-height: 1.6;">
              <p style="margin-top: 0;">Hello <strong>${invitation.client_representative_name}</strong>,</p>
              <p>Your Change Request has been successfully received by RIANA Technologies.</p>
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 16px 0;">
                <p style="margin: 0; font-size: 13px; color: #64748b;">Official Reference</p>
                <p style="margin: 2px 0 12px; font-size: 18px; font-weight: 700; color: #0f766e;">${ticketNumber}</p>
                <p style="margin: 0; font-size: 13px; color: #64748b;">Title</p>
                <p style="margin: 2px 0 12px; font-size: 15px; font-weight: 600; color: #1e293b;">${title}</p>
                <p style="margin: 0; font-size: 13px; color: #64748b;">Client Scope</p>
                <p style="margin: 2px 0 0; font-size: 14px; color: #1e293b;">${invitation.client_name} (${invitation.branch_name})</p>
              </div>
              <p>Your request is now undergoing review by our technical team. You will be notified when development is complete and ready for your formal review.</p>
            </div>
            <div style="background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #64748b;">
              &copy; ${new Date().getFullYear()} RIANA Group. All rights reserved.
            </div>
          </div>
        `,
      });
      await recordDeliveryLog(pool, {
        eventType: 'submission_confirmation',
        recipientType: 'client',
        recipientContact: invitation.client_representative_email,
        channel: 'email',
        changeRequestId: requestId,
        status: 'sent',
      });
    } catch (e) {
      console.error('Failed to send client submission confirmation Email:', e.message);
    }

    return {
      success: true,
      ticket_number: ticketNumber,
      request_id: requestId,
      message: 'Your change request has been submitted successfully.',
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// -------------------------------------------------------------
// COMPLETION REPORTS
// -------------------------------------------------------------

const createOrUpdateCompletionReport = async (pool, {
  changeRequestId,
  accountManagerId,
  data,
  isDraft = false,
  user,
}) => {
  const [requests] = await pool.query(
    'SELECT * FROM crms_change_requests WHERE id = ? LIMIT 1',
    [changeRequestId],
  );
  if (!requests.length) throw Object.assign(new Error('Change request not found.'), { status: 404 });
  const request = requests[0];

  const summary = String(data.summary_of_change || '').trim();
  const solution = String(data.implemented_solution || '').trim();

  if (!isDraft) {
    if (!summary) throw Object.assign(new Error('Summary of requested change is required.'), { status: 400 });
    if (!solution) throw Object.assign(new Error('Description of implemented solution is required.'), { status: 400 });
  }

  // Get current max version number
  const [reports] = await pool.query(
    'SELECT MAX(version_number) AS max_v FROM crms_completion_reports WHERE change_request_id = ?',
    [changeRequestId],
  );
  const nextVersion = (reports[0]?.max_v || 0) + 1;

  const id = uuidv4();
  const token = generateSecureToken();
  const tokenExpiresAt = new Date(Date.now() + COMPLETION_REPORT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO crms_completion_reports (
      id, change_request_id, version_number, account_manager_id, summary_of_change, implemented_solution,
      deliverables, issues_resolved, testing_performed, implementation_date, deployment_date,
      outstanding_items, known_limitations, client_recommendations, additional_comments, attachments,
      status, acceptance_token, token_expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      changeRequestId,
      nextVersion,
      accountManagerId,
      summary,
      solution,
      data.deliverables || null,
      data.issues_resolved || null,
      data.testing_performed || null,
      data.implementation_date || null,
      data.deployment_date || null,
      data.outstanding_items || null,
      data.known_limitations || null,
      data.client_recommendations || null,
      data.additional_comments || null,
      JSON.stringify(data.attachments || []),
      isDraft ? 'draft' : 'sent',
      token,
      tokenExpiresAt,
    ],
  );

  // Mark prior reports as superseded
  await pool.query(
    "UPDATE crms_completion_reports SET status = 'superseded' WHERE change_request_id = ? AND id != ?",
    [changeRequestId, id],
  );

  await recordCrmsAudit(pool, {
    requestId: changeRequestId,
    userId: accountManagerId,
    action: 'updated',
    actionLabel: `Completion Report ${isDraft ? 'Draft Saved' : 'Prepared'} (v${nextVersion})`,
    details: `Completion report version ${nextVersion} saved by Account Manager.`,
    metadata: { version: nextVersion, isDraft },
  });

  return {
    id,
    version_number: nextVersion,
    status: isDraft ? 'draft' : 'sent',
    acceptance_token: token,
  };
};

const sendCompletionReport = async (pool, reportId, req) => {
  const [rows] = await pool.query(
    `SELECT r.*, cr.ticket_number, cr.request_title, cr.client_representative_name,
            cr.client_representative_phone, cr.client_representative_email,
            c.client_name, COALESCE(cb.branch_name, c.branch) AS branch_name,
            u.first_name AS am_first_name, u.last_name AS am_last_name
     FROM crms_completion_reports r
     JOIN crms_change_requests cr ON cr.id = r.change_request_id
     JOIN clients c ON c.id = cr.client_id
     LEFT JOIN client_branches cb ON cb.id = cr.branch_id
     JOIN user_profiles u ON u.id = r.account_manager_id
     WHERE r.id = ? LIMIT 1`,
    [reportId],
  );

  if (!rows.length) throw Object.assign(new Error('Completion report not found.'), { status: 404 });
  const report = rows[0];

  const clientPhone = report.client_representative_phone;
  const clientEmail = report.client_representative_email;
  const clientName = report.client_representative_name || 'Client Representative';
  const amName = `${report.am_first_name || ''} ${report.am_last_name || ''}`.trim() || 'Account Manager';

  const reviewUrl = `${canonicalAppUrl(req).replace(/\/+$/, '')}/change-request/review/${encodeURIComponent(report.acceptance_token)}`;

  // 1. Send SMS
  let smsStatus = 'failed';
  try {
    const smsMessage = `RIANA CIMS: Hello ${clientName}, the completion report for Change Request ${report.ticket_number} is ready for your review and acceptance. Please review here: ${reviewUrl}`;
    await sendSms({ to: clientPhone, message: smsMessage });
    smsStatus = 'sent';
    await recordDeliveryLog(pool, {
      eventType: 'completion_report',
      recipientType: 'client',
      recipientContact: clientPhone,
      channel: 'sms',
      changeRequestId: report.change_request_id,
      status: 'sent',
    });
  } catch (e) {
    console.error('Failed to send completion report SMS:', e.message);
  }

  // 2. Send Email
  let emailStatus = 'failed';
  try {
    await sendEmail({
      recipientEmail: clientEmail,
      recipientName: clientName,
      notificationType: 'change_request_completion_report',
      clientName: report.client_name,
      requestDescription: `Change Request Completion Report (${report.ticket_number})`,
      actionUrl: reviewUrl,
      actionText: 'Review and Accept Delivered Work',
      text: `Hello ${clientName},\n\nThe implementation for your Change Request (${report.ticket_number}: ${report.request_title}) is complete.\n\nAccount Manager: ${amName}\nClient: ${report.client_name} (${report.branch_name})\n\nPlease access the Completion Review Portal to review the delivered solution and provide formal electronic acceptance or request adjustments:\n${reviewUrl}\n\nRIANA Technologies`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #0f766e; padding: 24px; text-align: center; color: #ffffff;">
            <h2 style="margin: 0; font-size: 20px; font-weight: 600;">RIANA CIMS – Completion Report Ready</h2>
          </div>
          <div style="padding: 24px; color: #1e293b; line-height: 1.6;">
            <p style="margin-top: 0;">Hello <strong>${clientName}</strong>,</p>
            <p>We are pleased to inform you that your Change Request <strong>${report.ticket_number}</strong> (${report.request_title || 'Delivered Work'}) has been implemented and internally verified.</p>
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 16px 0;">
              <p style="margin: 0; font-size: 13px; color: #64748b;">Implemented Solution Summary</p>
              <p style="margin: 4px 0 12px; font-size: 14px; color: #1e293b;">${report.summary_of_change}</p>
              <p style="margin: 0; font-size: 13px; color: #64748b;">Account Manager</p>
              <p style="margin: 4px 0 0; font-size: 14px; color: #1e293b;">${amName}</p>
            </div>
            <p>Please review the full report and provide your formal electronic sign-off or request any needed adjustments:</p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${reviewUrl}" style="background-color: #0f766e; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; display: inline-block;">Review & Accept Completion</a>
            </div>
          </div>
          <div style="background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #64748b;">
            &copy; ${new Date().getFullYear()} RIANA Group. All rights reserved.
          </div>
        </div>
      `,
    });
    emailStatus = 'sent';
    await recordDeliveryLog(pool, {
      eventType: 'completion_report',
      recipientType: 'client',
      recipientContact: clientEmail,
      channel: 'email',
      changeRequestId: report.change_request_id,
      status: 'sent',
    });
  } catch (e) {
    console.error('Failed to send completion report Email:', e.message);
  }

  // Update report and request status
  await pool.query(
    "UPDATE crms_completion_reports SET status = 'sent', sent_at = NOW() WHERE id = ?",
    [report.id],
  );
  await pool.query(
    "UPDATE crms_change_requests SET status = 'awaiting_client_acceptance', acceptance_status = 'awaiting_acceptance' WHERE id = ?",
    [report.change_request_id],
  );

  await recordCrmsAudit(pool, {
    requestId: report.change_request_id,
    userId: report.account_manager_id,
    action: 'status_changed',
    actionLabel: 'Completion Report Dispatched to Client',
    details: `Completion report sent to ${clientName} (${clientEmail}, ${clientPhone}).`,
    previousValue: 'ready_for_completion_report',
    newValue: 'awaiting_client_acceptance',
  });

  return { success: true, smsStatus, emailStatus, reviewUrl };
};

const getCompletionReportForClient = async (pool, token) => {
  const [rows] = await pool.query(
    `SELECT r.*, cr.ticket_number, cr.request_title, cr.request_category, cr.change_description,
            cr.date_requested, cr.client_representative_name, cr.client_representative_phone,
            cr.client_representative_email, cr.status AS request_status, cr.acceptance_status,
            c.client_name, COALESCE(cb.branch_name, c.branch) AS branch_name, cd.department_name,
            u.first_name AS am_first_name, u.last_name AS am_last_name, u.email AS am_email, u.phone_number AS am_phone,
            (r.token_expires_at <= NOW()) AS is_expired
     FROM crms_completion_reports r
     JOIN crms_change_requests cr ON cr.id = r.change_request_id
     JOIN clients c ON c.id = cr.client_id
     LEFT JOIN client_branches cb ON cb.id = cr.branch_id
     LEFT JOIN client_departments cd ON cd.id = cr.department_id
     JOIN user_profiles u ON u.id = r.account_manager_id
     WHERE r.acceptance_token = ? LIMIT 1`,
    [token],
  );

  if (!rows.length) throw Object.assign(new Error('Completion report link was not found.'), { status: 404 });
  const report = rows[0];

  if (report.is_expired) throw Object.assign(new Error('This review link has expired. Please contact your Account Manager.'), { status: 410 });

  // Check if acceptance exists
  const [acceptances] = await pool.query(
    'SELECT id, sign_off_method, accepted_at, client_representative_name, client_representative_designation FROM crms_client_acceptances WHERE completion_report_id = ? LIMIT 1',
    [report.id],
  );

  return {
    report_id: report.id,
    change_request_id: report.change_request_id,
    ticket_number: report.ticket_number,
    request_title: report.request_title,
    request_category: report.request_category,
    original_description: report.change_description,
    date_requested: report.date_requested,
    summary_of_change: report.summary_of_change,
    implemented_solution: report.implemented_solution,
    deliverables: report.deliverables,
    issues_resolved: report.issues_resolved,
    testing_performed: report.testing_performed,
    implementation_date: report.implementation_date,
    deployment_date: report.deployment_date,
    outstanding_items: report.outstanding_items,
    known_limitations: report.known_limitations,
    client_recommendations: report.client_recommendations,
    additional_comments: report.additional_comments,
    attachments: typeof report.attachments === 'string' ? JSON.parse(report.attachments) : report.attachments || [],
    report_status: report.status,
    request_status: report.request_status,
    acceptance: acceptances[0] || null,
    client: {
      name: report.client_name,
      branch: report.branch_name,
      department: report.department_name,
    },
    representative: {
      name: report.client_representative_name,
      phone: report.client_representative_phone,
      email: report.client_representative_email,
    },
    account_manager: {
      name: `${report.am_first_name || ''} ${report.am_last_name || ''}`.trim() || 'Account Manager',
      email: report.am_email,
      phone: report.am_phone,
    },
  };
};

// -------------------------------------------------------------
// CLIENT ACTIONS (CORRECTIONS & DISPUTES)
// -------------------------------------------------------------

const handleClientAction = async (pool, { token, actionType, explanation, req }) => {
  const [rows] = await pool.query(
    `SELECT r.*, cr.ticket_number, cr.request_title, cr.account_manager_id,
            cr.client_representative_name, cr.client_representative_phone, cr.client_representative_email,
            c.client_name
     FROM crms_completion_reports r
     JOIN crms_change_requests cr ON cr.id = r.change_request_id
     JOIN clients c ON c.id = cr.client_id
     WHERE r.acceptance_token = ? LIMIT 1`,
    [token],
  );

  if (!rows.length) throw Object.assign(new Error('Report not found.'), { status: 404 });
  const report = rows[0];

  const trimmedExplanation = String(explanation || '').trim();
  if (!trimmedExplanation) throw Object.assign(new Error('A written explanation is required.'), { status: 400 });

  const isCorrection = actionType === 'correction_requested';
  const responseType = isCorrection ? 'correction_requested' : 'dispute_raised';
  const newRequestStatus = isCorrection ? 'client_requested_corrections' : 'client_disputed';
  const newReportStatus = isCorrection ? 'rejected' : 'disputed';

  const actionId = uuidv4();
  await pool.query(
    `INSERT INTO crms_client_action_responses
     (id, change_request_id, completion_report_id, response_type, written_explanation, client_representative_name, client_representative_phone, client_representative_email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      actionId,
      report.change_request_id,
      report.id,
      responseType,
      trimmedExplanation,
      report.client_representative_name,
      report.client_representative_phone,
      report.client_representative_email,
    ],
  );

  await pool.query('UPDATE crms_completion_reports SET status = ? WHERE id = ?', [newReportStatus, report.id]);
  await pool.query('UPDATE crms_change_requests SET status = ?, acceptance_status = ? WHERE id = ?', [newRequestStatus, responseType, report.change_request_id]);

  await recordCrmsAudit(pool, {
    requestId: report.change_request_id,
    action: 'status_changed',
    actionLabel: isCorrection ? 'Client Requested Corrections' : 'Client Disputed Completion Report',
    details: `Client feedback: ${trimmedExplanation}`,
    previousValue: 'awaiting_client_acceptance',
    newValue: newRequestStatus,
  });

  // Notify Account Manager and Senior Developers
  const actionUrl = `${canonicalAppUrl(req).replace(/\/+$/, '')}/developers/requests/${encodeURIComponent(report.change_request_id)}`;
  try {
    await sendUserNotification({
      pool,
      userId: report.account_manager_id,
      title: isCorrection ? `Corrections Requested: ${report.ticket_number}` : `Dispute Raised: ${report.ticket_number}`,
      message: `The client has ${isCorrection ? 'requested corrections' : 'raised a dispute'} for ${report.ticket_number}. View details: ${actionUrl}`,
      type: 'warning',
      actionUrl,
      requestId: report.change_request_id,
      notificationType: isCorrection ? 'client_correction_requested' : 'client_dispute_raised',
      email: true,
      details: {
        ticketNumber: report.ticket_number,
        explanation: trimmedExplanation,
      },
    });
  } catch (e) {
    console.error('Failed to notify account manager of client action:', e.message);
  }

  return { success: true, status: newRequestStatus };
};

// -------------------------------------------------------------
// OTP VERIFICATION & ELECTRONIC ACCEPTANCE
// -------------------------------------------------------------

const requestClientOtp = async (pool, token, channel = 'sms', req) => {
  const [reports] = await pool.query(
    `SELECT r.*, cr.ticket_number, cr.client_representative_name,
            cr.client_representative_phone, cr.client_representative_email
     FROM crms_completion_reports r
     JOIN crms_change_requests cr ON cr.id = r.change_request_id
     WHERE r.acceptance_token = ? LIMIT 1`,
    [token],
  );

  if (!reports.length) throw Object.assign(new Error('Report not found.'), { status: 404 });
  const report = reports[0];

  const target = channel === 'email' ? report.client_representative_email : report.client_representative_phone;
  if (!target) throw Object.assign(new Error(`No ${channel} on file for representative.`), { status: 400 });

  // Rate limiting check
  const [existing] = await pool.query(
    `SELECT id, resend_available_at FROM crms_client_otp_verifications
     WHERE completion_report_id = ? AND contact_target = ? AND resend_available_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [report.id, target],
  );

  if (existing.length) {
    throw Object.assign(new Error('Please wait 60 seconds before requesting another code.'), { status: 429 });
  }

  const { otp, salt, otpHash } = generateOtp();
  const id = uuidv4();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  const resendAvailableAt = new Date(Date.now() + OTP_RESEND_COOLDOWN_SECONDS * 1000);

  await pool.query(
    `INSERT INTO crms_client_otp_verifications
     (id, change_request_id, completion_report_id, contact_target, otp_hash, salt, expires_at, resend_available_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, report.change_request_id, report.id, target, otpHash, salt, expiresAt, resendAvailableAt],
  );

  if (channel === 'email') {
    await sendEmail({
      recipientEmail: target,
      recipientName: report.client_representative_name,
      notificationType: 'acceptance_otp',
      requestDescription: `Your verification code for ${report.ticket_number} is ${otp}.`,
      text: `Hello ${report.client_representative_name},\n\nYour One-Time Password to confirm completion of Change Request ${report.ticket_number} is: ${otp}\n\nThis code will expire in ${OTP_EXPIRY_MINUTES} minutes. Never share this code with anyone.\n\nRIANA Technologies`,
    });
  } else {
    await sendSms({
      to: target,
      message: `RIANA CIMS: Your verification code for Change Request ${report.ticket_number} completion acceptance is ${otp}. Valid for 10 minutes.`,
    });
  }

  return {
    success: true,
    channel,
    maskedTarget: channel === 'email' ? target.replace(/(.{2})(.*)(@.*)/, '$1***$3') : target.slice(-4).padStart(target.length, '*'),
    expiresInMinutes: OTP_EXPIRY_MINUTES,
  };
};

const verifyOtpAndAccept = async (pool, { token, code, representativeName, designation, req }) => {
  const [reports] = await pool.query(
    `SELECT r.*, cr.ticket_number, cr.account_manager_id, cr.client_representative_name,
            cr.client_representative_phone, cr.client_representative_email, c.client_name
     FROM crms_completion_reports r
     JOIN crms_change_requests cr ON cr.id = r.change_request_id
     JOIN clients c ON c.id = cr.client_id
     WHERE r.acceptance_token = ? LIMIT 1`,
    [token],
  );

  if (!reports.length) throw Object.assign(new Error('Report not found.'), { status: 404 });
  const report = reports[0];

  const [otps] = await pool.query(
    `SELECT * FROM crms_client_otp_verifications
     WHERE completion_report_id = ? AND verified_at IS NULL AND expires_at > NOW() AND attempts < max_attempts
     ORDER BY created_at DESC LIMIT 1`,
    [report.id],
  );

  if (!otps.length) {
    throw Object.assign(new Error('No active verification code found. Please request a new code.'), { status: 400 });
  }

  const otpRecord = otps[0];
  const expectedHash = hashOtp(code, otpRecord.salt);

  if (expectedHash !== otpRecord.otp_hash) {
    await pool.query('UPDATE crms_client_otp_verifications SET attempts = attempts + 1 WHERE id = ?', [otpRecord.id]);
    throw Object.assign(new Error('Invalid verification code.'), { status: 400 });
  }

  // Mark OTP verified
  await pool.query('UPDATE crms_client_otp_verifications SET verified_at = NOW() WHERE id = ?', [otpRecord.id]);

  const acceptanceId = uuidv4();
  const declarationText = 'I confirm that I have reviewed the completion report for this change request and acknowledge that the described work has been delivered to our organization. I am authorized to provide this acknowledgement on behalf of the client organization.';

  await pool.query(
    `INSERT INTO crms_client_acceptances (
      id, change_request_id, completion_report_id, client_representative_name, client_representative_designation,
      client_representative_phone, client_representative_email, sign_off_method, otp_verified_at,
      declaration_text, declaration_confirmed, ip_address, user_agent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'otp', NOW(), ?, TRUE, ?, ?)`,
    [
      acceptanceId,
      report.change_request_id,
      report.id,
      String(representativeName || report.client_representative_name).trim(),
      String(designation || 'Client Representative').trim(),
      report.client_representative_phone,
      report.client_representative_email,
      declarationText,
      req?.ip || null,
      req?.headers?.['user-agent'] || null,
    ],
  );

  await pool.query("UPDATE crms_completion_reports SET status = 'accepted' WHERE id = ?", [report.id]);
  await pool.query(
    "UPDATE crms_change_requests SET status = 'client_accepted', acceptance_status = 'accepted' WHERE id = ?",
    [report.change_request_id],
  );

  await recordCrmsAudit(pool, {
    requestId: report.change_request_id,
    action: 'status_changed',
    actionLabel: 'Client Accepted Completion via OTP',
    details: `Delivered work formally accepted by ${representativeName || report.client_representative_name} (${designation}) via verified OTP.`,
    previousValue: 'awaiting_client_acceptance',
    newValue: 'client_accepted',
    metadata: { method: 'otp', acceptanceId },
  });

  // Notify Account Manager and Senior Developer
  const actionUrl = `${canonicalAppUrl(req).replace(/\/+$/, '')}/developers/requests/${encodeURIComponent(report.change_request_id)}`;
  try {
    await sendUserNotification({
      pool,
      userId: report.account_manager_id,
      title: `Client Accepted: ${report.ticket_number}`,
      message: `${report.client_representative_name} has formally accepted the completion report for ${report.ticket_number}. Perform final closure here: ${actionUrl}`,
      type: 'success',
      actionUrl,
      requestId: report.change_request_id,
      notificationType: 'client_accepted',
      email: true,
      details: {
        ticketNumber: report.ticket_number,
        clientName: report.client_name,
      },
    });
  } catch (e) {
    console.error('Failed to notify account manager of client acceptance:', e.message);
  }

  return { success: true, message: 'Thank you! Completion accepted successfully.', acceptanceId };
};

const verifySignatureAndAccept = async (pool, { token, signaturePath, representativeName, designation, req }) => {
  const [reports] = await pool.query(
    `SELECT r.*, cr.ticket_number, cr.account_manager_id, cr.client_representative_name,
            cr.client_representative_phone, cr.client_representative_email, c.client_name
     FROM crms_completion_reports r
     JOIN crms_change_requests cr ON cr.id = r.change_request_id
     JOIN clients c ON c.id = cr.client_id
     WHERE r.acceptance_token = ? LIMIT 1`,
    [token],
  );

  if (!reports.length) throw Object.assign(new Error('Report not found.'), { status: 404 });
  const report = reports[0];

  if (!signaturePath) throw Object.assign(new Error('Signature image upload is required.'), { status: 400 });
  if (!representativeName) throw Object.assign(new Error('Representative full name is required.'), { status: 400 });
  if (!designation) throw Object.assign(new Error('Designation / position is required.'), { status: 400 });

  const acceptanceId = uuidv4();
  const declarationText = 'I confirm that I have reviewed the completion report for this change request and acknowledge that the described work has been delivered to our organization. I am authorized to provide this acknowledgement on behalf of the client organization.';

  await pool.query(
    `INSERT INTO crms_client_acceptances (
      id, change_request_id, completion_report_id, client_representative_name, client_representative_designation,
      client_representative_phone, client_representative_email, sign_off_method, signature_image_path,
      declaration_text, declaration_confirmed, ip_address, user_agent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'signature', ?, ?, TRUE, ?, ?)`,
    [
      acceptanceId,
      report.change_request_id,
      report.id,
      String(representativeName).trim(),
      String(designation).trim(),
      report.client_representative_phone,
      report.client_representative_email,
      signaturePath,
      declarationText,
      req?.ip || null,
      req?.headers?.['user-agent'] || null,
    ],
  );

  await pool.query("UPDATE crms_completion_reports SET status = 'accepted' WHERE id = ?", [report.id]);
  await pool.query(
    "UPDATE crms_change_requests SET status = 'client_accepted', acceptance_status = 'accepted' WHERE id = ?",
    [report.change_request_id],
  );

  await recordCrmsAudit(pool, {
    requestId: report.change_request_id,
    action: 'status_changed',
    actionLabel: 'Client Accepted Completion via Signature',
    details: `Delivered work formally accepted with uploaded signature by ${representativeName} (${designation}).`,
    previousValue: 'awaiting_client_acceptance',
    newValue: 'client_accepted',
    metadata: { method: 'signature', acceptanceId, signaturePath },
  });

  // Notify Account Manager
  const actionUrl = `${canonicalAppUrl(req).replace(/\/+$/, '')}/developers/requests/${encodeURIComponent(report.change_request_id)}`;
  try {
    await sendUserNotification({
      pool,
      userId: report.account_manager_id,
      title: `Client Accepted: ${report.ticket_number}`,
      message: `${representativeName} has signed and accepted completion of ${report.ticket_number}. Perform final closure here: ${actionUrl}`,
      type: 'success',
      actionUrl,
      requestId: report.change_request_id,
      notificationType: 'client_accepted',
      email: true,
      details: {
        ticketNumber: report.ticket_number,
        clientName: report.client_name,
      },
    });
  } catch (e) {
    console.error('Failed to notify account manager of signature acceptance:', e.message);
  }

  return { success: true, message: 'Thank you! Completion accepted with signature.', acceptanceId };
};

// -------------------------------------------------------------
// FINAL REQUEST CLOSURE
// -------------------------------------------------------------

const closeChangeRequest = async (pool, { changeRequestId, accountManagerId, closureNotes, user }) => {
  const [requests] = await pool.query(
    `SELECT cr.*, c.client_name FROM crms_change_requests cr
     JOIN clients c ON c.id = cr.client_id
     WHERE cr.id = ? LIMIT 1`,
    [changeRequestId],
  );

  if (!requests.length) throw Object.assign(new Error('Change request not found.'), { status: 404 });
  const request = requests[0];

  if (request.status === 'closed_client_accepted') {
    throw Object.assign(new Error('Request has already been closed.'), { status: 400 });
  }

  // Verification 1: Client acceptance must exist
  const [acceptances] = await pool.query(
    'SELECT * FROM crms_client_acceptances WHERE change_request_id = ? ORDER BY accepted_at DESC LIMIT 1',
    [changeRequestId],
  );
  if (!acceptances.length) {
    throw Object.assign(new Error('Cannot close request: Formal client acceptance has not been recorded.'), { status: 400 });
  }

  // Verification 2: No unresolved disputes or corrections
  const [unresolved] = await pool.query(
    'SELECT id FROM crms_client_action_responses WHERE change_request_id = ? AND resolved = FALSE LIMIT 1',
    [changeRequestId],
  );
  if (unresolved.length) {
    throw Object.assign(new Error('Cannot close request: There are unresolved client corrections or disputes pending.'), { status: 400 });
  }

  const closureId = uuidv4();
  await pool.query(
    `INSERT INTO crms_request_closures (id, change_request_id, account_manager_id, acceptance_id, closure_notes)
     VALUES (?, ?, ?, ?, ?)`,
    [closureId, changeRequestId, accountManagerId, acceptances[0].id, closureNotes || null],
  );

  await pool.query(
    "UPDATE crms_change_requests SET status = 'closed_client_accepted', acceptance_status = 'closed', completion_date = CURDATE() WHERE id = ?",
    [changeRequestId],
  );

  await recordCrmsAudit(pool, {
    requestId: changeRequestId,
    userId: accountManagerId,
    action: 'status_changed',
    actionLabel: 'Change Request Closed (Client Accepted)',
    details: `Verified client acceptance and closed by Account Manager. Closure notes: ${closureNotes || 'None'}`,
    previousValue: request.status,
    newValue: 'closed_client_accepted',
    metadata: { closureId, acceptanceId: acceptances[0].id },
  });

  return { success: true, message: `Change Request ${request.ticket_number} successfully closed.`, closureId };
};

module.exports = {
  createInvitation,
  sendInvitation,
  cancelInvitation,
  getInvitationForClient,
  submitClientChangeRequest,
  createOrUpdateCompletionReport,
  sendCompletionReport,
  getCompletionReportForClient,
  handleClientAction,
  requestClientOtp,
  verifyOtpAndAccept,
  verifySignatureAndAccept,
  closeChangeRequest,
};
