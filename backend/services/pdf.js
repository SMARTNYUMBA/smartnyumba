// Smart Nyumba Pro — PDF Receipt Generator
const PDFDocument = require('pdfkit');
const pool        = require('../config/db');

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

  // ── Header ───────────────────────────────────────────────────
  doc.rect(0, 0, 612, 120).fill('#0369a1');
  doc.fill('white').font('Helvetica-Bold').fontSize(22).text('SMART NYUMBA RMS', 50, 35);
  doc.font('Helvetica').fontSize(11).text('Property Management System', 50, 62);
  doc.text(pmt.property_name, 50, 80);
  doc.text(pmt.location || '', 50, 96);

  // Receipt stamp
  doc.font('Helvetica-Bold').fontSize(14).text('PAYMENT RECEIPT', 380, 40);
  doc.fill('#bae6fd').font('Helvetica').fontSize(11).text(`Receipt #: ${pmt.receipt_number}`, 380, 60);
  doc.text(`Date: ${new Date(pmt.paid_at).toLocaleDateString('en-KE', { day:'numeric',month:'long',year:'numeric' })}`, 380, 76);
  doc.text(`Ref: PMT-${pmt.id}`, 380, 92);

  // ── Content ───────────────────────────────────────────────────
  doc.fill('#1e293b').moveDown(3);

  const row = (label, value, y) => {
    doc.font('Helvetica').fontSize(10).fill('#64748b').text(label, 50, y);
    doc.fill('#1e293b').text(value || '—', 220, y);
  };

  let y = 160;
  doc.font('Helvetica-Bold').fontSize(12).fill('#0369a1').text('TENANT DETAILS', 50, y);
  y += 22;
  row('Name:',           pmt.tenant_name,  y); y += 18;
  row('Phone:',          pmt.tenant_phone || '—', y); y += 18;
  row('Email:',          pmt.tenant_email, y); y += 18;
  row('Unit:',           pmt.unit_number,  y); y += 18;
  row('Property:',       pmt.property_name, y);

  y += 35;
  doc.font('Helvetica-Bold').fontSize(12).fill('#0369a1').text('PAYMENT DETAILS', 50, y);
  y += 22;
  row('Invoice type:',   pmt.invoice_type?.replace(/_/g,' '), y); y += 18;
  row('Payment method:', pmt.payment_method?.toUpperCase(), y); y += 18;
  row('Transaction code:', pmt.transaction_code || '—', y); y += 18;
  row('Payment date:',   new Date(pmt.paid_at).toLocaleString('en-KE'), y);

  // Amount box
  y += 45;
  doc.rect(50, y, 512, 60).fill('#f0f9ff').stroke('#bae6fd');
  doc.fill('#0369a1').font('Helvetica').fontSize(11).text('AMOUNT PAID', 70, y + 10);
  doc.fill('#0c4a6e').font('Helvetica-Bold').fontSize(26)
     .text(`KES ${Number(pmt.amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`, 70, y + 28);

  // Footer
  y += 100;
  doc.fill('#64748b').font('Helvetica').fontSize(9)
     .text('This is a system-generated receipt. No signature required.', 50, y, { align: 'center', width: 512 });
  doc.text('Smart Nyumba RMS — The Smart Way to Manage Your Estate', 50, y + 14, { align: 'center', width: 512 });

  doc.end();
  return doc;
}

module.exports = { generateReceipt };
