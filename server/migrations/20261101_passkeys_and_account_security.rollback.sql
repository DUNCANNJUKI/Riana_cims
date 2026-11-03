DROP TABLE IF EXISTS webauthn_challenges;
DROP TABLE IF EXISTS webauthn_credentials;
DELETE FROM migration_history WHERE migration_id='20261101_passkeys_and_account_security';
