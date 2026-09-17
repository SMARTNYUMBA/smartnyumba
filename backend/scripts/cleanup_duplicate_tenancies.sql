-- ============================================================
-- CLEANUP: Duplicate tenancies for same tenant
-- Run this ONCE to fix existing bad data.
-- ============================================================

-- Step 1: View what will be cleaned (run SELECT first to verify)
SELECT 
  ten.id,
  u.full_name,
  un.unit_number,
  pr.name AS property_name,
  ten.rent_amount,
  ten.start_date,
  ten.status
FROM tenancies ten
JOIN tenants t ON ten.tenant_id = t.id
JOIN users u ON t.user_id = u.id
JOIN units un ON ten.unit_id = un.id
JOIN properties pr ON un.property_id = pr.id
WHERE ten.status = 'active'
ORDER BY u.full_name, ten.start_date DESC;

-- Step 2: For each tenant with multiple active tenancies,
-- keep only the LATEST one (highest id), terminate the rest.
-- 
-- IMPORTANT: Review the SELECT above before running this UPDATE.
-- Comment out the SELECT and uncomment the UPDATE when ready.

/*
UPDATE tenancies ten
JOIN (
  SELECT tenant_id, MAX(id) AS keep_id
  FROM tenancies
  WHERE status = 'active'
  GROUP BY tenant_id
  HAVING COUNT(*) > 1
) keep_set ON ten.tenant_id = keep_set.tenant_id AND ten.id != keep_set.keep_id
SET ten.status = 'terminated', ten.end_date = CURDATE()
WHERE ten.status = 'active';

-- Step 3: Free up units that were marked occupied by terminated tenancies
UPDATE units u
SET u.status = 'vacant'
WHERE u.status = 'occupied'
AND NOT EXISTS (
  SELECT 1 FROM tenancies ten
  WHERE ten.unit_id = u.id AND ten.status = 'active'
);
*/
