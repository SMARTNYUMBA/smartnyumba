const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const { generateReceipt }    = require('../services/pdf');
const { generateInvoicePdf } = require('../services/invoicePdf');

// Verify token from either Authorization header OR ?token= query param (for browser download links)
function authFlexible(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// SECURITY FIX: previously had zero access control of any kind — any
// authenticated user, from any organisation, could download any other
// tenant's payment receipt (name, phone, amount, property) just by
// guessing a payment_id.
router.get('/receipt/:payment_id', authFlexible, async (req, res) => {
  try {
    const pool = require('../config/db');
    const [[check]] = await pool.query(
      `SELECT t.user_id AS tenant_user_id, pr.org_id
       FROM payments py
       JOIN tenancies ten ON py.tenancy_id=ten.id
       JOIN tenants t ON ten.tenant_id=t.id
       JOIN units un ON ten.unit_id=un.id
       JOIN properties pr ON un.property_id=pr.id
       WHERE py.id=?`, [req.params.payment_id]);
    if (!check) return res.status(404).json({ error: 'Payment not found' });
    if (req.user.role === 'tenant') {
      if (check.tenant_user_id !== req.user.sub) return res.status(403).json({ error: 'Access denied' });
    } else if (check.org_id !== req.user.org_id) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    await generateReceipt(req.params.payment_id, res);
  }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/invoice/:invoice_id', authFlexible, async (req, res) => {
  try {
    const pool = require('../config/db');
    if (req.user.role === 'tenant') {
      const [[inv]] = await pool.query(
        'SELECT i.id FROM invoices i JOIN tenancies ten ON i.tenancy_id=ten.id JOIN tenants t ON ten.tenant_id=t.id WHERE i.id=? AND t.user_id=?',
        [req.params.invoice_id, req.user.sub]);
      if (!inv) return res.status(403).json({ error: 'Access denied' });
    } else {
      // SECURITY FIX: non-tenant roles had no org check at all — any
      // manager/admin could download any other organisation's invoice PDF.
      const [[inv]] = await pool.query(
        `SELECT i.id FROM invoices i JOIN tenancies ten ON i.tenancy_id=ten.id
         WHERE i.id=? AND ten.org_id=?`, [req.params.invoice_id, req.user.org_id]);
      if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    }
    await generateInvoicePdf(req.params.invoice_id, res);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/statement/:tenancy_id', authFlexible, async (req, res) => {
  try {
    const pool = require('../config/db');
    const { statementPdf } = require('../services/statementPdf');
    if (req.user.role === 'tenant') {
      const [[check]] = await pool.query(
        'SELECT ten.id FROM tenancies ten JOIN tenants t ON ten.tenant_id=t.id WHERE ten.id=? AND t.user_id=?',
        [req.params.tenancy_id, req.user.sub]);
      if (!check) return res.status(403).json({ error: 'Access denied' });
    } else {
      // SECURITY FIX: non-tenant roles had no org check at all — any
      // manager/admin could download any other organisation's tenant
      // statement PDF (full financial ledger) by ID.
      const [[check]] = await pool.query('SELECT id FROM tenancies WHERE id=? AND org_id=?', [req.params.tenancy_id, req.user.org_id]);
      if (!check) return res.status(404).json({ error: 'Tenancy not found' });
    }
    if (typeof statementPdf === 'function') {
      await statementPdf(req.params.tenancy_id, res);
    } else {
      res.status(501).json({ error: 'PDF generation not configured' });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Lease agreement PDF ──────────────────────────────────────
// SECURITY FIX: previously had no access control at all — any
// authenticated user (including tenant role) could download any other
// tenant's lease agreement (name, phone, rent, deposit) by guessing a
// tenancy_id. Tenants restricted to their own lease; everyone else
// restricted to their own organisation's tenancy.
router.get('/lease/:tenancy_id', authFlexible, async (req, res) => {
  try {
    const pool = require('../config/db');
    const [[ten]] = await pool.query(
      `SELECT ten.*,u.full_name AS tenant_name,u.phone AS tenant_phone,
        un.unit_number,pr.name AS property_name,pr.address,pr.location,
        pr.org_id, t.user_id AS tenant_user_id
       FROM tenancies ten
       JOIN tenants t ON ten.tenant_id=t.id JOIN users u ON t.user_id=u.id
       JOIN units un ON ten.unit_id=un.id JOIN properties pr ON un.property_id=pr.id
       WHERE ten.id=?`, [req.params.tenancy_id]);
    if (!ten) return res.status(404).json({ error: 'Tenancy not found' });
    if (req.user.role === 'tenant') {
      if (ten.tenant_user_id !== req.user.sub) return res.status(403).json({ error: 'Access denied' });
    } else if (ten.org_id !== req.user.org_id) {
      return res.status(404).json({ error: 'Tenancy not found' });
    }

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size:'A4', margin:50 });
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Lease-${ten.unit_number}-${ten.tenant_name.replace(/ /g,'-')}.pdf"`);
    doc.pipe(res);

    // Header
    doc.rect(0,0,612,100).fill('#0369a1');
    doc.fill('white').font('Helvetica-Bold').fontSize(20).text('TENANCY AGREEMENT', 50, 35);
    doc.font('Helvetica').fontSize(10).text(ten.property_name, 50, 60);
    doc.text(ten.address||ten.location||'', 50, 75);

    // Parties
    doc.fill('#1e293b').moveDown(3);
    let y = 130;
    const row = (label, val) => { doc.font('Helvetica').fontSize(10).fill('#64748b').text(label, 50, y); doc.fill('#1e293b').text(val||'—', 250, y); y += 18; };

    doc.font('Helvetica-Bold').fontSize(12).fill('#0369a1').text('LANDLORD / PROPERTY', 50, y); y += 22;
    row('Property name:',  ten.property_name);
    row('Location:',       ten.location||ten.address||'');

    y += 10;
    doc.font('Helvetica-Bold').fontSize(12).fill('#0369a1').text('TENANT', 50, y); y += 22;
    row('Full name:',   ten.tenant_name);
    row('Phone:',       ten.tenant_phone);
    row('Unit:',        ten.unit_number);

    y += 10;
    doc.font('Helvetica-Bold').fontSize(12).fill('#0369a1').text('LEASE TERMS', 50, y); y += 22;
    row('Start date:',  ten.start_date ? new Date(ten.start_date).toLocaleDateString('en-KE') : '—');
    row('End date:',    ten.end_date   ? new Date(ten.end_date).toLocaleDateString('en-KE')   : 'Month to month');
    row('Monthly rent:', `KES ${Number(ten.rent_amount).toLocaleString()}`);
    row('Deposit:',      `KES ${Number(ten.deposit||0).toLocaleString()}`);
    row('Payment day:',  ten.payment_due_day || '1st of month');

    y += 20;
    doc.font('Helvetica-Bold').fontSize(11).fill('#1e293b').text('GENERAL CONDITIONS', 50, y); y += 18;
    const conditions = [
      '1. Rent is due on the agreed date each month.',
      '2. A late fee applies after the grace period.',
      '3. The tenant shall maintain the unit in good condition.',
      '4. No subletting without written consent from the landlord.',
      '5. Notice must be given as per the vacate notice policy.',
    ];
    conditions.forEach(cond => { doc.font('Helvetica').fontSize(10).fill('#374151').text(cond, 50, y, { width: 512 }); y += 22; });

    y += 30;
    doc.font('Helvetica').fontSize(10).fill('#374151').text('Tenant signature: _________________________', 50, y);
    doc.text(`Date: ${new Date().toLocaleDateString('en-KE')}`, 380, y);
    y += 40;
    doc.text('Landlord signature: _____________________', 50, y);
    doc.text(`Date: ${new Date().toLocaleDateString('en-KE')}`, 380, y);

    doc.end();
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ── Owner remittance PDF ──────────────────────────────────────
router.get('/remittance/:id', authFlexible, async (req, res) => {
  try {
    const pool = require('../config/db');
    // SECURITY FIX: the super_admin bypass checked whether the caller was
    // *a* super_admin anywhere on the platform, with no org check at all —
    // a super_admin of Org A could download Org B's owner remittance PDF
    // (real financial figures). Now scoped via the property's org_id.
    const [[rem]] = await pool.query(
      `SELECT r.*, p.name AS property_name, p.location, p.org_id,
              u.full_name AS owner_name, u.email AS owner_email
       FROM owner_remittances r
       JOIN properties p ON r.property_id = p.id
       JOIN users u ON r.owner_id = u.id
       WHERE r.id = ?`,
      [req.params.id]);
    if (!rem) return res.status(404).json({ error: 'Remittance not found' });
    const isOwner = rem.owner_id === req.user.sub;
    const isSameOrgAdmin = req.user.role !== 'owner' && rem.org_id === req.user.org_id;
    if (!isOwner && !isSameOrgAdmin) return res.status(404).json({ error: 'Remittance not found' });

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="remittance-' + rem.period + '.pdf"');
    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('REMITTANCE STATEMENT', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica').text('SmartNyumba Property Management', { align: 'center' });
    doc.moveDown(1);

    // Details
    doc.fontSize(11).font('Helvetica-Bold').text('Statement Details', { underline: true });
    doc.moveDown(0.3);
    const fmt = (n) => 'KES ' + Number(n||0).toLocaleString('en-KE', { minimumFractionDigits: 2 });
    const rows = [
      ['Owner',           rem.owner_name],
      ['Property',        rem.property_name],
      ['Period',          rem.period],
      ['Gross Revenue',   fmt(rem.gross_revenue)],
      ['Total Expenses',  fmt(rem.expenses)],
      ['Management Fee',  fmt(rem.management_fee)],
      ['Net Remittance',  fmt(rem.net_remittance)],
      ['Status',          (rem.status||'').toUpperCase()],
    ];
    doc.font('Helvetica');
    rows.forEach(([label, value]) => {
      doc.fontSize(10).text(label + ':', { continued: true, width: 150 }).text(value, { align: 'left' });
      doc.moveDown(0.3);
    });

    doc.moveDown(1);
    if (rem.notes) {
      doc.fontSize(10).font('Helvetica-Bold').text('Notes:');
      doc.font('Helvetica').text(rem.notes);
      doc.moveDown(0.5);
    }

    doc.fontSize(9).fillColor('#64748b').text('Generated by SmartNyumba on ' + new Date().toLocaleDateString('en-KE'), { align: 'center' });
    doc.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
