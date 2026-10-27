-- Component of the reviewed cloud patch, not a standalone migration.
-- This preflight preserves existing role enum values and never changes upload paths.
DELIMITER $$
DROP PROCEDURE IF EXISTS cims_inventory_patch_preflight$$
CREATE PROCEDURE cims_inventory_patch_preflight()
BEGIN
    DECLARE missing_tables INT DEFAULT 0;
    DECLARE incompatible_keys INT DEFAULT 0;
    DECLARE missing_assignment_columns INT DEFAULT 0;
    DECLARE role_type TEXT;
    DECLARE role_default TEXT;
    DECLARE role_nullable VARCHAR(3);

    SELECT 7 - COUNT(*) INTO missing_tables
      FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN (
           'subsidiaries', 'user_profiles', 'clients', 'installations',
           'uploaded_files', 'uploaded_file_variants', 'client_assignments'
       );
    IF missing_tables <> 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Required CIMS tables are missing. Apply base, assignment and private-file migrations first.';
    END IF;

    SELECT 13 - COUNT(*) INTO missing_assignment_columns
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND (
           (TABLE_NAME = 'installations' AND COLUMN_NAME IN (
               'client_id', 'branch_id', 'department_id', 'assigned_technician_id',
               'hardware_technician_id', 'software_technician_id'
           )) OR
           (TABLE_NAME = 'client_assignments' AND COLUMN_NAME IN (
               'installation_id', 'client_id', 'branch_id', 'department_id',
               'hardware_technician_id', 'software_technician_id', 'branch'
           ))
       );
    IF missing_assignment_columns <> 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Assignment scope columns are missing. Apply the client branch/department migrations first.';
    END IF;

    SELECT COUNT(*) INTO incompatible_keys
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN ('subsidiaries', 'user_profiles', 'clients', 'installations')
       AND COLUMN_NAME = 'id'
       AND (COLUMN_TYPE <> 'varchar(36)' OR COLLATION_NAME <> 'utf8mb4_unicode_ci');
    IF incompatible_keys <> 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Parent ID types/collations differ. Review foreign keys before applying the hardware schema.';
    END IF;

    SELECT COLUMN_TYPE, COLUMN_DEFAULT, IS_NULLABLE INTO role_type,role_default,role_nullable
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'user_profiles' AND COLUMN_NAME = 'role';
    IF role_type NOT LIKE 'enum(%' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User roles are not ENUM; manual compatibility review is required.';
    END IF;
    IF LOCATE('''InventoryOfficer''', role_type) = 0 THEN
        SET @cims_role_ddl = CONCAT(
            'ALTER TABLE user_profiles MODIFY role ',
            LEFT(role_type, LENGTH(role_type) - 1),
            ',''InventoryOfficer'')',
            IF(role_nullable='YES',' NULL',' NOT NULL'),
            IF(role_default IS NULL,'',CONCAT(' DEFAULT ',IF(LOCATE('MariaDB',VERSION())>0,role_default,QUOTE(role_default))))
        );
        PREPARE cims_role_statement FROM @cims_role_ddl;
        EXECUTE cims_role_statement;
        DEALLOCATE PREPARE cims_role_statement;
    END IF;
END$$
CALL cims_inventory_patch_preflight()$$
DROP PROCEDURE cims_inventory_patch_preflight$$
DELIMITER ;
