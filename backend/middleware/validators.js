'use strict';

const { body, param, query, validationResult } = require('express-validator');

/**
 * Run validation result and short-circuit with 422 if errors exist.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      error: 'Validation failed',
      details: errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

// ── Auth schemas ──────────────────────────────────────────────
const loginSchema = [
  body('identifier').notEmpty().withMessage('Email or phone required').trim(),
  body('password').notEmpty().withMessage('Password required').isLength({ min: 6 }).withMessage('Password too short'),
  validate,
];

const changePasswordSchema = [
  body('current_password').notEmpty().withMessage('Current password required'),
  body('new_password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),
  validate,
];

// ── Invoice schemas ───────────────────────────────────────────
const invoiceSchema = [
  body('tenancy_id').isInt({ min: 1 }).withMessage('Valid tenancy_id required'),
  body('type').isIn([
    'rent','water','electricity','service_charge','garbage','parking','penalty','deposit','other',
  ]).withMessage('Invalid invoice type'),
  body('amount')
    .isFloat({ min: 1 }).withMessage('Amount must be at least 1')
    .custom(v => v <= 10_000_000).withMessage('Amount exceeds maximum'),
  body('due_date').isDate().withMessage('Valid due_date (YYYY-MM-DD) required'),
  body('notes').optional().isLength({ max: 500 }).trim(),
  validate,
];

// ── Payment schemas ───────────────────────────────────────────
const paymentSchema = [
  body('invoice_id').isInt({ min: 1 }).withMessage('Valid invoice_id required'),
  body('tenancy_id').isInt({ min: 1 }).withMessage('Valid tenancy_id required'),
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be at least 1'),
  body('payment_method').isIn(['mpesa','bank','cash','cheque','wallet']).withMessage('Invalid payment method'),
  body('transaction_code')
    .optional({ nullable: true })
    .trim()
    .custom((val, { req }) => {
      if (!val) return true;
      if (req.body.payment_method === 'mpesa' && !/^[A-Z0-9]{10}$/.test(val.toUpperCase())) {
        throw new Error('M-Pesa code must be exactly 10 alphanumeric characters');
      }
      return true;
    }),
  validate,
];

// ── Property schemas ──────────────────────────────────────────
const propertySchema = [
  body('name').notEmpty().isLength({ max: 150 }).trim().withMessage('Property name required (max 150 chars)'),
  body('location').optional().isLength({ max: 255 }).trim(),
  body('address').optional().isLength({ max: 500 }).trim(),
  validate,
];

// ── Unit schemas ──────────────────────────────────────────────
const unitSchema = [
  body('property_id').isInt({ min: 1 }).withMessage('property_id required'),
  body('unit_number').notEmpty().isLength({ max: 50 }).trim().withMessage('unit_number required'),
  body('rent_amount').isFloat({ min: 0 }).withMessage('rent_amount must be a positive number'),
  body('type').optional().isIn([
    'bedsitter','one_bedroom','two_bedroom','three_bedroom','studio','penthouse','shop','office',
  ]),
  validate,
];

// ── Tenancy schemas ───────────────────────────────────────────
const tenancySchema = [
  body('tenant_id').isInt({ min: 1 }).withMessage('tenant_id required'),
  body('unit_id').isInt({ min: 1 }).withMessage('unit_id required'),
  body('start_date').isDate().withMessage('start_date (YYYY-MM-DD) required'),
  body('rent_amount').isFloat({ min: 0 }).withMessage('rent_amount required'),
  body('deposit').optional().isFloat({ min: 0 }),
  validate,
];

// ── Tenant / User schemas ─────────────────────────────────────
const createUserSchema = [
  body('full_name').notEmpty().isLength({ max: 150 }).trim().withMessage('full_name required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('phone').optional().matches(/^[0-9+\s-]{7,20}$/).withMessage('Invalid phone format'),
  body('role').isIn([
    'super_admin','property_manager','tenant','caretaker','security','owner',
  ]).withMessage('Invalid role'),
  body('password').optional().isLength({ min: 8 }).withMessage('Password must be at least 8 chars'),
  validate,
];

// ── Generic ID param validator ────────────────────────────────
const idParam = [
  param('id').isInt({ min: 1 }).withMessage('Invalid ID'),
  validate,
];

module.exports = {
  validate,
  loginSchema,
  changePasswordSchema,
  invoiceSchema,
  paymentSchema,
  propertySchema,
  unitSchema,
  tenancySchema,
  createUserSchema,
  idParam,
};