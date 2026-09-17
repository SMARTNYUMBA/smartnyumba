'use strict';

const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');
const { notify }  = require('./notifications');

// ── GET all tenancies ─────────────────────────────────────────
exports.getAll = async (req, res) => {
  try {
    let sql = `
      SELECT ten.*,
        u.full_name AS tenant_name, u.phone AS tenant_phone, u.email AS tenant_email,
        un.unit_number, pr.name AS property_name, pr.id AS property_id,
        (SELECT MAX(paid_at) FROM payments WHERE tenancy_id = ten.id) AS last_payment_date
      FROM tenancies ten
      JOIN tenants t  ON ten.tenant_id = t.id
      JOIN users u    ON t.user_id = u.id
      JOIN units un   ON ten.unit_id = un.id
      JOIN properties pr ON un.property_id = pr.id
      WHERE 1=1`;
    const params = [];
    // SECURITY FIX: no org filter at all previously — any authenticated
    // user could list every tenancy across every organisation.
    sql += ' AND ten.org_id=?'; params.push(req.user.org_id);
    if (req.query.status)      { sql += ' AND ten.status=?';   params.push(req.query.status); }
    if (req.query.tenant_id)   { sql += ' AND ten.tenant_id=?'; params.push(req.query.tenant_id); }
    if (req.query.property_id) { sql += ' AND pr.id=?';         params.push(req.query.property_id); }
    if (req.user.role === 'property_manager' && req.user.property_id) {
      sql += ' AND pr.id=?'; params.push(req.user.property_id);
    }
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;
    // Count total for pagination
    const countSql = 'SELECT COUNT(*) AS total FROM tenancies ten JOIN tenants t ON ten.tenant_id=t.id JOIN users u ON t.user_id=u.id JOIN units un ON ten.unit_id=un.id JOIN properties pr ON un.property_id=pr.id WHERE 1=1' + sql.split('WHERE 1=1')[1].split('ORDER BY')[0];
    const [[{ total }]] = await pool.query(countSql, params).catch(() => [[{ total: 0 }]]);
    sql += ` ORDER BY ten.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    const [rows] = await pool.query(sql, params);
    ok(res, { tenancies: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch(e) { safeErr(res, e); }
};

// ── CREATE tenancy ────────────────────────────────────────────
exports.create = async (req, res) => {
  try {
    const {
      tenant_id, unit_id, start_date, end_date,
      rent_amount, deposit, payment_plan, grace_period_days,
      penalty_rate, move_in_checklist,
    } = req.body;

    if (!tenant_id || !unit_id || !start_date || !rent_amount)
      return err(res, 'tenant_id, unit_id, start_date and rent_amount are required');

    // Strip the "|rent" suffix the frontend may append to unit_id
    const realUnitId = String(unit_id).includes('|') ? String(unit_id).split('|')[0] : String(unit_id);

    // ── Guard 1: tenant exists — accept either tenants.id or users.id ──
    // SECURITY FIX: neither lookup checked org_id — a user could create a
    // tenancy for another organisation's tenant.
    let [[tenantRow]] = await pool.query(
      'SELECT t.id AS tenant_id, u.full_name, u.email, u.phone, u.id AS user_id FROM tenants t JOIN users u ON t.user_id=u.id WHERE t.id=? AND t.org_id=?',
      [tenant_id, req.user.org_id]);
    // Fallback: maybe tenant_id is actually the users.id (sent by older frontend)
    if (!tenantRow) {
      [[tenantRow]] = await pool.query(
        'SELECT t.id AS tenant_id, u.full_name, u.email, u.phone, u.id AS user_id FROM tenants t JOIN users u ON t.user_id=u.id WHERE u.id=? AND t.org_id=?',
        [tenant_id, req.user.org_id]);
    }
    if (!tenantRow) return err(res, 'Tenant not found — make sure you selected a registered tenant', 404);
    // Normalise: always use the tenants.id for subsequent queries
    const normalised_tenant_id = tenantRow.tenant_id;

    // ── Guard 2: unit exists and is vacant ──
    // SECURITY FIX: no org check — a user could assign a tenant to
    // another organisation's unit.
    const [[unitRow]] = await pool.query(
      'SELECT u.id, u.unit_number, u.status, u.rent_amount, p.name AS property_name, p.id AS property_id, p.manager_id FROM units u JOIN properties p ON u.property_id=p.id WHERE u.id=? AND u.org_id=?',
      [realUnitId, req.user.org_id]);
    if (!unitRow) return err(res, 'Unit not found', 404);
    if (unitRow.status === 'occupied') return err(res, `Unit ${unitRow.unit_number} is already occupied. Terminate the existing tenancy first.`, 409);
    if (unitRow.status === 'maintenance') return err(res, `Unit ${unitRow.unit_number} is under maintenance and cannot be assigned.`, 409);

    // ── Guard 3: block if tenant already has ANY active tenancy (any unit, any property) ──
    // This is the main guard preventing duplicate tenancies for the same person.
    // Pass ?allow_duplicate=1 in the request body ONLY if you intentionally want to override.
    if (!req.body.allow_duplicate) {
      const [[existingTenancy]] = await pool.query(
        `SELECT ten.id, un.unit_number, pr.name AS property_name
         FROM tenancies ten
         JOIN units un ON ten.unit_id = un.id
         JOIN properties pr ON un.property_id = pr.id
         WHERE ten.tenant_id=? AND ten.status IN('active','approved') LIMIT 1`,
        [normalised_tenant_id]);
      if (existingTenancy) {
        return err(res,
          `${tenantRow.full_name} already has an active tenancy on unit ${existingTenancy.unit_number} at ${existingTenancy.property_name}. ` +
          `Terminate it first, or set allow_duplicate=true to override (not recommended).`,
          409);
      }
    }

    // ── Guard 4: no duplicate active tenancy for this tenant on the same unit ──
    const [[dup]] = await pool.query(
      "SELECT id FROM tenancies WHERE tenant_id=? AND unit_id=? AND status IN('active','approved') LIMIT 1",
      [normalised_tenant_id, realUnitId]);
    if (dup) return err(res, 'This tenant already has an active tenancy on this unit', 409);

    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      // Insert tenancy
      // DATA-INTEGRITY FIX: org_id was never set here either — stamp it
      // explicitly rather than rely on the column default.
      const [r] = await conn.query(
        `INSERT INTO tenancies
           (tenant_id, unit_id, start_date, end_date, rent_amount, deposit,
            payment_plan, grace_period_days, penalty_rate, status, move_in_checklist, org_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          normalised_tenant_id, realUnitId, start_date, end_date || null,
          rent_amount, deposit || 0,
          payment_plan || 'monthly',
          grace_period_days || null,
          penalty_rate || null,
          'active',
          move_in_checklist ? JSON.stringify(move_in_checklist) : null,
          req.user.org_id,
        ]);

      const tenancyId = r.insertId;

      // Mark unit occupied
      await conn.query("UPDATE units SET status='occupied' WHERE id=?", [realUnitId]);

      // Deposit invoice
      if (Number(deposit) > 0) {
        await conn.query(
          'INSERT INTO invoices (tenancy_id,type,amount,balance,due_date,org_id) VALUES (?,?,?,?,?,?)',
          [tenancyId, 'deposit', deposit, deposit, start_date, req.user.org_id]);
      }

      // First month rent invoice
      const dueDate = new Date(start_date);
      await conn.query(
        'INSERT INTO invoices (tenancy_id,type,amount,balance,due_date,month_year,org_id) VALUES (?,?,?,?,?,?,?)',
        [tenancyId, 'rent', rent_amount, rent_amount, start_date,
         `${dueDate.getFullYear()}-${String(dueDate.getMonth()+1).padStart(2,'0')}`, req.user.org_id]);

      await conn.commit();
      conn.release();

      // ── Post-commit: notifications (non-fatal) ──
      setImmediate(async () => {
        try {
          // FEATURE: fire tenancy.created for org webhook subscribers.
          require('../../services/webhooks').deliverEvent('tenancy.created', {
            tenancy_id: tenancyId, tenant_id: normalised_tenant_id, unit_id: realUnitId,
            unit_number: unitRow.unit_number, property_id: unitRow.property_id,
            rent_amount: Number(rent_amount), start_date,
          }, req.user.org_id);
          // In-app notification
          await notify(pool, {
            user_id: tenantRow.user_id, type: 'tenancy',
            title: '🏠 Tenancy created',
            message: `Your tenancy for unit ${unitRow.unit_number} at ${unitRow.property_name} is active. Rent: KES ${Number(rent_amount).toLocaleString()}/mo.`,
            action_url: '/tenant',
          });

          const msg = 'Welcome to ' + unitRow.property_name + '! Your tenancy for unit ' +
            unitRow.unit_number + ' starts ' + start_date + '. Rent: KES ' +
            Number(rent_amount).toLocaleString() + '/mo. Log in at SmartNyumba to view your account.';

          // SMS
          try {
            const sms = require('../../services/sms');
            if (tenantRow.phone) await sms.send({ phone: tenantRow.phone, message: msg, type: 'tenancy', user_id: tenantRow.user_id });
          } catch (_) {}

          // WhatsApp
          try {
            const wa = require('../../services/whatsapp');
            if (tenantRow.phone) await wa.send({ phone: tenantRow.phone, message: msg, type: 'tenancy', user_id: tenantRow.user_id });
          } catch (_) {}

          // Welcome email
          try {
            const emailSvc = require('../../services/email');
            if (tenantRow.email) {
              await emailSvc.sendWelcome({
                to: tenantRow.email,
                tenant_name: tenantRow.full_name,
                unit_number: unitRow.unit_number,
                property_name: unitRow.property_name,
                start_date,
                rent_amount,
                deposit: deposit || 0,
              });
            }
          } catch (_) {}

          // Notify manager — only if manager is not the same as tenant and has admin role
          if (unitRow.manager_id && unitRow.manager_id !== tenantRow.user_id) {
            try {
              const [[mgr]] = await pool.query("SELECT role FROM users WHERE id=?", [unitRow.manager_id]);
              if (mgr && ['super_admin','property_manager'].includes(mgr.role)) {
                await notify(pool, {
                  user_id: unitRow.manager_id, type: 'tenancy',
                  title: `New tenancy — ${tenantRow.full_name}`,
                  message: `${tenantRow.full_name} has been assigned to unit ${unitRow.unit_number}. Rent: KES ${Number(rent_amount).toLocaleString()}/mo.`,
                  action_url: '/tenancies', // frontend resolveUrl maps to correct portal
                });
              }
            } catch (_) {}
          }
        } catch (notifyErr) {
          global.logger?.warn('Post-tenancy notifications failed: ' + notifyErr.message);
        }
      });

      ok(res, { id: tenancyId, message: 'Tenancy created successfully' }, 201);
    } catch (e2) {
      await conn.rollback();
      conn.release();
      throw e2;
    }
  } catch(e) { safeErr(res, e); }
};

// ── TERMINATE / UPDATE tenancy ────────────────────────────────
exports.terminate = async (req, res) => {
  try {
    const { status, end_date } = req.body;
    // SECURITY FIX: previously no org check — any authenticated user
    // could terminate (or reactivate) another organisation's tenancy.
    const [[ten]] = await pool.query('SELECT * FROM tenancies WHERE id=? AND org_id=?', [req.params.id, req.user.org_id]);
    if (!ten) return err(res, 'Tenancy not found', 404);
    const finalStatus = status || 'terminated';
    const finalDate   = end_date || new Date().toISOString().split('T')[0];
    await pool.query('UPDATE tenancies SET status=?,end_date=? WHERE id=? AND org_id=?', [finalStatus, finalDate, req.params.id, req.user.org_id]);
    if (finalStatus === 'terminated' || finalStatus === 'vacating') {
      await pool.query("UPDATE units SET status='vacant' WHERE id=?", [ten.unit_id]);
      // Notify tenant
      const [[t]] = await pool.query(
        'SELECT u.id AS user_id FROM tenants t JOIN users u ON t.user_id=u.id WHERE t.id=?', [ten.tenant_id]);
      if (t) await notify(pool, { user_id: t.user_id, type: 'tenancy', title: 'Tenancy ended',
        message: `Your tenancy has been marked as ${finalStatus}.`, action_url: '/tenant' });
      // FEATURE: fire tenancy.terminated for org webhook subscribers.
      require('../../services/webhooks').deliverEvent('tenancy.terminated', {
        tenancy_id: Number(req.params.id), unit_id: ten.unit_id, status: finalStatus, end_date: finalDate,
      }, req.user.org_id);
    }
    ok(res, { message: 'Tenancy updated' });
  } catch(e) { safeErr(res, e); }
};

// ── UPLOAD lease document ─────────────────────────────────────
exports.uploadLease = async (req, res) => {
  try {
    if (!req.file) return err(res, 'No file uploaded');
    const url = `/uploads/leases/${req.file.filename}`;
    // SECURITY FIX: previously no existence check and no org check at
    // all — anyone could attach an uploaded file to any tenancy in the
    // entire system just by guessing its ID.
    const [r] = await pool.query('UPDATE tenancies SET lease_document=? WHERE id=? AND org_id=?',
      [url, req.params.id, req.user.org_id]);
    if (r.affectedRows === 0) return err(res, 'Tenancy not found', 404);
    ok(res, { lease_document: url, message: 'Lease document uploaded' });
  } catch(e) { safeErr(res, e); }
};
