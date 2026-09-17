'use strict';

/**
 * SmartNyumba Pro — Flutterwave Payment Service
 *
 * Required env vars (set in .env):
 *   FLUTTERWAVE_SECRET_KEY   — sk_live_... from dashboard.flutterwave.com
 *   FLUTTERWAVE_PUBLIC_KEY   — pk_live_... (used in frontend)
 *   FLUTTERWAVE_WEBHOOK_HASH — secret hash for webhook verification (set in FW dashboard)
 *   FRONTEND_URL             — https://yourdomain.com (for redirect after payment)
 *
 * Test keys (from Flutterwave sandbox):
 *   FLUTTERWAVE_SECRET_KEY=FLWSECK_TEST-...
 *   FLUTTERWAVE_PUBLIC_KEY=FLWPUBK_TEST-...
 *
 * Docs: https://developer.flutterwave.com/docs
 */

const https = require('https');

const BASE_URL = 'https://api.flutterwave.com/v3';

function request(method, path, body, secretKey) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      method,
      hostname: 'api.flutterwave.com',
      path:     `/v3${path}`,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${secretKey}`,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error('Invalid JSON from Flutterwave: ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/**
 * Initiate a hosted payment page (Standard checkout).
 * Returns { url } — redirect the user here.
 */
async function initiatePayment({ amount, currency = 'KES', description, customer, redirect_url, meta = {} }) {
  const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!secretKey) throw new Error('FLUTTERWAVE_SECRET_KEY not set in .env');

  const tx_ref = `SNP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const payload = {
    tx_ref,
    amount,
    currency,
    redirect_url,
    meta,
    customer: {
      email: customer.email,
      name:  customer.name,
    },
    customizations: {
      title:       'SmartNyumba Pro',
      description,
      logo:        `${process.env.FRONTEND_URL || ''}/logo.png`,
    },
    payment_options: 'card,mobilemoneyrwanda,mpesa,mobilemoneyuganda',
  };

  const result = await request('POST', '/payments', payload, secretKey);
  if (result.status !== 'success') {
    throw new Error(result.message || 'Flutterwave payment initiation failed');
  }

  return { url: result.data.link, tx_ref };
}

/**
 * Verify a completed transaction by ID.
 * Call this in your webhook handler to confirm payment before activating plan.
 */
async function verifyTransaction(transaction_id) {
  const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!secretKey) throw new Error('FLUTTERWAVE_SECRET_KEY not set in .env');

  const result = await request('GET', `/transactions/${transaction_id}/verify`, null, secretKey);
  if (result.status !== 'success') throw new Error('Transaction verification failed');
  return result.data; // { status, amount, currency, customer, meta, ... }
}

/**
 * Verify Flutterwave webhook signature.
 * Call this at the top of your webhook handler.
 */
function verifyWebhookSignature(req) {
  const hash = process.env.FLUTTERWAVE_WEBHOOK_HASH;
  if (!hash) {
    // FIX: previously returned true (skip check) when unconfigured — that
    // meant an operator who forgot to set this in production silently got
    // zero webhook protection instead of an obvious failure. Fail closed
    // in production; still allow local/sandbox testing without it configured.
    if (process.env.NODE_ENV === 'production') {
      global.logger?.error('FLUTTERWAVE_WEBHOOK_HASH not set in production — rejecting webhook');
      return false;
    }
    global.logger?.warn('FLUTTERWAVE_WEBHOOK_HASH not set — skipping webhook signature check (dev only)');
    return true;
  }
  return req.headers['verif-hash'] === hash;
}

/**
 * Get a list of all plans (for display).
 */
const PLANS = {
  starter: {
    name: 'Starter', price_kes: 2999, price_usd: 23,
    max_units: 50, max_users: 5, max_properties: 3, sms_included: 200,
    features: ['Up to 50 units', '5 user accounts', '3 properties', 'M-Pesa payments', 'SMS & Email', 'PDF reports'],
  },
  professional: {
    name: 'Professional', price_kes: 9999, price_usd: 77,
    max_units: 500, max_users: 25, max_properties: 20, sms_included: 2000,
    features: ['Up to 500 units', '25 user accounts', '20 properties', 'Everything in Starter', 'Bulk SMS', 'API access', 'WhatsApp notifications', 'Advanced reports'],
  },
  enterprise: {
    name: 'Enterprise', price_kes: null, price_usd: null,
    max_units: 99999, max_users: 9999, max_properties: 9999, sms_included: 99999,
    features: ['Unlimited units', 'Unlimited users', 'White-label branding', 'Custom domain', 'Dedicated support', 'SLA guarantee', 'SSO integration', 'Custom reports'],
  },
};

module.exports = { initiatePayment, verifyTransaction, verifyWebhookSignature, PLANS };
