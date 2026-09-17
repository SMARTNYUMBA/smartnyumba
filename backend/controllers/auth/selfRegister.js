'use strict';

/**
 * Tenant self-registration via property invite link.
 *
 * Flow:
 *  1. Admin creates a property invite link: GET /api/auth/invite/:property_slug
 *  2. Tenant visits the link, sees a registration form
 *  3. POST /api/auth/self-register  { property_slug, full_name, phone, email, id_number, password }
 *  4. Account is created with is_active=0 (pending approval)
 *  5. Admin approves via PUT /api/users/:id/approve
 *  6. Tenant receives SMS/email notification
 */

const bcrypt = require('bcryptjs');
const pool   = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

// GET /api/auth/invite/:slug  — get property info for the registration page
exports.getInviteInfo = async (req, res) => {
  try {
    const { slug } = req.params;
    const [[prop]] = await pool.query(
      `SELECT id, name, location, description
       FROM properties
       WHERE invite_slug = ? OR LOWER(REPLACE(name,' ','-')) = ?`,
      [slug, slug.toLowerCase()]
    );
    if (!prop) return err(res, 'Invalid invite link', 404);

    ok(res, {
      property: {
        id:       prop.id,
        name:     prop.name,
        location: prop.location,
      },
    });
  } catch(e) { safeErr(res, e); }
};

// POST /api/auth/self-register  — tenant submits registration form
exports.selfRegister = async (req, res) => {
  try {
    const {
      property_slug,
      full_name,
      phone,
      email,
      id_number,
      passport_number,
      emergency_contact,
      emergency_phone,
      password,
    } = req.body;

    if (!full_name || !phone || !password)
      return err(res, 'full_name, phone and password are required', 400);
    if (password.length < 8)
      return err(res, 'Password must be at least 8 characters', 400);

    // Validate phone format
    const cleanPhone = phone.replace(/[\s\-+]/g, '');
    if (!/^(07|01|2547|2541)\d{8}$/.test(cleanPhone))
      return err(res, 'Enter a valid Kenyan phone number (07XX or 01XX)', 400);

    // Resolve property
    // BUG FIX: this used to leave property_id (and therefore org) fully
    // unresolved if the slug didn't match anything, and separately never
    // set org_id on the new user/tenant rows at all — meaning EVERY
    // self-registered tenant, for EVERY organisation, was silently
    // created under org_id=1 (the column default), regardless of which
    // property's invite link they actually used. Since `users` is
    // filtered by org_id in dozens of places across the app, this made
    // new tenants invisible to their real organisation's admins (or, for
    // whichever org happens to be org 1, visible to the wrong one). This
    // flow is documented as invite-link-based, so a slug that doesn't
    // resolve to a real property is now a hard error rather than a
    // silently-orphaned account with no property and no correct org.
    if (!property_slug) return err(res, 'A valid property invite link is required to register', 400);
    const [[prop]] = await pool.query(
      `SELECT id, org_id FROM properties WHERE invite_slug=? OR LOWER(REPLACE(name,' ','-'))=?`,
      [property_slug, property_slug.toLowerCase()]
    );
    if (!prop) return err(res, 'Invalid invite link', 404);
    const property_id = prop.id;
    const org_id       = prop.org_id;

    // Check for duplicate phone or email
    const [[dupPhone]] = await pool.query('SELECT id FROM users WHERE phone=?', [phone.trim()]);
    if (dupPhone) return err(res, 'A user with this phone number already exists', 409);

    if (email) {
      const [[dupEmail]] = await pool.query('SELECT id FROM users WHERE email=?', [email.toLowerCase().trim()]);
      if (dupEmail) return err(res, 'A user with this email already exists', 409);
    }

    const hash = await bcrypt.hash(password, 12);

    // Create user as INACTIVE (pending admin approval)
    const [ur] = await pool.query(
      `INSERT INTO users
         (full_name, phone, email, password_hash, role, is_active, property_id, id_number, passport_number, emergency_contact, emergency_phone, org_id)
       VALUES (?,?,?,?,?,0,?,?,?,?,?,?)`,
      [
        full_name.trim(),
        phone.trim(),
        email?.toLowerCase().trim() || null,
        hash,
        'tenant',
        property_id,
        id_number?.trim()           || null,
        passport_number?.trim()     || null,
        emergency_contact?.trim()   || null,
        emergency_phone?.trim()     || null,
        org_id,
      ]
    );
    const userId = ur.insertId;

    // Create tenant record
    await pool.query(
      'INSERT INTO tenants (user_id, id_number, passport_number, emergency_contact, emergency_phone, org_id) VALUES (?,?,?,?,?,?)',
      [userId, id_number?.trim() || null, passport_number?.trim() || null, emergency_contact?.trim() || null, emergency_phone?.trim() || null, org_id]
    );

    // Notify all super_admins
    // SECURITY/BUG FIX: this had no org_id filter — every new tenant
    // self-registration, for every organisation, notified super_admins
    // across the ENTIRE PLATFORM (including the tenant's full name),
    // not just the org whose property invite link they actually used.
    const [admins] = await pool.query("SELECT id FROM users WHERE role='super_admin' AND is_active=1 AND org_id=?", [org_id]);
    for (const admin of admins) {
      await pool.query(
        'INSERT INTO notifications (user_id,type,title,message,action_url) VALUES (?,?,?,?,?)',
        [admin.id, 'system', '🆕 New tenant registration',
         `${full_name} has registered and is awaiting approval.`,
         '/admin/users?pending=1']
      ).catch(() => {});
    }

    ok(res, {
      message: 'Registration submitted! An administrator will review and approve your account. You will be notified via SMS when approved.',
      user_id: userId,
      pending: true,
    }, 201);
  } catch(e) { safeErr(res, e); }
};

// PUT /api/users/:id/approve  — admin approves a pending tenant
exports.approveUser = async (req, res) => {
  try {
    // SECURITY FIX: the route restricts this to the 'super_admin' role
    // but does not restrict it to the caller's OWN organisation — this
    // query had no org_id check at all, so a super_admin of one
    // organisation could approve (activate) a pending tenant account
    // belonging to a completely different organisation just by
    // guessing/incrementing the user id.
    const [[user]] = await pool.query('SELECT * FROM users WHERE id=? AND is_active=0 AND org_id=?', [req.params.id, req.user.org_id]);
    if (!user) return err(res, 'Pending user not found', 404);

    await pool.query('UPDATE users SET is_active=1 WHERE id=? AND org_id=?', [req.params.id, req.user.org_id]);

    // Notify tenant via SMS
    const sms = require('../../services/sms');
    if (user.phone) {
      await sms.send({
        phone:   user.phone,
        message: `SmartNyumba: Hello ${user.full_name.split(' ')[0]}, your account has been approved! You can now log in at ${process.env.FRONTEND_URL || 'https://app.smartnyumba.com'}.`,
        type:    'account_approved',
        user_id: user.id,
      }).catch(() => {});
    }

    // Email notification
    const emailSvc = require('../../services/email');
    if (user.email) {
      await emailSvc.sendMail({
        to:      user.email,
        subject: 'SmartNyumba — Your account has been approved',
        html:    `<p>Hello ${user.full_name},</p><p>Your SmartNyumba account has been approved. You can now log in at <a href="${process.env.FRONTEND_URL}">${process.env.FRONTEND_URL}</a>.</p>`,
        text:    `Hello ${user.full_name}, your SmartNyumba account has been approved. Log in at ${process.env.FRONTEND_URL}.`,
      }).catch(() => {});
    }

    ok(res, { message: `${user.full_name}'s account approved and notified` });
  } catch(e) { safeErr(res, e); }
};
