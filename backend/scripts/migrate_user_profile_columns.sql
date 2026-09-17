-- Migration: Add ID/passport/emergency columns to users table
-- Run this once against your database.
-- Safe to run multiple times (uses IF NOT EXISTS logic via ALTER IGNORE).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS id_number        VARCHAR(30)  DEFAULT NULL AFTER phone,
  ADD COLUMN IF NOT EXISTS id_type          VARCHAR(20)  DEFAULT 'national_id' AFTER id_number,
  ADD COLUMN IF NOT EXISTS passport_number  VARCHAR(30)  DEFAULT NULL AFTER id_type,
  ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS emergency_phone  VARCHAR(20)  DEFAULT NULL;

-- Backfill from tenants table where data already exists
UPDATE users u
JOIN tenants t ON t.user_id = u.id
SET
  u.id_number         = COALESCE(u.id_number, t.id_number),
  u.passport_number   = COALESCE(u.passport_number, t.passport_number),
  u.emergency_contact = COALESCE(u.emergency_contact, t.emergency_contact),
  u.emergency_phone   = COALESCE(u.emergency_phone, t.emergency_phone)
WHERE t.user_id IS NOT NULL;
