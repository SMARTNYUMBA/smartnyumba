const PDFDocument = require('pdfkit');
const pool        = require('../config/db');
const { drawBrandedHeader, drawFooterLine, BRAND } = require('../utils/pdfBranding');

async function generateInvoicePdf(invoice_id, res) {
  const [[inv]] = await pool.query(`
    SELECT i.*,u.full_name AS tenant_name,u.phone AS tenant_phone,
      un.unit_number,pr.name AS property_name,pr.location
    FROM invoices i JOIN tenancies ten ON i.tenancy_id=ten.id
    JOIN tenants t ON ten.tenant_id=t.id JOIN users u ON t.user_id=u.id
    JOIN units un ON ten.unit_id=un.id JOIN properties pr ON un.property_id=pr.id
    WHERE i.id=?`, [invoice_id]);

  if (!inv) throw new Error('Invoice not found');

  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  if (res) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${inv.id}.pdf"`);
    doc.pipe(res);
  }

  // Header (shared branded header — see utils/pdfBranding.js)
  drawBrandedHeader(doc, {
    subtitle: [inv.property_name, inv.location].filter(Boolean).join(' — '),
    docTitle: 'TAX INVOICE',
    rightLines: [
      `Invoice #: INV-${String(inv.id).padStart(5,'0')}`,
      `Date: ${new Date(inv.created_at).toLocaleDateString('en-KE',{day:'numeric',month:'long',year:'numeric'})}`,
      `Due: ${new Date(inv.due_date).toLocaleDateString('en-KE',{day:'numeric',month:'long',year:'numeric'})}`,
    ],
  });

  doc.fill('#1e293b').moveDown(3);
  const row = (l,v,y) => {
    doc.font('Helvetica').fontSize(10).fill('#64748b').text(l,50,y);
    doc.fill('#1e293b').text(v||'—',220,y);
  };
  let y = 140;
  doc.font('Helvetica-Bold').fontSize(11).fill(BRAND).text('BILL TO',50,y); y+=20;
  row('Name:',    inv.tenant_name,  y); y+=18;
  row('Phone:',   inv.tenant_phone, y); y+=18;
  row('Unit:',    inv.unit_number,  y); y+=18;
  row('Property:',inv.property_name,y);

  // Invoice table
  y += 40;
  doc.rect(50,y,512,25).fill('#f1f5f9');
  doc.fill('#334155').font('Helvetica-Bold').fontSize(10)
    .text('Description',60,y+7).text('Amount (KES)',430,y+7);
  y += 28;
  const desc = inv.type.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  doc.fill('#1e293b').font('Helvetica').fontSize(10).text(desc,60,y).text(Number(inv.amount).toLocaleString('en-KE',{minimumFractionDigits:2}),430,y);
  if (inv.balance < inv.amount) {
    y += 20;
    doc.fill('#16a34a').text('Amount paid',60,y).text(Number(inv.amount-inv.balance).toLocaleString('en-KE',{minimumFractionDigits:2}),430,y);
  }
  y += 30;
  doc.moveTo(50,y).lineTo(562,y).strokeColor('#e2e8f0').stroke();
  y += 15;
  const statusColor = inv.status==='paid'?'#16a34a':inv.status==='overdue'?'#dc2626':'#d97706';
  doc.rect(50,y,512,50).fill('#f8fafc');
  doc.fill('#64748b').font('Helvetica').fontSize(10).text('Balance due:',60,y+10);
  doc.fill(statusColor).font('Helvetica-Bold').fontSize(22)
    .text(`KES ${Number(inv.balance).toLocaleString('en-KE',{minimumFractionDigits:2})}`,280,y+8);
  // BUG FIX: status text at a fixed x=430 collided with the amount above
  // it (a 22pt bold amount can easily run past x=430) — moved to its own
  // right-aligned line below the amount instead of a fixed x beside it.
  doc.fill('#94a3b8').font('Helvetica').fontSize(9).text(`Status: ${inv.status.toUpperCase()}`,280,y+34,{width:282,align:'right'});

  y += 75;
  doc.fill('#64748b').font('Helvetica').fontSize(9)
    .text('Payment via: M-Pesa Paybill 400200 | Account: ' + inv.unit_number, 50, y, {align:'center',width:512});
  drawFooterLine(doc, 50, y+14, 512);

  doc.end();
  return doc;
}

module.exports = { generateInvoicePdf };
