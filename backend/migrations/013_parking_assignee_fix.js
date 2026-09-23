'use strict';

/**
 * Migration 013 - Fix parking_slots assignment tracking
 *
 * Safely upgrades older parking_slots tables by:
 * - Ensuring assigned_vehicle_plate exists
 * - Adding assigned_visitor_name if missing
 * - Widening assigned_to_type while preserving existing ENUM values
 */

module.exports = {
  name: '013_parking_assignee_fix',

  async up(pool) {

    // 1. Check that parking_slots exists
    const [[table]] = await pool.query(
      "SELECT TABLE_NAME " +
      "FROM INFORMATION_SCHEMA.TABLES " +
      "WHERE TABLE_SCHEMA = DATABASE() " +
      "AND TABLE_NAME = 'parking_slots'"
    );

    if (!table) {
      console.log('[013] parking_slots table does not exist; skipped');
      return;
    }

    // 2. Read current columns
    const [cols] = await pool.query(
      "SELECT COLUMN_NAME, COLUMN_TYPE " +
      "FROM INFORMATION_SCHEMA.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() " +
      "AND TABLE_NAME = 'parking_slots'"
    );

    const have = new Set(
      cols.map(c => c.COLUMN_NAME.toLowerCase())
    );

    // 3. Ensure assigned_vehicle_plate exists
    if (!have.has('assigned_vehicle_plate')) {
      await pool.query(
        "ALTER TABLE parking_slots " +
        "ADD COLUMN assigned_vehicle_plate VARCHAR(20) DEFAULT NULL"
      );

      console.log('[013] Added assigned_vehicle_plate');
      have.add('assigned_vehicle_plate');
    }

    // 4. Ensure assigned_visitor_name exists
    if (!have.has('assigned_visitor_name')) {
      await pool.query(
        "ALTER TABLE parking_slots " +
        "ADD COLUMN assigned_visitor_name VARCHAR(100) DEFAULT NULL"
      );

      console.log('[013] Added assigned_visitor_name');
      have.add('assigned_visitor_name');
    }

    // 5. Safely widen assigned_to_type ENUM
    const typeCol = cols.find(
      c => c.COLUMN_NAME.toLowerCase() === 'assigned_to_type'
    );

    if (typeCol && typeCol.COLUMN_TYPE.toLowerCase().startsWith('enum(')) {

      // Extract existing ENUM values from INFORMATION_SCHEMA.COLUMN_TYPE
      const existingValues = [];
      const enumRegex = /'((?:''|[^'])*)'/g;
      let match;

      while ((match = enumRegex.exec(typeCol.COLUMN_TYPE)) !== null) {
        existingValues.push(
          match[1].replace(/''/g, "'")
        );
      }

      // Values required by the current application
      const requiredValues = [
        'unassigned',
        'tenant',
        'visitor',
        'security',
        'caretaker',
        'manager',
        'staff',
      ];

      // Preserve existing values and append missing values
      const mergedValues = [...existingValues];

      for (const value of requiredValues) {
        if (!mergedValues.includes(value)) {
          mergedValues.push(value);
        }
      }

      const escapedValues = mergedValues.map(
        value => `'${value.replace(/'/g, "''")}'`
      );

      const enumDefinition = escapedValues.join(', ');

      const alreadySupportsAll = requiredValues.every(
        value => existingValues.includes(value)
      );

      if (!alreadySupportsAll) {
        await pool.query(
          "ALTER TABLE parking_slots " +
          "MODIFY COLUMN assigned_to_type " +
          `ENUM(${enumDefinition}) ` +
          "DEFAULT 'unassigned'"
        );

        console.log(
          '[013] Widened assigned_to_type ENUM while preserving existing values'
        );
      }
    }

    console.log('[013] parking_slots assignment migration complete');
  },
};
