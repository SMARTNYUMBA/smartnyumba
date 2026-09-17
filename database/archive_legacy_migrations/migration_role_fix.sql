
USE smartnyumba;
-- Ensure owner role exists in users table enum
ALTER TABLE users MODIFY COLUMN role ENUM('super_admin','property_manager','tenant','caretaker','security','owner') NOT NULL DEFAULT 'tenant';
-- Ensure properties table has owner_id column
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_id INT DEFAULT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS management_fee_pct DECIMAL(5,2) DEFAULT 0;
SELECT 'Role fix complete' AS status;
