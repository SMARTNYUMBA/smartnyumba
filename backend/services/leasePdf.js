'use strict';

/**
 * SmartNyumba Pro — Lease Agreement PDF Generator
 *
 * Generates a Kenya-compliant residential lease agreement PDF.
 * Covers: parties, property, rent, deposit, obligations, termination.
 *
 * Usage:
 *   const { generateLeasePdf } = require('../services/leasePdf');
 *   await generateLeasePdf(tenancy_id, res);
 */

const PDFDocument = require('pdfkit');
const pool        = require('../config/db');

async function generateLeasePdf(tenancy_id, res) {
  const [[ten]] = await pool.query(`
    SELECT ten.*,
      u.full_name AS tenant_name, u.phone AS tenant_phone, u.email AS tenant_email,
      t.id_number, t.passport_number,
      un.unit_number, un.type AS unit_type, un.floor_number,
      pr.name AS property_name, pr.location AS property_address,
      pr.kra_pin, pr.business_reg,
      mu.full_name AS manager_name, mu.phone AS manager_phone,
      ou.full_name AS owner_name
    FROM tenancies ten
    JOIN tenants t ON ten.tenant_id = t.id
    JOIN users u ON t.user_id = u.id
    JOIN units un ON ten.unit_id = un.id
    JOIN properties pr ON un.property_id = pr.id
    LEFT JOIN users mu ON pr.manager_id = mu.id
    LEFT JOIN users ou ON pr.owner_id = ou.id
    WHERE ten.id = ?`, [tenancy_id]);

  if (!ten) throw new Error('Tenancy not found');

  const doc = new PDFDocument({ size: 'A4', margin: 60, bufferPages: true });

  if (res) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename="Lease-Agreement-${ten.tenant_name.replace(/\s+/g,'-')}-${ten.unit_number}.pdf"`);
    doc.pipe(res);
  }

  const kes   = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
  const fmtD  = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const today = new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' });

  // ── Cover header ─────────────────────────────────────────────
  doc.rect(0, 0, 612, 130).fill('#0f172a');
  doc.fill('white').font('Helvetica-Bold').fontSize(20)
     .text('RESIDENTIAL TENANCY AGREEMENT', 60, 40, { align: 'center', width: 492 });
  doc.font('Helvetica').fontSize(11).fill('#94a3b8')
     .text(ten.property_name, 60, 70, { align: 'center', width: 492 });
  doc.fontSize(9).fill('#64748b')
     .text(`Generated: ${today}   |   Tenancy #: ${tenancy_id}`, 60, 90, { align: 'center', width: 492 });

  // ── Helper: section heading ───────────────────────────────────
  let y = 155;
  const section = (title) => {
    doc.rect(60, y, 492, 22).fill('#f1f5f9');
    doc.fill('#0f172a').font('Helvetica-Bold').fontSize(10).text(title, 66, y + 6);
    y += 30;
  };
  const field = (label, value) => {
    doc.font('Helvetica-Bold').fontSize(9).fill('#475569').text(label, 60, y, { width: 150 });
    doc.font('Helvetica').fontSize(9).fill('#1e293b').text(value || '—', 210, y, { width: 342 });
    y += 16;
  };
  const para = (text) => {
    doc.font('Helvetica').fontSize(9).fill('#334155')
       .text(text, 60, y, { width: 492, lineGap: 3 });
    y += doc.heightOfString(text, { width: 492 }) + 10;
  };

  // ── 1. PARTIES ────────────────────────────────────────────────
  section('1. PARTIES TO THIS AGREEMENT');
  field('Landlord / Agent:', ten.manager_name || ten.owner_name || ten.property_name);
  field('Manager Phone:', ten.manager_phone || '—');
  if (ten.kra_pin)    field('KRA PIN:', ten.kra_pin);
  if (ten.business_reg) field('Business Reg:', ten.business_reg);
  y += 6;
  field('Tenant Full Name:', ten.tenant_name);
  field('Tenant Phone:', ten.tenant_phone || '—');
  field('Tenant Email:', ten.tenant_email || '—');
  field('National ID / Passport:', ten.id_number || ten.passport_number || '—');
  y += 8;

  // ── 2. PROPERTY ───────────────────────────────────────────────
  section('2. RENTAL PROPERTY');
  field('Property Name:', ten.property_name);
  field('Address:', ten.property_address || '—');
  field('Unit Number:', ten.unit_number);
  field('Unit Type:', (ten.unit_type || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
  y += 8;

  // ── 3. TERM ───────────────────────────────────────────────────
  section('3. TENANCY TERM');
  field('Start Date:', fmtD(ten.start_date));
  field('End Date:', ten.end_date ? fmtD(ten.end_date) : 'Month-to-month (no fixed end)');
  field('Payment Plan:', (ten.payment_plan || 'monthly').replace(/_/g, ' '));
  y += 8;

  // ── 4. FINANCIAL TERMS ────────────────────────────────────────
  section('4. FINANCIAL TERMS');
  field('Monthly Rent:', kes(ten.rent_amount));
  field('Security Deposit:', kes(ten.deposit || 0));
  field('Grace Period:', `${ten.grace_period_days || 5} days after due date`);
  field('Late Penalty:', ten.penalty_rate ? `${ten.penalty_rate}% per month` : 'As per property policy');
  y += 8;

  // ── 5. PAYMENT TERMS ─────────────────────────────────────────
  section('5. PAYMENT TERMS');
  para(
    'Rent is due and payable on the 1st day of each calendar month unless otherwise agreed. ' +
    'Payment may be made via M-Pesa, bank transfer, or such other method as agreed in writing. ' +
    'Receipts will be issued for all payments via the SmartNyumba Pro system. ' +
    'A late penalty applies after the grace period specified above.'
  );

  // ── 6. TENANT OBLIGATIONS ─────────────────────────────────────
  section('6. TENANT OBLIGATIONS');
  const obligations = [
    'Pay rent on time and in full each month.',
    'Keep the unit clean and in good condition throughout the tenancy.',
    'Report any damage or maintenance issues promptly via the SmartNyumba portal.',
    'Not sub-let, assign, or share the unit without prior written consent.',
    'Not carry out structural alterations without written landlord approval.',
    'Comply with all reasonable house rules communicated by management.',
    'Provide 30 days written notice before vacating the unit.',
    'Return the unit in the same condition as at commencement, fair wear and tear excepted.',
  ];
  obligations.forEach((o, i) => {
    doc.font('Helvetica').fontSize(9).fill('#334155')
       .text(`${i + 1}. ${o}`, 60, y, { width: 492 });
    y += 14;
  });
  y += 6;

  // ── 7. LANDLORD OBLIGATIONS ───────────────────────────────────
  section('7. LANDLORD OBLIGATIONS');
  const landlordObs = [
    'Provide the unit in a habitable and safe condition at commencement.',
    'Carry out structural repairs and maintenance of common areas.',
    'Respect the tenant\'s right to quiet enjoyment of the premises.',
    'Give reasonable notice (minimum 24 hours) before entering the unit.',
    'Refund the security deposit within 30 days of vacation, less any legitimate deductions.',
  ];
  landlordObs.forEach((o, i) => {
    doc.font('Helvetica').fontSize(9).fill('#334155')
       .text(`${i + 1}. ${o}`, 60, y, { width: 492 });
    y += 14;
  });
  y += 6;

  // ── 8. TERMINATION ────────────────────────────────────────────
  if (y > 680) { doc.addPage(); y = 60; }
  section('8. TERMINATION');
  para(
    'Either party may terminate this tenancy by giving 30 days written notice via the SmartNyumba ' +
    'system or in writing. The landlord may terminate immediately in the event of material breach, ' +
    'non-payment of rent exceeding 30 days, or conduct endangering other residents. ' +
    'Early termination by the tenant may result in forfeiture of the security deposit.'
  );

  // ── 9. GOVERNING LAW ─────────────────────────────────────────
  section('9. GOVERNING LAW');
  para(
    'This agreement is governed by the laws of Kenya including the Landlord and Tenant (Shops, Hotels ' +
    'and Catering Establishments) Act (Cap 301), the Rent Restriction Act (Cap 296), and any applicable ' +
    'county by-laws. Any dispute shall be resolved through the Rent Tribunal or a court of competent ' +
    'jurisdiction in Kenya.'
  );

  // ── 10. SIGNATURES ────────────────────────────────────────────
  if (y > 620) { doc.addPage(); y = 60; }
  section('10. SIGNATURES');
  y += 10;
  doc.font('Helvetica').fontSize(9).fill('#334155');

  // Landlord sig box
  doc.rect(60, y, 220, 70).strokeColor('#cbd5e1').lineWidth(1).stroke();
  doc.text('LANDLORD / AGENT', 65, y + 6, { width: 210 });
  doc.text('Name: ' + (ten.manager_name || ''), 65, y + 20);
  doc.text('Signature: ___________________', 65, y + 38);
  doc.text('Date: ___________________', 65, y + 52);

  // Tenant sig box
  doc.rect(332, y, 220, 70).strokeColor('#cbd5e1').lineWidth(1).stroke();
  doc.text('TENANT', 337, y + 6, { width: 210 });
  doc.text('Name: ' + ten.tenant_name, 337, y + 20);
  doc.text('Signature: ___________________', 337, y + 38);
  doc.text('Date: ___________________', 337, y + 52);

  y += 90;

  // ── Footer ───────────────────────────────────────────────────
  doc.fill('#94a3b8').fontSize(8)
     .text('This lease was generated by SmartNyumba Pro. Both parties should retain a signed copy.',
       60, y, { align: 'center', width: 492 });

  doc.end();
  return doc;
}

module.exports = { generateLeasePdf };
