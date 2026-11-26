-- Seed the catalogue entry required by the existing CRMS User assignment path.
INSERT INTO roles (id,module_id,code,name) VALUES ('crms:User','crms','User','User')
ON DUPLICATE KEY UPDATE name=VALUES(name);
