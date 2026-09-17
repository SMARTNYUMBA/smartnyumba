'use strict';
// POST /api/tenancies/:id/transfer
// Moves a tenant from their current unit to any other vacant unit,
// carrying ALL their data: open invoices, payments, maintenance requests,
// ledger entries, visitor records. Old unit becomes vacant, new one occupied.

const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');
const { notify } = require('./notifications');

exports.transfer = async (req, res) => {
  const { new_unit_id, transfer_date, reason, carry_balance } = req.body;
  const tenancyId = req.params.id;

  if (!new_unit_id) return err(res, 'new_unit_id is required');

  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    // ── Load current tenancy ──────────────────────────────────
    const [[ten]] = await conn.query(
      `SELECT ten.*,
         u.unit_number AS old_unit_number, u.property_id AS old_property_id,
         p.name AS old_property_name,
         tu.full_name AS tenant_name, tu.email AS tenant_email, tu.phone AS tenant_phone,
         tu.id AS user_id
       FROM tenancies ten
       JOIN units u ON ten.unit_id = u.id
       JOIN properties p ON u.property_id = p.id
       JOIN tenants t ON ten.tenant_id = t.id
       JOIN users tu ON t.user_id = tu.id
       WHERE ten.id = ? AND ten.status IN ('active','approved') AND COALESCE(ten.org_id,1) = COALESCE(?,1)`,
      [tenancyId, req.user?.org_id || 1]);
    if (!ten) return err(res, 'Active tenancy not found', 404);

    // ── Validate new unit ─────────────────────────────────────
    // SECURITY/DATA-INTEGRITY FIX: no org check at all — a manager could
    // transfer a tenant (and their invoices, ledger, maintenance
    // requests — everything this endpoint moves) into a completely
    // different organisation's vacant unit.
    const [[newUnit]] = await conn.query(
      `SELECT u.*, p.name AS property_name, p.id AS property_id, p.manager_id
       FROM units u JOIN properties p ON u.property_id = p.id
       WHERE u.id = ? AND p.org_id = ?`, [new_unit_id, req.user?.org_id || 1]);
    if (!newUnit) return err(res, 'Target unit not found', 404);
    if (newUnit.id === ten.unit_id) return err(res, 'Tenant is already in this unit', 400);
    if (newUnit.status === 'occupied') return err(res, `Unit ${newUnit.unit_number} is already occupied`, 409);
    if (newUnit.status === 'maintenance') return err(res, `Unit ${newUnit.unit_number} is under maintenance`, 409);

    const tDate = transfer_date || new Date().toISOString().split('T')[0];

    // ── 1. Update tenancy: new unit, optionally new rent ──────
    const newRent = req.body.new_rent_amount || ten.rent_amount;
    await conn.query(
      `UPDATE tenancies SET unit_id=?, rent_amount=?,
         notes=CONCAT(IFNULL(notes,''), '\n[TRANSFER ${tDate}] From unit ${ten.old_unit_number} (${ten.old_property_name}) → ${newUnit.unit_number} (${newUnit.property_name}). Reason: ${reason || 'N/A'}')
       WHERE id=?`,
      [new_unit_id, newRent, tenancyId]);

    // ── 2. Free old unit, occupy new unit ────────────────────
    await conn.query("UPDATE units SET status='vacant'   WHERE id=?", [ten.unit_id]);
    await conn.query("UPDATE units SET status='occupied' WHERE id=?", [new_unit_id]);

    // ── 3. Move open invoices to new tenancy context ─────────
    // Invoices are tied to tenancy_id not unit_id — they follow automatically.
    // If carry_balance=false, cancel all unpaid invoices and create a fresh rent invoice.
    if (carry_balance === false || carry_balance === 'false') {
      await conn.query(
        "UPDATE invoices SET status='cancelled', notes=CONCAT(IFNULL(notes,''),' [Cancelled on unit transfer]') WHERE tenancy_id=? AND status IN ('unpaid','overdue','partial')",
        [tenancyId]);
      // Fresh rent invoice for new unit
      // DATA-INTEGRITY FIX: org_id was never set, so this always fell
      // back to the column's DEFAULT 1 regardless of the tenant's org.
      await conn.query(
        'INSERT INTO invoices (tenancy_id,type,amount,balance,due_date,notes,org_id) VALUES (?,?,?,?,?,?,?)',
        [tenancyId, 'rent', newRent, newRent, tDate, `First invoice after transfer to ${newUnit.unit_number}`, req.user?.org_id || 1]);
    }

    // ── 4. Transfer maintenance requests to new property ─────
    await conn.query(
      `UPDATE maintenance_requests SET
         unit_id=?, property_id=?,
         notes=CONCAT(IFNULL(notes,''),'\n[Transferred with tenant from unit ${ten.old_unit_number}]')
       WHERE tenancy_id=? AND status NOT IN ('completed','cancelled','closed')`,
      [new_unit_id, newUnit.property_id, tenancyId]);

    // ── 5. Ledger entry for transfer record ───────────────────
    await conn.query(
      `INSERT INTO tenant_ledger (tenancy_id,type,amount,description,ref_type)
       VALUES (?,?,?,?,?)`,
      [tenancyId, 'credit', 0,
       `Unit transfer: ${ten.old_unit_number} → ${newUnit.unit_number} on ${tDate}`,
       'transfer']);

    await conn.commit();
    conn.release();

    // ── Post-commit: notify tenant ────────────────────────────
    setImmediate(async () => {
      try {
        await notify(pool, {
          user_id: ten.user_id, type: 'tenancy',
          title: '🏠 Unit transfer confirmed',
          message: `You have been transferred from unit ${ten.old_unit_number} (${ten.old_property_name}) to unit ${newUnit.unit_number} (${newUnit.property_name}) effective ${tDate}.`,
          action_url: '/tenant',
        });
        // SMS
        try {
          const sms = require('../../services/sms');
          if (ten.tenant_phone) await sms.send({
            phone: ten.tenant_phone,
            message: `Dear ${ten.tenant_name}, you have been transferred to unit ${newUnit.unit_number} at ${newUnit.property_name} effective ${tDate}. Contact your manager for more details.`,
            type: 'transfer',
          });
        } catch (_) {}
      } catch (_) {}
    });

    ok(res, {
      message: 'Tenant transferred successfully',
      tenancy_id: tenancyId,
      old_unit: ten.old_unit_number,
      new_unit: newUnit.unit_number,
      new_property: newUnit.property_name,
    });
  } catch (e) {
    await conn.rollback();
    conn.release();
    safeErr(res, e);
  }
};

// GET /api/tenancies/:id/transfer-options
// Returns the current tenancy detail + vacant units across all properties
exports.getOptions = async (req, res) => {
  try {
    // SECURITY FIX: no org check at all — this returned any organisation's
    // tenancy detail, and listed vacant units across every organisation
    // on the platform as valid transfer targets (which fed directly into
    // the same missing check in transfer() above).
    const [[ten]] = await pool.query(
      `SELECT ten.*, u.unit_number, u.rent_amount AS unit_rent,
         p.name AS property_name, p.id AS property_id
       FROM tenancies ten
       JOIN units u ON ten.unit_id = u.id
       JOIN properties p ON u.property_id = p.id
       WHERE ten.id = ? AND ten.org_id = ?`, [req.params.id, req.user.org_id]);
    if (!ten) return err(res, 'Tenancy not found', 404);

    const [vacantUnits] = await pool.query(
      `SELECT u.id, u.unit_number, u.floor, u.type, u.rent_amount,
         p.id AS property_id, p.name AS property_name, p.location
       FROM units u JOIN properties p ON u.property_id = p.id
       WHERE u.status = 'vacant' AND u.id != ? AND p.org_id = ?
       ORDER BY p.name, u.floor, u.unit_number`,
      [ten.unit_id, req.user.org_id]);

    ok(res, { tenancy: ten, vacant_units: vacantUnits });
  } catch(e) { safeErr(res, e); }
};
