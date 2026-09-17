USE smartnyumba;
-- Insert all required settings
INSERT IGNORE INTO settings (setting_key, setting_value, description) VALUES
('mpesa_enabled',     '1', 'Enable M-Pesa STK push payments'),
('sms_enabled',       '0', 'Enable SMS notifications via Africa''s Talking'),
('auto_late_fees',    '1', 'Auto apply late fees after grace period'),
('late_fees_enabled', '1', 'Enable late fee calculation'),
('late_fee_percent',  '5', 'Late fee percentage'),
('grace_period_days', '5', 'Grace period before late fee applies'),
('auto_invoice_day',  '1', 'Day of month to auto-generate invoices'),
('currency',          'KES', 'System currency'),
('water_rate',        '80', 'Water rate per unit (KES)'),
('electricity_rate',  '120', 'Electricity rate per unit (KES)'),
('system_name',       'SmartNyumba Rental Management System', 'System name'),
('whatsapp_enabled',  '0', 'Enable WhatsApp notifications');

SELECT 'Settings fix complete' AS status;
