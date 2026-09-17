'use strict';

const router = require('express').Router();
const auth   = require('../middleware/auth');
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const c      = require('../controllers/admin/expenses');

const ROLES = ['super_admin', 'property_manager', 'caretaker'];

router.get('/',       auth(ROLES), c.getAll);
router.post('/',      auth(ROLES), c.create);
router.put('/:id',    auth(ROLES), c.update);
router.delete('/:id', auth(['super_admin']), c.delete);

// ── Upload receipt for an expense ─────────────────────────────
const receiptDest = path.join(__dirname, '../uploads/receipts');
const receiptUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { fs.mkdirSync(receiptDest, { recursive: true }); cb(null, receiptDest); },
    filename:    (req, file, cb) => cb(null, 'receipt-' + req.params.id + '-' + Date.now() + path.extname(file.originalname)),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg','image/png','image/webp','application/pdf'];
    cb(null, allowed.includes(file.mimetype));
  },
}).single('receipt');

router.post('/:id/receipt', auth(ROLES), (req, res, next) => {
  receiptUpload(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const pool = require('../config/db');
  try {
    const url = '/uploads/receipts/' + req.file.filename;
    // SECURITY FIX: no org check — anyone with any org's caretaker/manager
    // account could overwrite another organisation's expense receipt by
    // guessing an expense id.
    const [result] = await pool.query('UPDATE expenses SET receipt_url=? WHERE id=? AND org_id=?', [url, req.params.id, req.user.org_id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Expense not found' });
    res.json({ receipt_url: url, message: 'Receipt uploaded' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
