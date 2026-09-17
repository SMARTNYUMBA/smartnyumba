
USE smartnyumba;

-- Ensure tenants table has emergency columns
ALTER TABLE tenants 
  ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(150) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS emergency_phone   VARCHAR(20)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS passport_number   VARCHAR(30)  DEFAULT NULL;

-- Ensure users has profile_photo and passport
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_photo    VARCHAR(300) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS passport_number  VARCHAR(30)  DEFAULT NULL;

-- Fix dashboard: ensure the properties table has the right columns
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS owner_id          INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS management_fee_pct DECIMAL(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manager_id        INT DEFAULT NULL;

-- Verify data integrity  
SELECT 
  (SELECT COUNT(*) FROM units)      AS units,
  (SELECT COUNT(*) FROM tenancies WHERE status='active') AS active_tenancies,
  (SELECT COUNT(*) FROM properties) AS properties,
  (SELECT COUNT(*) FROM tenants)    AS tenants,
  (SELECT COUNT(*) FROM invoices)   AS invoices,
  (SELECT COUNT(*) FROM payments)   AS payments
AS status;
