# RIANA CIMS MySQL host database

`riana_cims_host.sql` contains the complete MySQL schema used by both RIANA CIMS and the Developers workspace. It includes safe reference rows for departments, subsidiaries, and feedback questions.

It intentionally excludes live passwords, reset tokens, customer contacts, messages, audit logs, and operational records. Those belong in encrypted production backups, not Git.

Restore with `mysql -u riana_cims -p < riana_cims_host.sql`, then run `npm run db:optimize` and `npm run db:verify-unified`.
