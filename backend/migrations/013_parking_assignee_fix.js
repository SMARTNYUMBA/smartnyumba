'use strict';
/**
 * Migration 013 — Fix parking_slots assignment tracking
 *
 * Two real bugs this closes:
 *
 * 1. assigned_to_type was ENUM('unassigned','tenant','visitor','staff'),
 *    but the frontend's assignment form sends 'security', 'caretaker',
 *    or 'manager' — none of which are valid values for that ENUM. Under
 *    MySQL's default strict mode, assigning a slot to any of those three
 *    roles fails outright with a truncation error. Widened the ENUM to
 *    match exactly what the frontend actually sends.
 *
 * 2. There was nowhere to store a visitor's name at all — the
 *    assignment form collects it, the API accepts it, and it was
 *    silently discarded every time because no column existed for it.
 *    A visitor-assigned slot showed no identifying information
 *    whatsoever, just the generic word "visitor".
 */
module.exports = {
  name: '013_parking_assignee_fix',
  async up(pool) {
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parking_slots'`
    );
    const have = new Set(cols.map(c => c.COLUMN_NAME));

    if (!have.has('assigned_visitor_name')) {
      await pool.query(
        `ALTER TABLE parking_slots ADD COLUMN assigned_visitor_name VARCHAR(100) DEFAULT NULL AFTER assigned_vehicle_plate`
      );
    }

    const typeCol = cols.find(c => c.COLUMN_NAME === 'assigned_to_type');
    if (typeCol && !typeCol.COLUMN_TYPE.includes('security')) {
      await pool.query(
        `ALTER TABLE parking_slots MODIFY COLUMN assigned_to_type
         ENUM('unassigned','tenant','visitor','security','caretaker','manager','staff') DEFAULT 'unassigned'`
      );
    }
  },
};
