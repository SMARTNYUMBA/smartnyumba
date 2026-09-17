'use strict';

/**
 * SmartNyumba Pro — Structured Error Codes
 *
 * Every API error includes a machine-readable `code` alongside the human
 * message. This makes frontend error handling, i18n, and automated testing
 * deterministic — no fragile string matching on English messages.
 *
 * Usage:
 *   const { apiErr, CODES } = require('../utils/errorCodes');
 *   return apiErr(res, CODES.INVOICE_NOT_FOUND, 404);
 *   return apiErr(res, CODES.VALIDATION, 422, { details: [...] });
 */

// ── Error code registry ───────────────────────────────────────
const CODES = {
  // Auth
  AUTH_REQUIRED:          { code: 'AUTH_REQUIRED',         message: 'Authentication required' },
  AUTH_INVALID:           { code: 'AUTH_INVALID',          message: 'Invalid credentials' },
  AUTH_FORBIDDEN:         { code: 'AUTH_FORBIDDEN',        message: 'Insufficient permissions' },
  AUTH_TOKEN_EXPIRED:     { code: 'AUTH_TOKEN_EXPIRED',    message: 'Token expired' },
  AUTH_TOKEN_INVALID:     { code: 'AUTH_TOKEN_INVALID',    message: 'Invalid token' },
  AUTH_MFA_REQUIRED:      { code: 'AUTH_MFA_REQUIRED',     message: 'MFA verification required' },
  AUTH_MFA_INVALID:       { code: 'AUTH_MFA_INVALID',      message: 'Invalid or expired OTP' },
  AUTH_MFA_SEND_FAILED:   { code: 'AUTH_MFA_SEND_FAILED',  message: 'Could not send OTP. Please try again.' },
  AUTH_PASSWORD_WEAK:     { code: 'AUTH_PASSWORD_WEAK',    message: 'Password must be at least 8 characters' },
  AUTH_RESET_INVALID:     { code: 'AUTH_RESET_INVALID',    message: 'Reset link is invalid or has expired' },
  AUTH_ACCOUNT_INACTIVE:  { code: 'AUTH_ACCOUNT_INACTIVE', message: 'Account is inactive' },

  // Validation
  VALIDATION:             { code: 'VALIDATION',            message: 'Validation failed' },
  MISSING_FIELDS:         { code: 'MISSING_FIELDS',        message: 'Required fields are missing' },
  INVALID_FORMAT:         { code: 'INVALID_FORMAT',        message: 'Invalid field format' },

  // Resource not found
  USER_NOT_FOUND:         { code: 'USER_NOT_FOUND',        message: 'User not found' },
  TENANT_NOT_FOUND:       { code: 'TENANT_NOT_FOUND',      message: 'Tenant not found' },
  PROPERTY_NOT_FOUND:     { code: 'PROPERTY_NOT_FOUND',    message: 'Property not found' },
  UNIT_NOT_FOUND:         { code: 'UNIT_NOT_FOUND',        message: 'Unit not found' },
  TENANCY_NOT_FOUND:      { code: 'TENANCY_NOT_FOUND',     message: 'Tenancy not found' },
  INVOICE_NOT_FOUND:      { code: 'INVOICE_NOT_FOUND',     message: 'Invoice not found' },
  PAYMENT_NOT_FOUND:      { code: 'PAYMENT_NOT_FOUND',     message: 'Payment not found' },
  MAINTENANCE_NOT_FOUND:  { code: 'MAINTENANCE_NOT_FOUND', message: 'Maintenance request not found' },
  ANNOUNCEMENT_NOT_FOUND: { code: 'ANNOUNCEMENT_NOT_FOUND',message: 'Announcement not found' },

  // Business logic
  UNIT_OCCUPIED:          { code: 'UNIT_OCCUPIED',         message: 'Unit is already occupied' },
  TENANCY_ACTIVE:         { code: 'TENANCY_ACTIVE',        message: 'Tenant has an active tenancy' },
  INVOICE_ALREADY_PAID:   { code: 'INVOICE_ALREADY_PAID',  message: 'Invoice is already paid' },
  DUPLICATE_PAYMENT:      { code: 'DUPLICATE_PAYMENT',     message: 'Transaction code already recorded' },
  DUPLICATE_EMAIL:        { code: 'DUPLICATE_EMAIL',       message: 'Email already in use' },
  DUPLICATE_PHONE:        { code: 'DUPLICATE_PHONE',       message: 'Phone number already in use' },
  CANNOT_DELETE_SELF:     { code: 'CANNOT_DELETE_SELF',    message: 'You cannot delete your own account' },
  BULK_LIMIT_EXCEEDED:    { code: 'BULK_LIMIT_EXCEEDED',   message: 'Batch size exceeds the maximum allowed limit' },
  MPESA_NOT_CONFIGURED:   { code: 'MPESA_NOT_CONFIGURED',  message: 'M-Pesa is not configured' },
  MPESA_INVALID_PHONE:    { code: 'MPESA_INVALID_PHONE',   message: 'Invalid phone number for M-Pesa' },
  MPESA_INVALID_CODE:     { code: 'MPESA_INVALID_CODE',    message: 'M-Pesa code must be exactly 10 alphanumeric characters' },

  // File upload
  FILE_TOO_LARGE:         { code: 'FILE_TOO_LARGE',        message: 'File exceeds the maximum allowed size' },
  FILE_TYPE_INVALID:      { code: 'FILE_TYPE_INVALID',     message: 'File type not allowed' },
  FILE_REQUIRED:          { code: 'FILE_REQUIRED',         message: 'No file uploaded' },

  // System
  INTERNAL:               { code: 'INTERNAL',              message: 'Internal server error' },
  DB_ERROR:               { code: 'DB_ERROR',              message: 'Database error' },
  SERVICE_UNAVAILABLE:    { code: 'SERVICE_UNAVAILABLE',   message: 'Service temporarily unavailable' },
  RATE_LIMITED:           { code: 'RATE_LIMITED',          message: 'Too many requests, please slow down' },
};

/**
 * Send a structured error response.
 *
 * @param {object} res        Express response object
 * @param {object} codeDef    One of the CODES entries
 * @param {number} status     HTTP status code (default: 400)
 * @param {object} extra      Any additional fields to merge into the response body
 */
function apiErr(res, codeDef, status = 400, extra = {}) {
  return res.status(status).json({
    success: false,
    error:   codeDef.message,
    code:    codeDef.code,
    ...extra,
  });
}

/**
 * Wrap the legacy err() helper to also accept a CODES entry.
 * Drop-in compatible with existing code that passes a plain string.
 */
function err(res, messageOrCode, status = 400, details = null) {
  if (messageOrCode && typeof messageOrCode === 'object' && messageOrCode.code) {
    return apiErr(res, messageOrCode, status, details ? { details } : {});
  }
  // Legacy plain-string path — keeps all existing code working
  const body = { success: false, error: messageOrCode };
  if (details) body.details = details;
  return res.status(status).json(body);
}

module.exports = { CODES, apiErr, err };
