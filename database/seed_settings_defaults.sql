-- ============================================================
--  SmartNyumba Pro — Settings Defaults Patch
--  Run after schema.sql to ensure all features have defaults.
--  Uses INSERT IGNORE so existing values are never overwritten.
--
--  Usage: mysql -u root -p smartnyumba < seed_settings_defaults.sql
-- ============================================================

INSERT IGNORE INTO settings (setting_key, setting_value) VALUES

-- ── Already in schema (repeated here for completeness) ────────
  ('system_name',               'Smart Nyumba Pro'),
  ('currency',                  'KES'),
  ('timezone',                  'Africa/Nairobi'),
  ('auto_invoice_day',          '1'),
  ('late_fees_enabled',         '0'),
  ('late_fee_percent',          '5'),
  ('grace_period_days',         '5'),
  ('mpesa_enabled',             '0'),
  ('mpesa_stk_enabled',         '0'),
  ('sms_enabled',               '0'),
  ('email_enabled',             '0'),
  ('whatsapp_enabled',          '0'),
  ('water_rate',                '0'),
  ('electricity_rate',          '0'),

-- ── Notifications ─────────────────────────────────────────────
  ('sms_reminders_enabled',     '0'),
  ('whatsapp_reminders_enabled','0'),
  ('email_reminders_enabled',   '0'),
  ('reminder_days_before',      '3'),

-- ── Billing ───────────────────────────────────────────────────
  ('default_payment_terms',     '30'),
  ('invoice_notes_default',     ''),
  ('show_balance_on_receipt',   '1'),
  ('deposit_required',          '1'),

-- ── M-Pesa / Payment ─────────────────────────────────────────
  ('mpesa_paybill',             ''),
  ('mpesa_account_ref',         'RENT'),
  ('mpesa_stk_push',            '0'),

-- ── SMTP (configured via Settings UI or .env) ────────────────
  ('smtp_host',                 ''),
  ('smtp_port',                 '587'),
  ('smtp_user',                 ''),
  ('smtp_from_name',            'Smart Nyumba Pro'),

-- ── Africa''s Talking SMS ─────────────────────────────────────
  ('at_username',               'sandbox'),
  ('at_api_key',                ''),
  ('at_sender_id',              'SmartNyumba'),

-- ── Company info (shown on PDFs & receipts) ───────────────────
  ('company_name',              'Smart Nyumba Pro'),
  ('company_phone',             ''),
  ('company_email',             ''),
  ('company_address',           'Nairobi, Kenya'),
  ('company_logo_url',          ''),

-- ── Features / tenant self-service ───────────────────────────
  ('maintenance_auto_assign',   '0'),
  ('visitor_preregistration',   '1'),
  ('tenant_self_vacate',        '1'),
  ('tenant_can_rate',           '1'),
  ('notice_period_days',        '30'),

-- ── Alerts & thresholds ───────────────────────────────────────
  ('vacancy_alert_threshold',   '20'),
  ('overdue_alert_days',        '7'),
  ('lease_expiry_alert_days',   '60'),

-- ── Utility billing defaults ──────────────────────────────────
  ('gas_rate',                  '0'),
  ('garbage_rate',              '0'),
  ('service_charge_default',    '0');

-- ============================================================
--  DONE — All settings have safe defaults.
--  Go to Settings in the app to configure M-Pesa, SMTP, and SMS.
-- ============================================================
