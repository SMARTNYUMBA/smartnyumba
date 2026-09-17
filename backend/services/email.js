// backend/services/email.js  — NEW FILE
// Nodemailer-based email service for receipts, reminders, and notifications
// Configure via Settings: smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from_name

const pool = require('../config/db');

let transporterCache = null;
let transporterBuiltAt = 0;

async function getTransporter() {
  // Rebuild transporter if settings may have changed (cache for 5 min)
  if (transporterCache && Date.now() - transporterBuiltAt < 5 * 60 * 1000) return transporterCache;

  try {
    const [settings] = await pool.query(
      "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from_name','email_enabled')");
    const cfg = Object.fromEntries(settings.map(s => [s.setting_key, s.setting_value]));

    if (cfg.email_enabled !== '1' || !cfg.smtp_host || !cfg.smtp_user || !cfg.smtp_pass) {
      return null;
    }

    const nodemailer = require('nodemailer');
    transporterCache = nodemailer.createTransport({
      host: cfg.smtp_host,
      port: parseInt(cfg.smtp_port || 587),
      secure: parseInt(cfg.smtp_port) === 465,
      auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
    });
    transporterCache._fromName = cfg.smtp_from_name || 'SmartNyumba';
    transporterCache._fromEmail = cfg.smtp_user;
    transporterBuiltAt = Date.now();
    return transporterCache;
  } catch (e) {
    console.error('Email transporter init error:', e.message);
    return null;
  }
}


// ── HTML Email Template Engine ──────────────────────────────────────────────
function htmlTemplate({ title, preheader = '', body, footer = '', accentColor = '#E07B39' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title}</title>
  <style>
    body{margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
    .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
    .header{background:${accentColor};padding:28px 32px;text-align:center}
    .header h1{margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-.3px}
    .header p{margin:4px 0 0;color:rgba(255,255,255,.85);font-size:13px}
    .body{padding:32px}
    .body p{margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6}
    .body h2{margin:0 0 12px;color:#111827;font-size:17px;font-weight:600}
    .kv-table{width:100%;border-collapse:collapse;margin:20px 0}
    .kv-table tr{border-bottom:1px solid #f3f4f6}
    .kv-table td{padding:10px 12px;font-size:13px}
    .kv-table td:first-child{color:#6b7280;width:40%}
    .kv-table td:last-child{color:#111827;font-weight:500;text-align:right}
    .kv-table tr.total td{font-weight:700;font-size:15px;border-top:2px solid #e5e7eb;border-bottom:none}
    .btn{display:inline-block;margin:20px 0 8px;padding:12px 28px;background:${accentColor};color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600}
    .alert{background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:4px;margin:16px 0;font-size:13px;color:#92400e}
    .alert.red{background:#fee2e2;border-color:#ef4444;color:#991b1b}
    .alert.green{background:#d1fae5;border-color:#10b981;color:#065f46}
    .footer{background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;text-align:center;font-size:12px;color:#9ca3af;line-height:1.6}
  </style>
</head>
<body>
  <div style="display:none;max-height:0;overflow:hidden">${preheader}</div>
  <div class="wrap">
    <div class="header">
      <h1>🏠 SmartNyumba Pro</h1>
      <p>Property Management System</p>
    </div>
    <div class="body">${body}</div>
    <div class="footer">
      ${footer || 'SmartNyumba Pro &bull; Automated notification &bull; Do not reply to this email'}
    </div>
  </div>
</body>
</html>`;
}

// ── Specific email builders ──────────────────────────────────────────────────
function buildReceiptEmail({ tenant_name, receipt_number, amount, payment_method, paid_at, unit, property }) {
  const formattedAmount = `KES ${Number(amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
  const formattedDate = paid_at ? new Date(paid_at).toLocaleDateString('en-KE', { dateStyle: 'long' }) : 'N/A';
  return {
    subject: `✅ Payment Receipt ${receipt_number} — ${formattedAmount}`,
    html: htmlTemplate({
      title: `Payment Receipt ${receipt_number}`,
      preheader: `Your payment of ${formattedAmount} has been received.`,
      body: `
        <h2>Payment Received</h2>
        <p>Hi ${tenant_name},</p>
        <p>We have received your payment. Here are the details:</p>
        <table class="kv-table">
          <tr><td>Receipt No.</td><td>${receipt_number}</td></tr>
          <tr><td>Property</td><td>${property}</td></tr>
          <tr><td>Unit</td><td>${unit}</td></tr>
          <tr><td>Payment Method</td><td>${payment_method || 'M-Pesa'}</td></tr>
          <tr><td>Date</td><td>${formattedDate}</td></tr>
          <tr class="total"><td>Amount Paid</td><td>${formattedAmount}</td></tr>
        </table>
        <div class="alert green">✅ Your account has been updated. Thank you for your payment!</div>
      `,
    }),
    text: `Payment Receipt ${receipt_number}
Amount: ${formattedAmount}
Date: ${formattedDate}
Thank you, ${tenant_name}!`,
  };
}

function buildRentReminderEmail({ tenant_name, amount, due_date, unit, property, days_until_due }) {
  const formattedAmount = `KES ${Number(amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
  const formattedDate = new Date(due_date).toLocaleDateString('en-KE', { dateStyle: 'long' });
  const isOverdue = days_until_due < 0;
  const urgency = isOverdue ? 'red' : days_until_due <= 3 ? 'red' : '';
  return {
    subject: isOverdue
      ? `⚠️ Overdue Rent — ${property} ${unit}`
      : `🔔 Rent Due ${days_until_due === 0 ? 'Today' : `in ${days_until_due} days`} — ${formattedAmount}`,
    html: htmlTemplate({
      title: 'Rent Reminder',
      preheader: `Rent of ${formattedAmount} is due ${formattedDate}.`,
      body: `
        <h2>${isOverdue ? '⚠️ Overdue Rent Notice' : '🔔 Rent Reminder'}</h2>
        <p>Hi ${tenant_name},</p>
        <p>${isOverdue
          ? `Your rent payment is <strong>overdue</strong>. Please pay immediately to avoid penalties.`
          : `This is a friendly reminder that your rent is due on <strong>${formattedDate}</strong>.`
        }</p>
        <table class="kv-table">
          <tr><td>Property</td><td>${property}</td></tr>
          <tr><td>Unit</td><td>${unit}</td></tr>
          <tr><td>Due Date</td><td>${formattedDate}</td></tr>
          <tr class="total"><td>Amount Due</td><td>${formattedAmount}</td></tr>
        </table>
        <div class="alert ${urgency}">
          ${isOverdue
            ? '⚠️ Late fees may apply. Please contact your property manager if you need assistance.'
            : '💡 Pay via M-Pesa through your tenant portal for instant confirmation.'}
        </div>
      `,
    }),
    text: `Rent Reminder: ${formattedAmount} due ${formattedDate} for ${property} ${unit}.`,
  };
}

function buildInvoiceEmail({ tenant_name, invoice_type, amount, due_date, description, unit, property }) {
  const formattedAmount = `KES ${Number(amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
  const formattedDate = new Date(due_date).toLocaleDateString('en-KE', { dateStyle: 'long' });
  return {
    subject: `📄 New Invoice — ${invoice_type.replace(/_/g,' ')} ${formattedAmount}`,
    html: htmlTemplate({
      title: 'New Invoice',
      preheader: `A new invoice of ${formattedAmount} has been generated for your account.`,
      body: `
        <h2>New Invoice Generated</h2>
        <p>Hi ${tenant_name},</p>
        <p>A new invoice has been added to your account:</p>
        <table class="kv-table">
          <tr><td>Type</td><td>${invoice_type.replace(/_/g,' ')}</td></tr>
          <tr><td>Description</td><td>${description || '—'}</td></tr>
          <tr><td>Property</td><td>${property}</td></tr>
          <tr><td>Unit</td><td>${unit}</td></tr>
          <tr><td>Due Date</td><td>${formattedDate}</td></tr>
          <tr class="total"><td>Amount</td><td>${formattedAmount}</td></tr>
        </table>
        <div class="alert">💡 Log in to your tenant portal to view and pay this invoice.</div>
      `,
    }),
    text: `New Invoice: ${formattedAmount} for ${invoice_type} due ${formattedDate}.`,
  };
}

function buildPasswordResetEmail({ full_name, reset_link, expires_minutes = 30 }) {
  return {
    subject: '🔐 Reset Your SmartNyumba Password',
    html: htmlTemplate({
      title: 'Password Reset',
      preheader: 'Someone requested a password reset for your SmartNyumba account.',
      body: `
        <h2>Password Reset Request</h2>
        <p>Hi ${full_name},</p>
        <p>We received a request to reset your SmartNyumba Pro password. Click the button below to set a new password:</p>
        <div style="text-align:center">
          <a href="${reset_link}" class="btn">Reset My Password</a>
        </div>
        <p style="font-size:12px;color:#6b7280;text-align:center">This link expires in ${expires_minutes} minutes.</p>
        <div class="alert">🛡️ If you did not request this reset, ignore this email — your password will not change.</div>
      `,
    }),
    text: `Reset your SmartNyumba password: ${reset_link} (expires in ${expires_minutes} minutes)`,
  };
}

function buildLeaseExpiryEmail({ tenant_name, unit, property, expiry_date, days_remaining }) {
  const formattedDate = new Date(expiry_date).toLocaleDateString('en-KE', { dateStyle: 'long' });
  return {
    subject: `📋 Lease Expiry Notice — ${days_remaining} days remaining`,
    html: htmlTemplate({
      title: 'Lease Expiry Notice',
      preheader: `Your lease expires in ${days_remaining} days on ${formattedDate}.`,
      body: `
        <h2>Lease Expiry Notice</h2>
        <p>Hi ${tenant_name},</p>
        <p>Your tenancy agreement is approaching its end date:</p>
        <table class="kv-table">
          <tr><td>Property</td><td>${property}</td></tr>
          <tr><td>Unit</td><td>${unit}</td></tr>
          <tr><td>Expiry Date</td><td>${formattedDate}</td></tr>
          <tr><td>Days Remaining</td><td>${days_remaining} days</td></tr>
        </table>
        <div class="alert">📞 Please contact your property manager to discuss renewal or vacate arrangements.</div>
      `,
    }),
    text: `Your lease for ${unit} at ${property} expires ${formattedDate} (${days_remaining} days remaining).`,
  };
}

module.exports.htmlTemplate = htmlTemplate;
module.exports.buildReceiptEmail = buildReceiptEmail;
module.exports.buildRentReminderEmail = buildRentReminderEmail;
module.exports.buildInvoiceEmail = buildInvoiceEmail;
module.exports.buildPasswordResetEmail = buildPasswordResetEmail;
module.exports.buildLeaseExpiryEmail = buildLeaseExpiryEmail;

async function sendMail({ to, subject, html, text }) {
  const transporter = await getTransporter();
  if (!transporter) {
    console.log(`Email (disabled/unconfigured) to ${to}: ${subject}`);
    return { success: false, reason: 'email not configured' };
  }
  try {
    const info = await transporter.sendMail({
      from: `"${transporter._fromName}" <${transporter._fromEmail}>`,
      to, subject, html, text,
    });
    return { success: true, messageId: info.messageId };
  } catch (e) {
    const now = Date.now();
    if (!global._lastEmailErrLog || now - global._lastEmailErrLog > 3600000) {
      console.error('Email send error (further errors suppressed for 1h):', e.message);
      global._lastEmailErrLog = now;
    }
    return { success: false, error: e.message };
  }
}

// ── Templates ─────────────────────────────────────────────────

function baseTemplate(content) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 20px; }
    .container { max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    .header { background: linear-gradient(135deg, #0369a1, #0284c7); padding: 28px 32px; }
    .header h1 { color: white; margin: 0; font-size: 20px; font-weight: 700; }
    .header p { color: #bae6fd; margin: 4px 0 0; font-size: 13px; }
    .body { padding: 28px 32px; }
    .amount-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px; padding: 18px; text-align: center; margin: 20px 0; }
    .amount-box .amount { font-size: 32px; font-weight: 700; color: #0369a1; }
    .amount-box .label { font-size: 12px; color: #64748b; margin-top: 4px; }
    .details { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .details td { padding: 8px 4px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
    .details td:first-child { color: #64748b; width: 40%; }
    .details td:last-child { color: #1e293b; font-weight: 500; }
    .badge-green { background: #dcfce7; color: #166534; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 500; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 32px; text-align: center; font-size: 11px; color: #94a3b8; }
    .btn { display: inline-block; background: #0284c7; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>SmartNyumba RMS</h1>
      <p>Rental Management System</p>
    </div>
    <div class="body">${content}</div>
    <div class="footer">This is an automated message from SmartNyumba RMS. Please do not reply to this email.</div>
  </div>
</body>
</html>`;
}

// BUG FIX: this function was declared a second time near the bottom of
// this file (see "Payment receipt (called from payments controller)"
// below) with a different parameter shape (`to` instead of `email`,
// no `buildReceiptEmail`/`paid_at`). In JavaScript, a later function
// declaration with the same name silently overwrites an earlier one in
// the same scope — so THIS version could never actually run; only the
// second one is exported and callable. Confirmed via grep that no
// caller anywhere in the app used the `email:`/`paid_at` shape this
// version expected, so removing it changes no behavior — it was already
// 100% dead code, just confusing to read. Kept the working one below.
async function sendRentReminder({ tenant_name, email, amount, unit_number, property_name, due_date }) {
  if (!email) return { success: false, reason: 'no email' };
  const daysUntil = Math.ceil((new Date(due_date) - new Date()) / 86400000);
  const { subject, html, text } = buildRentReminderEmail({
    tenant_name, amount,
    due_date, unit: unit_number || 'N/A',
    property: property_name || 'N/A',
    days_until_due: daysUntil,
  });
  return sendMail({ to: email, subject, html, text });
}


async function sendLeaseExpiry({ tenant_name, email, unit_number, property_name, end_date, days_remaining }) {
  if (!email) return { success: false, reason: 'no email' };
  const { subject, html, text } = buildLeaseExpiryEmail({
    tenant_name, unit: unit_number || 'N/A',
    property: property_name || 'N/A',
    expiry_date: end_date,
    days_remaining,
  });
  return sendMail({ to: email, subject, html, text });
}


async function sendWelcome({ to, tenant_name, unit_number, property_name, start_date, rent_amount, deposit }) {
  if (!to) return { success: false, reason: 'no email' };
  const name = tenant_name.split(' ')[0];
  const html = baseTemplate(`
    <p style="color:#1e293b;font-size:15px;">Dear <strong>${name}</strong>, welcome to <strong>${property_name}</strong>!</p>
    <p style="color:#64748b;font-size:13px;">Your tenancy has been set up. Here are your details:</p>
    <table class="details" style="margin-top:16px;">
      <tr><td>Unit</td><td><strong>${unit_number}</strong></td></tr>
      <tr><td>Property</td><td>${property_name}</td></tr>
      <tr><td>Start date</td><td>${start_date}</td></tr>
      <tr><td>Monthly rent</td><td><strong>KES ${Number(rent_amount).toLocaleString()}</strong></td></tr>
      <tr><td>Deposit</td><td>KES ${Number(deposit||0).toLocaleString()}</td></tr>
    </table>
    <p style="color:#64748b;font-size:13px;margin-top:16px;">Log in to the SmartNyumba tenant portal to view your invoices, make payments, and submit maintenance requests.</p>
    <p style="color:#64748b;font-size:12px;">If you have any questions, please contact your property manager.</p>
  `);
  return sendMail({
    to, subject: 'Welcome to ' + property_name + ' — SmartNyumba',
    html, text: 'Dear ' + name + ', welcome! Your tenancy for unit ' + unit_number + ' at ' + property_name + ' starts ' + start_date + '. Monthly rent: KES ' + Number(rent_amount).toLocaleString() + '.',
  });
}

// ── Payment receipt (called from payments controller) ──────────
async function sendPaymentReceipt({ to, tenant_name, receipt_number, amount, payment_method, transaction_code, unit_number, property_name }) {
  if (!to) return { success: false, reason: 'no email' };
  const name = tenant_name.split(' ')[0];
  const dateStr = new Date().toLocaleDateString('en-KE', { year:'numeric', month:'long', day:'numeric' });
  const html = baseTemplate(`
    <p style="color:#1e293b;font-size:15px;">Dear <strong>${name}</strong>,</p>
    <p style="color:#64748b;font-size:13px;">Your payment has been received. Here is your receipt:</p>
    <div class="amount-box">
      <div class="amount">KES ${Number(amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</div>
      <div class="label">Receipt: ${receipt_number}</div>
    </div>
    <table class="details">
      <tr><td>Date</td><td>${dateStr}</td></tr>
      <tr><td>Unit</td><td>${unit_number}</td></tr>
      <tr><td>Property</td><td>${property_name||''}</td></tr>
      <tr><td>Payment method</td><td style="text-transform:capitalize;">${(payment_method||'').replace('_',' ')}</td></tr>
      ${transaction_code ? '<tr><td>Reference</td><td>' + transaction_code + '</td></tr>' : ''}
    </table>
    <p style="color:#64748b;font-size:12px;margin-top:16px;">Please keep this receipt for your records.</p>
  `);
  return sendMail({
    to, subject: '✓ Payment Receipt ' + receipt_number + ' — KES ' + Number(amount).toLocaleString() + ' | SmartNyumba',
    html, text: 'Dear ' + name + ', your payment of KES ' + Number(amount).toLocaleString() + ' has been received. Receipt: ' + receipt_number + '.',
  });
}

module.exports = { sendMail, sendPaymentReceipt, sendRentReminder, sendLeaseExpiry, sendWelcome };