-- Additive hybrid equipment storage. Existing built-in columns remain unchanged.
DELIMITER $$
DROP PROCEDURE IF EXISTS cims_add_hybrid_equipment$$
CREATE PROCEDURE cims_add_hybrid_equipment()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='installations'
          AND COLUMN_NAME='equipment_quantities'
    ) THEN
        ALTER TABLE installations ADD COLUMN equipment_quantities JSON NULL;
    END IF;
END$$
CALL cims_add_hybrid_equipment()$$
DROP PROCEDURE cims_add_hybrid_equipment$$
DELIMITER ;
