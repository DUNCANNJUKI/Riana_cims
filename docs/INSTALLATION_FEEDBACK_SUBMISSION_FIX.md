# Installation Feedback Submission Fix

## Confirmed model mismatch

The public form loads active questions from feedback_questions and submits answers in
dynamic_responses, keyed by stable question IDs. The verified fixed mappings are:

| Stable question ID | Rating scale | Legacy column |
| --- | --- | --- |
| q1 | 1-5 | installation_quality_rating |
| q2 | 1-5 | installation_timeliness_rating |
| q3 | 1-5 | installation_communication_rating |
| q4 | 1-5 | technician_knowledge_rating |
| q5 | 0-10 | recommendation_score |

There are no authoritative active questions for technician_professionalism_rating or
technician_helpfulness_rating. Values must not be inferred from display text, question
order, another response, or a database default.

The production-shaped schema requires all six legacy rating columns and previously had no
defaults. The public endpoint omitted them, which caused MySQL to reject the INSERT. A
temporary DEFAULT 0 workaround permits incomplete INSERTs but stores zero even though the
star-rating form only permits 1-5.

## Code correction

POST /api/public/installation-feedback now validates every active dynamic rating and NPS
response against its configured type, maps only q1-q4 to verified legacy columns, derives
the summary scores from q1 and q5, preserves text and dynamic responses, and explicitly
persists NULL for legacy ratings that the form does not collect.

The endpoint continues to use the existing feedback-token checks, row lock, transaction,
duplicate prevention, parameterized SQL, response contract, and thank-you notification.

## Approved database migration

The approved migration is:

- server/migrations/20261030_installation_feedback_rating_nullability.sql
- server/migrations/20261030_installation_feedback_rating_nullability.rollback.sql
- hosting/Mysql_host/live_updates/20261030_installation_feedback_rating_nullability.sql

Apply it only after a verified backup. The application correction requires the legacy
columns to permit legitimate missing responses and must not depend on artificial defaults.

    ALTER TABLE installation_feedback
      MODIFY installation_quality_rating INT NULL DEFAULT NULL,
      MODIFY installation_timeliness_rating INT NULL DEFAULT NULL,
      MODIFY installation_communication_rating INT NULL DEFAULT NULL,
      MODIFY technician_knowledge_rating INT NULL DEFAULT NULL,
      MODIFY technician_professionalism_rating INT NULL DEFAULT NULL,
      MODIFY technician_helpfulness_rating INT NULL DEFAULT NULL;

Rollback, only if every row has non-null values:

    ALTER TABLE installation_feedback
      MODIFY installation_quality_rating INT NOT NULL,
      MODIFY installation_timeliness_rating INT NOT NULL,
      MODIFY installation_communication_rating INT NOT NULL,
      MODIFY technician_knowledge_rating INT NOT NULL,
      MODIFY technician_professionalism_rating INT NOT NULL,
      MODIFY technician_helpfulness_rating INT NOT NULL;

## Existing zero-valued records

The read-only investigation found four records with zero in all six legacy columns. Each
record retains valid q1-q4 values in dynamic_responses, so those four values are recoverable.
Professionalism and helpfulness are not recoverable from the current form. No historical
data was changed. Any repair must be separately approved and must update only values
supported by the stored dynamic responses.

## Applied verification

On 2026-10-30, a fresh 72-table database backup was created and verified before the
approved migration was applied to the configured database. All six legacy rating columns
were confirmed nullable with no defaults, and the migration-history entry was recorded.

A rollback-contained persistence test saved q1-q4 as 1, 2, 3, and 4, preserved an explicit
NPS score of 0 and the submitted text/dynamic responses, stored the two uncollected legacy
ratings as NULL, and left zero test rows after rollback.

## Deployment and verification

1. Back up and verify the production database.
2. Apply the approved nullable-column migration.
3. Deploy server/index.js and server/services/installationFeedback.js.
4. Restart the API process; no frontend rebuild is required.
5. Submit controlled feedback covering 1-5 ratings, NPS 0 and 10, and text.
6. Confirm q1-q4, summaries, text, and dynamic_responses match the request exactly.
7. Confirm uncollected legacy ratings are NULL, not zero.
8. Confirm invalid, expired, mismatched, and duplicate links retain their existing responses.
9. Confirm feedback dashboards and exports still load.

To roll back the application, restore the previous two backend files and restart the API.
Do not restore NOT NULL constraints until a preflight query confirms there are no nulls.
