-- Non-destructive rollback: retain every issued serial, identity, assignment and snapshot.
-- Also set HARDWARE_INVENTORY_ENABLED=false and restart the API.
UPDATE hardware_policy SET issuance_approved=FALSE WHERE id=1;
-- Do not narrow user_profiles.role while InventoryOfficer accounts exist.
-- Do not drop the hardware tables or reset hardware_sequences.
