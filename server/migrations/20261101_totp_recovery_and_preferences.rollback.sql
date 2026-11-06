UPDATE user_profiles SET two_factor_enabled=FALSE,two_factor_method='email',two_factor_phone=NULL WHERE two_factor_method='totp';
DROP TABLE IF EXISTS auth_mfa_login_challenges;
DROP TABLE IF EXISTS user_mfa_recovery_codes;
DROP TABLE IF EXISTS user_totp_credentials;
DROP TABLE IF EXISTS user_interface_preferences;
DROP TABLE IF EXISTS user_session_locks;
DROP TABLE IF EXISTS user_identity_change_requests;
ALTER TABLE user_profiles MODIFY two_factor_method ENUM('email','sms','call') NOT NULL DEFAULT 'email';
DELETE FROM migration_history WHERE migration_id='20261101_totp_recovery_and_preferences';
