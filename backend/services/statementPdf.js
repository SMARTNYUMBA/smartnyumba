// backend/services/statementPdf.js  — NEW FILE
// Generates branded tenant statement PDF using PDFKit

const PDFDocument = require('pdfkit');
const pool        = require('../config/db');
const { drawBrandedHeader, drawFooterLine, BRAND } = require('../utils/pdfBranding');

async function generateStatementPdf(tenancy_id, res) {
  const [[tenancy]] = await pool.query(`
    SELECT ten.*,u.full_name,u.phone,u.email,un.unit_number,pr.name AS property_name,pr.location,pr.address
    FROM tenancies ten
    JOIN tenants t ON ten.tenant_id=t.id JOIN users u ON t.user_id=u.id
    JOIN units un ON ten.unit_id=un.id JOIN properties pr ON un.property_id=pr.id
    WHERE ten.id=?`, [tenancy_id]);

  if (!tenancy) throw new Error('Tenancy not found');

  // Get all invoices and payments
  const [invoices] = await pool.query(
    'SELECT * FROM invoices WHERE tenancy_id=? ORDER BY created_at ASC', [tenancy_id]);
  const [payments] = await pool.query(
    'SELECT * FROM payments WHERE tenancy_id=? ORDER BY paid_at ASC', [tenancy_id]);

  // Build ledger with running balance
  const events = [
    ...invoices.map(i => ({ date: new Date(i.created_at), type:'invoice', desc:`${i.type.replace(/_/g,' ')} invoice #${i.id}`, amount: Number(i.amount), balance_change: Number(i.amount) })),
    ...payments.map(p => ({ date: new Date(p.paid_at), type:'payment', desc:`Payment — ${p.payment_method.replace(/_/g,' ')}${p.transaction_code?' ('+p.transaction_code+')':''}`, amount: Number(p.amount), balance_change: -Number(p.amount) })),
  ].sort((a,b) => a.date - b.date);

  let running = 0;
  events.forEach(e => { running += e.balance_change; e.running = running; });

  const doc = new PDFDocument({ size:'A4', margin:50 });
  if (res) {
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Statement-${tenancy.unit_number}-${new Date().toISOString().slice(0,7)}.pdf"`);
    doc.pipe(res);
  }

  // Header (shared branded header — see utils/pdfBranding.js)
  drawBrandedHeader(doc, {
    subtitle: [tenancy.property_name, tenancy.address||tenancy.location].filter(Boolean).join(' — '),
    docTitle: 'ACCOUNT STATEMENT',
    rightLines: [
      `Generated: ${new Date().toLocaleDateString('en-KE',{day:'numeric',month:'long',year:'numeric'})}`,
      `Tenant: ${tenancy.full_name}`,
      `Unit: ${tenancy.unit_number}`,
    ],
  });

  doc.fill('#1e293b').fontSize(10).moveDown(3.5);

  // Current balance box
  const balance = running;
  const balColor = balance > 0 ? '#dc2626' : '#16a34a';
  doc.rect(50, 120, 512, 50).fill(balance>0?'#fef2f2':'#f0fdf4').stroke(balance>0?'#fca5a5':'#86efac');
  doc.fill(balColor).font('Helvetica-Bold').fontSize(14)
    .text(balance>0 ? `OUTSTANDING BALANCE: KES ${Math.abs(balance).toLocaleString('en-KE',{minimumFractionDigits:2})}` : '✓ ACCOUNT CLEAR — No outstanding balance', 50, 133, { align:'center', width:512 });

  // Tenant info
  let y = 190;
  doc.fill('#334155').font('Helvetica-Bold').fontSize(10).text('TENANT INFORMATION', 50, y);
  doc.moveTo(50, y+15).lineTo(562, y+15).stroke('#e2e8f0'); y+=20;
  const info = [['Name', tenancy.full_name], ['Phone', tenancy.phone], ['Unit', tenancy.unit_number], ['Rent', `KES ${Number(tenancy.rent_amount||0).toLocaleString()}/mo`], ['Lease start', tenancy.start_date?.toString().slice(0,10)]];
  doc.font('Helvetica').fontSize(9);
  info.forEach(([l,v]) => { doc.fill('#64748b').text(l+':', 50, y, {width:120}); doc.fill('#1e293b').text(v||'—', 170, y); y+=15; });

  // Ledger table
  y += 15;
  doc.fill('#334155').font('Helvetica-Bold').fontSize(10).text('TRANSACTION HISTORY', 50, y);
  doc.moveTo(50, y+15).lineTo(562, y+15).stroke('#e2e8f0'); y+=20;

  // Table header
  doc.rect(50, y, 512, 20).fill('#f1f5f9');
  doc.fill('#334155').font('Helvetica-Bold').fontSize(8)
    .text('DATE', 55, y+6).text('DESCRIPTION', 120, y+6)
    .text('CHARGES', 350, y+6).text('PAYMENTS', 420, y+6).text('BALANCE', 490, y+6);
  y += 22;

  doc.font('Helvetica').fontSize(8);
  for (const e of events) {
    if (y > 720) { doc.addPage(); y = 50; }
    const dateStr = e.date.toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'2-digit'});
    const color   = e.type==='invoice'?'#dc2626':'#16a34a';
    doc.fill('#64748b').text(dateStr, 55, y, {width:60});
    doc.fill('#1e293b').text(e.desc, 120, y, {width:225});
    if (e.type==='invoice') doc.fill('#dc2626').text(`${Number(e.amount).toLocaleString()}`, 350, y, {width:65,align:'right'});
    else                    doc.fill('#64748b').text('—', 350, y, {width:65,align:'right'});
    if (e.type==='payment') doc.fill('#16a34a').text(`${Number(e.amount).toLocaleString()}`, 420, y, {width:65,align:'right'});
    else                    doc.fill('#64748b').text('—', 420, y, {width:65,align:'right'});
    doc.fill(e.running>0?'#dc2626':'#16a34a').text(`${Number(Math.abs(e.running)).toLocaleString()}`, 490, y, {width:70,align:'right'});
    doc.moveTo(50,y+12).lineTo(562,y+12).stroke('#f1f5f9');
    y += 16;
  }

  // Totals
  y += 5;
  doc.rect(50,y,512,25).fill('#f8fafc').stroke('#e2e8f0');
  const totalInvoiced = invoices.reduce((s,i)=>s+Number(i.amount),0);
  const totalPaid     = payments.reduce((s,p)=>s+Number(p.amount),0);
  doc.fill('#334155').font('Helvetica-Bold').fontSize(9)
    .text('TOTALS', 55, y+8)
    .text(`${totalInvoiced.toLocaleString()}`, 350, y+8, {width:65,align:'right'})
    .text(`${totalPaid.toLocaleString()}`, 420, y+8, {width:65,align:'right'});
  doc.fill(balance>0?'#dc2626':'#16a34a').text(`${Math.abs(balance).toLocaleString()} ${balance>0?'OWED':'CREDIT'}`, 490, y+8, {width:70,align:'right'});

  y += 45;
  drawFooterLine(doc, 50, y, 512);

  doc.end();
  return doc;
}

module.exports = { generateStatementPdf };
// Alias so routes/pdf.js can import either name
module.exports.statementPdf = module.exports.generateStatementPdf;
