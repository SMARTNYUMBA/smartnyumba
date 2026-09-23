'use strict';

/**
 * Migration 013 - Schedule organization scope
 *
 * Safely upgrades older databases by:
 * - Adding org_id to schedules when missing
 * - Backfilling org_id from properties when possible
 * - Backfilling remaining org_id values from users when possible
 * - Ensuring the organization/date index safely
 */

module.exports = {
  name: '013_schedule_org_scope',

  async up(pool) {

    // 1. Check that schedules exists
    const [tables] = await pool.query(
      "SELECT TABLE_NAME " +
      "FROM INFORMATION_SCHEMA.TABLES " +
      "WHERE TABLE_SCHEMA = DATABASE() " +
      "AND TABLE_NAME = 'schedules'"
    );

    if (!tables.length) {
      console.log('[013] schedules table does not exist; skipped');
      return;
    }

    // 2. Read current columns
    const [cols] = await pool.query(
      "SELECT COLUMN_NAME " +
      "FROM INFORMATION_SCHEMA.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() " +
      "AND TABLE_NAME = 'schedules'"
    );

    const existing = new Set(
      cols.map(r => r.COLUMN_NAME.toLowerCase())
    );

    // 3. Add org_id if missing
    if (!existing.has('org_id')) {
      await pool.query(
        "ALTER TABLE schedules " +
        "ADD COLUMN org_id INT NULL AFTER id"
      );

      console.log('[013] Added schedules.org_id');
      existing.add('org_id');
    }

    // 4. Backfill org_id from properties when property_id exists
    if (existing.has('property_id')) {
      await pool.query(
        "UPDATE schedules s " +
        "JOIN properties p ON p.id = s.property_id " +
        "SET s.org_id = p.org_id " +
        "WHERE s.org_id IS NULL " +
        "AND p.org_id IS NOT NULL"
      ).catch(e => {
        console.warn(
          '[013] Property-based org_id backfill skipped:',
          e.message
        );
      });
    } else {
      console.warn(
        '[013] Property-based org_id backfill skipped: ' +
        'schedules.property_id does not exist'
      );
    }

    // 5. Backfill remaining org_id from users when created_by exists
    if (existing.has('created_by')) {
      await pool.query(
        "UPDATE schedules s " +
        "JOIN users u ON u.id = s.created_by " +
        "SET s.org_id = u.org_id " +
        "WHERE s.org_id IS NULL " +
        "AND u.org_id IS NOT NULL"
      ).catch(e => {
        console.warn(
          '[013] User-based org_id backfill skipped:',
          e.message
        );
      });
    } else {
      console.warn(
        '[013] User-based org_id backfill skipped: ' +
        'schedules.created_by does not exist'
      );
    }

    // 6. Safely ensure index
    const [indexRows] = await pool.query(
      "SELECT INDEX_NAME " +
      "FROM INFORMATION_SCHEMA.STATISTICS " +
      "WHERE TABLE_SCHEMA = DATABASE() " +
      "AND TABLE_NAME = 'schedules' " +
      "AND INDEX_NAME = 'idx_schedules_org_date'"
    );

    if (!indexRows.length) {

      const [columnRows] = await pool.query(
        "SELECT COLUMN_NAME " +
        "FROM INFORMATION_SCHEMA.COLUMNS " +
        "WHERE TABLE_SCHEMA = DATABASE() " +
        "AND TABLE_NAME = 'schedules' " +
        "AND COLUMN_NAME IN ('org_id', 'scheduled_date')"
      );

      const available = new Set(
        columnRows.map(r => r.COLUMN_NAME.toLowerCase())
      );

      if (
        available.has('org_id') &&
        available.has('scheduled_date')
      ) {
        try {
          await pool.query(
            "ALTER TABLE schedules " +
            "ADD INDEX idx_schedules_org_date (org_id, scheduled_date)"
          );

          console.log(
            '[013] Added idx_schedules_org_date'
          );
        } catch (e) {
          console.warn(
            '[013] Index creation skipped:',
            e.message
          );
        }
      } else {
        console.warn(
          '[013] Skipped idx_schedules_org_date: ' +
          'required column(s) missing'
        );
      }
    }

    console.log('[013] Schedule organization migration complete');
  },
};
