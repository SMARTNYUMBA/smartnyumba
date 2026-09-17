USE smartnyumba;
INSERT IGNORE INTO settings (setting_key, setting_value, description) VALUES
('whatsapp_enabled', '0', 'Enable WhatsApp notifications via Africa''s Talking'),
('owner_report_email', '1', 'Send monthly report to property owners'),
('smtp_from_name', 'SmartNyumba RMS', 'Email sender name');
SELECT 'Migration v5b done' AS status;
