-- Non-destructive rollback: retain technician budgets and audit evidence.
-- Application rollback should stop using the new endpoints and continue reading legacy rows.
-- Destructive table/column removal requires a separately approved retention and backup procedure.
SELECT 'No destructive rollback executed. Technician budget history is retained.' AS rollback_status;
