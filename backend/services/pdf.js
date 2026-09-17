// Smart Nyumba Pro — PDF Receipt Generator
const PDFDocument = require('pdfkit');
const pool        = require('../config/db');
const { drawBrandedHeader, drawFooterLine } = require('../utils/pdfBranding');

async function generateReceipt(payment_id, res) {
  const [[pmt]] = await pool.query(`
    SELECT py.*,i.type AS invoice_type,rc.receipt_number,
      u.full_name AS tenant_name,u.phone AS tenant_phone,u.email AS tenant_email,
      un.unit_number,pr.name AS property_name,pr.location
    FROM payments py
    JOIN invoices i ON py.invoice_id=i.id
    JOIN tenancies ten ON py.tenancy_id=ten.id
    JOIN tenants t ON ten.tenant_id=t.id
    JOIN users u ON t.user_id=u.id
    JOIN units un ON ten.unit_id=un.id
    JOIN properties pr ON un.property_id=pr.id
    LEFT JOIN receipts rc ON py.id=rc.payment_id
    WHERE py.id=?`, [payment_id]);

  if (!pmt) throw new Error('Payment not found');

  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  if (res) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Receipt-${pmt.receipt_number}.pdf"`);
    doc.pipe(res);
  }

  // ── Header (shared branded header — see utils/pdfBranding.js) ──
  drawBrandedHeader(doc, {
    subtitle: [pmt.property_name, pmt.location].filter(Boolean).join(' — '),
    docTitle: 'PAYMENT RECEIPT',
    rightLines: [
      `Receipt #: ${pmt.receipt_number}`,
      `Date: ${new Date(pmt.paid_at).toLocaleDateString('en-KE', { day:'numeric',month:'long',year:'numeric' })}`,
      `Ref: PMT-${pmt.id}`,
    ],
  });
  const { BRAND } = require('../utils/pdfBranding');

  // ── Content ───────────────────────────────────────────────────
  doc.fill('#1e293b').moveDown(3);

  const row = (label, value, y) => {
    doc.font('Helvetica').fontSize(10).fill('#64748b').text(label, 50, y);
    doc.fill('#1e293b').text(value || '—', 220, y);
  };

  let y = 140;
  doc.font('Helvetica-Bold').fontSize(12).fill(BRAND).text('TENANT DETAILS', 50, y);
  y += 22;
  row('Name:',           pmt.tenant_name,  y); y += 18;
  row('Phone:',          pmt.tenant_phone || '—', y); y += 18;
  row('Email:',          pmt.tenant_email, y); y += 18;
  row('Unit:',           pmt.unit_number,  y); y += 18;
  row('Property:',       pmt.property_name, y);

  y += 35;
  doc.font('Helvetica-Bold').fontSize(12).fill(BRAND).text('PAYMENT DETAILS', 50, y);
  y += 22;
  row('Invoice type:',   pmt.invoice_type?.replace(/_/g,' '), y); y += 18;
  row('Payment method:', pmt.payment_method?.toUpperCase(), y); y += 18;
  row('Transaction code:', pmt.transaction_code || '—', y); y += 18;
  row('Payment date:',   new Date(pmt.paid_at).toLocaleString('en-KE'), y);

  // Amount box
  y += 45;
  doc.rect(50, y, 512, 60).fill('#fffbeb').stroke('#fde68a');
  doc.fill(BRAND).font('Helvetica').fontSize(11).text('AMOUNT PAID', 70, y + 10);
  doc.fill('#92400e').font('Helvetica-Bold').fontSize(26)
     .text(`KES ${Number(pmt.amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`, 70, y + 28);

  // Footer
  y += 100;
  drawFooterLine(doc, 50, y, 512, 'This is a system-generated receipt. No signature required.');

  doc.end();
  return doc;
}

module.exports = { generateReceipt };
