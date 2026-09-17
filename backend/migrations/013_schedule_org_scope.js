'use strict';

module.exports = {
  name: '013_schedule_org_scope',
  async up(pool) {
    const [cols] = await pool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='schedules'"
    );
    if (!cols.length) return;
    const existing = new Set(cols.map(r => r.COLUMN_NAME.toLowerCase()));
    if (!existing.has('org_id')) {
      await pool.query('ALTER TABLE schedules ADD COLUMN org_id INT NULL AFTER id');
    }
    await pool.query(`
      UPDATE schedules s
      JOIN properties p ON p.id=s.property_id
      SET s.org_id=p.org_id
      WHERE s.org_id IS NULL AND p.org_id IS NOT NULL
    `);
    await pool.query(`
      UPDATE schedules s
      JOIN users u ON u.id=s.created_by
      SET s.org_id=u.org_id
      WHERE s.org_id IS NULL AND u.org_id IS NOT NULL
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_schedules_org_date ON schedules(org_id, scheduled_date)').catch(() => {});
  },
};
