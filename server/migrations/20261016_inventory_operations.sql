-- Additive update. Variant deletion retains a tombstone so seed replay cannot restore it.
DELIMITER $$
DROP PROCEDURE IF EXISTS cims_inventory_operations_upgrade$$
CREATE PROCEDURE cims_inventory_operations_upgrade()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
        AND TABLE_NAME='hardware_variants' AND COLUMN_NAME='deleted_at') THEN
        ALTER TABLE hardware_variants ADD COLUMN deleted_at DATETIME NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()
        AND TABLE_NAME='uploaded_files' AND INDEX_NAME='idx_handover_identity') THEN
        ALTER TABLE uploaded_files ADD INDEX idx_handover_identity
            (related_entity_type,related_entity_id,file_category,checksum_sha256);
    END IF;
END$$
CALL cims_inventory_operations_upgrade()$$
DROP PROCEDURE cims_inventory_operations_upgrade$$
DELIMITER ;
