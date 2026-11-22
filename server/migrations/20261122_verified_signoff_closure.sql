-- Reconcile historical verified sign-offs only; leave incomplete or disputed work open.
DELIMITER $$
DROP PROCEDURE IF EXISTS riana_close_verified_signoffs $$
CREATE PROCEDURE riana_close_verified_signoffs()
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  START TRANSACTION;
  INSERT INTO crms_request_closures (id, change_request_id, account_manager_id, acceptance_id, closure_notes)
  SELECT UUID(), cr.id, COALESCE(cr.account_manager_id, r.account_manager_id), a.id,
    'Closed by verified-signoff reconciliation 20261122.'
  FROM crms_change_requests cr
  JOIN crms_completion_reports r ON r.change_request_id COLLATE utf8mb4_unicode_ci = cr.id COLLATE utf8mb4_unicode_ci
  JOIN crms_client_acceptances a ON a.completion_report_id COLLATE utf8mb4_unicode_ci = r.id COLLATE utf8mb4_unicode_ci
  LEFT JOIN crms_request_closures existing ON existing.change_request_id COLLATE utf8mb4_unicode_ci = cr.id COLLATE utf8mb4_unicode_ci
  WHERE cr.status = 'client_accepted' AND r.status = 'accepted' AND a.declaration_confirmed = TRUE
    AND COALESCE(cr.account_manager_id, r.account_manager_id) IS NOT NULL AND existing.id IS NULL
    AND ((a.sign_off_method = 'otp' AND a.otp_verified_at IS NOT NULL)
      OR (a.sign_off_method = 'signature' AND a.signature_image_path IS NOT NULL AND a.signature_image_path <> ''))
    AND NOT EXISTS (SELECT 1 FROM crms_completion_reports newer WHERE newer.change_request_id COLLATE utf8mb4_unicode_ci = cr.id COLLATE utf8mb4_unicode_ci AND newer.version_number > r.version_number)
    AND NOT EXISTS (SELECT 1 FROM crms_client_action_responses response WHERE response.change_request_id COLLATE utf8mb4_unicode_ci = cr.id COLLATE utf8mb4_unicode_ci AND response.resolved = FALSE);

  INSERT INTO crms_audit_logs (id, request_id, action, action_label, details, previous_value, new_value)
  SELECT UUID(), cr.id, 'status_changed', 'Verified Client Sign-off Reconciled',
    'Existing verified client acceptance reconciled to closed; no acceptance evidence changed.', 'client_accepted', 'closed_client_accepted'
  FROM crms_change_requests cr
  JOIN crms_request_closures closure ON closure.change_request_id COLLATE utf8mb4_unicode_ci = cr.id COLLATE utf8mb4_unicode_ci
  WHERE cr.status = 'client_accepted' AND closure.closure_notes = 'Closed by verified-signoff reconciliation 20261122.';

  UPDATE crms_change_requests cr
  JOIN crms_request_closures closure ON closure.change_request_id COLLATE utf8mb4_unicode_ci = cr.id COLLATE utf8mb4_unicode_ci
  JOIN crms_client_acceptances a ON a.id COLLATE utf8mb4_unicode_ci = closure.acceptance_id COLLATE utf8mb4_unicode_ci
  SET cr.status = 'closed_client_accepted', cr.acceptance_status = 'closed', cr.completion_date = COALESCE(cr.completion_date, DATE(a.accepted_at))
  WHERE cr.status = 'client_accepted' AND closure.closure_notes = 'Closed by verified-signoff reconciliation 20261122.';

  INSERT INTO migration_history (migration_id, description)
  VALUES ('20261122_verified_signoff_closure', 'Close existing verified and undisputed client sign-offs with audit history')
  ON DUPLICATE KEY UPDATE description = VALUES(description);
  COMMIT;
END $$
DELIMITER ;
CALL riana_close_verified_signoffs();
DROP PROCEDURE IF EXISTS riana_close_verified_signoffs;
