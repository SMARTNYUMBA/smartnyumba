-- Smart Nyumba Pro — Seed Data
USE smartnyumba;

-- ── DEMO USERS (passwords set by setup.php) ──────────────────
-- All passwords will be: Admin@123 (admin), Manager@123, Tenant@123, Staff@123
INSERT INTO users (full_name, email, phone, password_hash, role) VALUES
('System Administrator', 'admin@smartnyumba.com',    '0700000001', 'PENDING', 'super_admin'),
('James Kariuki',        'manager@smartnyumba.com',  '0711000002', 'PENDING', 'property_manager'),
('Alice Wanjiku',        'alice@smartnyumba.com',    '0722111001', 'PENDING', 'tenant'),
('Bob Otieno',           'bob@smartnyumba.com',      '0733222002', 'PENDING', 'tenant'),
('Carol Muthoni',        'carol@smartnyumba.com',    '0744333003', 'PENDING', 'tenant'),
('David Njoroge',        'caretaker@smartnyumba.com','0755444004', 'PENDING', 'caretaker'),
('Grace Akinyi',         'security@smartnyumba.com', '0766555005', 'PENDING', 'security');

-- ── SAMPLE PROPERTY ──────────────────────────────────────────
INSERT INTO properties (name, location, address, description, manager_id)
SELECT 'Westlands Heights Estate', 'Westlands, Nairobi',
  'Along Waiyaki Way, Westlands, Nairobi',
  'Modern residential estate with 20 units across 2 blocks. Swimming pool, gym and 24hr security.',
  id FROM users WHERE email='manager@smartnyumba.com' LIMIT 1;

INSERT INTO properties (name, location, address, description, manager_id)
SELECT 'Kilimani Gardens', 'Kilimani, Nairobi',
  'Off Argwings Kodhek Road, Kilimani',
  'Premium apartments in a prime Kilimani location. 12 units.',
  id FROM users WHERE email='manager@smartnyumba.com' LIMIT 1;

-- ── UNITS ────────────────────────────────────────────────────
INSERT INTO units (property_id, unit_number, floor, type, rent_amount, deposit_amount, status)
SELECT p.id, u.unit_number, u.floor, u.type, u.rent, u.deposit, u.status
FROM properties p
CROSS JOIN (
  SELECT 'A1' unit_number, 1 floor, 'one_bedroom'  type, 12000 rent, 24000 deposit, 'occupied' status UNION
  SELECT 'A2', 1, 'one_bedroom',   12000, 24000, 'occupied'  UNION
  SELECT 'A3', 1, 'two_bedroom',   18000, 36000, 'vacant'    UNION
  SELECT 'A4', 1, 'bedsitter',      8000, 16000, 'occupied'  UNION
  SELECT 'B1', 2, 'one_bedroom',   13000, 26000, 'occupied'  UNION
  SELECT 'B2', 2, 'two_bedroom',   19000, 38000, 'vacant'    UNION
  SELECT 'B3', 2, 'one_bedroom',   13000, 26000, 'vacant'    UNION
  SELECT 'B4', 2, 'penthouse',     35000, 70000, 'occupied'
) u WHERE p.name = 'Westlands Heights Estate';

INSERT INTO units (property_id, unit_number, floor, type, rent_amount, deposit_amount, status)
SELECT p.id, u.unit_number, u.floor, u.type, u.rent, u.deposit, u.status
FROM properties p
CROSS JOIN (
  SELECT 'C1' unit_number, 1 floor, 'one_bedroom' type, 15000 rent, 30000 deposit, 'occupied' status UNION
  SELECT 'C2', 1, 'two_bedroom',  22000, 44000, 'occupied' UNION
  SELECT 'C3', 1, 'studio',        9000, 18000, 'vacant'   UNION
  SELECT 'C4', 2, 'one_bedroom',  15000, 30000, 'occupied'
) u WHERE p.name = 'Kilimani Gardens';

-- ── TENANT PROFILES ──────────────────────────────────────────
INSERT INTO tenants (user_id, id_number, vehicle_plate)
SELECT id, CONCAT('ID', LPAD(id*1000+1234, 8,'0')), NULL FROM users WHERE role='tenant';

-- ── TENANCIES ────────────────────────────────────────────────
INSERT INTO tenancies (tenant_id, unit_id, start_date, rent_amount, deposit, status)
SELECT t.id, u.id, '2025-01-01', u.rent_amount, u.deposit_amount, 'active'
FROM tenants t
JOIN users usr ON t.user_id = usr.id AND usr.email = 'alice@smartnyumba.com'
JOIN units u ON u.unit_number = 'A1'
JOIN properties p ON u.property_id = p.id AND p.name = 'Westlands Heights Estate';

INSERT INTO tenancies (tenant_id, unit_id, start_date, rent_amount, deposit, status)
SELECT t.id, u.id, '2025-02-01', u.rent_amount, u.deposit_amount, 'active'
FROM tenants t
JOIN users usr ON t.user_id = usr.id AND usr.email = 'bob@smartnyumba.com'
JOIN units u ON u.unit_number = 'A2'
JOIN properties p ON u.property_id = p.id AND p.name = 'Westlands Heights Estate';

INSERT INTO tenancies (tenant_id, unit_id, start_date, rent_amount, deposit, status)
SELECT t.id, u.id, '2025-03-01', u.rent_amount, u.deposit_amount, 'active'
FROM tenants t
JOIN users usr ON t.user_id = usr.id AND usr.email = 'carol@smartnyumba.com'
JOIN units u ON u.unit_number = 'C1'
JOIN properties p ON u.property_id = p.id AND p.name = 'Kilimani Gardens';

-- ── SAMPLE INVOICES ───────────────────────────────────────────
INSERT INTO invoices (tenancy_id, type, amount, balance, due_date, status, month_year)
SELECT ten.id, 'rent', ten.rent_amount, ten.rent_amount, DATE_FORMAT(CURDATE(),'%Y-%m-01'), 'unpaid', DATE_FORMAT(CURDATE(),'%Y-%m')
FROM tenancies ten WHERE ten.status='active';

-- ── PARKING SLOTS ─────────────────────────────────────────────
INSERT INTO parking_slots (property_id, slot_number, type, status)
SELECT p.id, CONCAT('P', n.n),
  CASE WHEN n.n <= 8 THEN 'resident' ELSE 'visitor' END,
  CASE WHEN n.n IN (1,2,5) THEN 'occupied' ELSE 'vacant' END
FROM properties p
CROSS JOIN (
  SELECT 1 n UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
  UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8
  UNION SELECT 9 UNION SELECT 10
) n WHERE p.name = 'Westlands Heights Estate';

-- ── SAMPLE MAINTENANCE ────────────────────────────────────────
INSERT INTO maintenance_requests (unit_id, property_id, title, description, category, priority, status)
SELECT u.id, u.property_id, 'Leaking tap in kitchen', 'The kitchen tap drips continuously', 'plumbing', 'normal', 'open'
FROM units u WHERE u.unit_number='A1' LIMIT 1;

INSERT INTO maintenance_requests (unit_id, property_id, title, description, category, priority, status)
SELECT u.id, u.property_id, 'Broken window latch', 'Bedroom window does not lock properly — security concern', 'structural', 'urgent', 'open'
FROM units u WHERE u.unit_number='B4' LIMIT 1;

-- ── SAMPLE ANNOUNCEMENT ───────────────────────────────────────
INSERT INTO announcements (property_id, title, message, priority, created_by)
SELECT p.id, 'Water supply interruption notice',
  'There will be a scheduled water supply interruption on Saturday from 8:00 AM to 2:00 PM for routine maintenance. Please store adequate water in advance. We apologize for the inconvenience.',
  'important', u.id
FROM properties p, users u WHERE p.name='Westlands Heights Estate' AND u.role='super_admin' LIMIT 1;

-- ── SAMPLE EXPENSES ───────────────────────────────────────────
INSERT INTO expenses (property_id, title, amount, category, vendor, expense_date, created_by)
SELECT p.id, 'Monthly security guard salaries', 45000, 'security', 'Internal', DATE_FORMAT(CURDATE(),'%Y-%m-01'), u.id
FROM properties p, users u WHERE p.name='Westlands Heights Estate' AND u.role='super_admin' LIMIT 1;

INSERT INTO expenses (property_id, title, amount, category, vendor, expense_date, created_by)
SELECT p.id, 'Plumber — Block A roof repair', 8500, 'plumbing', 'Njoro Plumbers Ltd', DATE_FORMAT(CURDATE(),'%Y-%m-05'), u.id
FROM properties p, users u WHERE p.name='Westlands Heights Estate' AND u.role='super_admin' LIMIT 1;

SELECT 'Seed data inserted successfully!' AS status;
