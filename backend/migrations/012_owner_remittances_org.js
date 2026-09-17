'use strict';

module.exports = {
  async up(connection) {
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'owner_remittances'
        AND COLUMN_NAME = 'org_id'
    `);

    if (columns.length === 0) {
      await connection.query(`
        ALTER TABLE owner_remittances
        ADD COLUMN org_id INT NULL AFTER recorded_by
      `);
    }

    await connection.query(`
      UPDATE owner_remittances r
      INNER JOIN properties p ON p.id = r.property_id
      SET r.org_id = p.org_id
      WHERE r.org_id IS NULL
    `);

    await connection.query(`
      ALTER TABLE owner_remittances
      MODIFY COLUMN org_id INT NOT NULL
    `);

    const [indexes] = await connection.query(`
      SHOW INDEX FROM owner_remittances
      WHERE Key_name = 'idx_owner_remittances_org'
    `);

    if (indexes.length === 0) {
      await connection.query(`
        CREATE INDEX idx_owner_remittances_org
        ON owner_remittances (org_id)
      `);
    }
  },

  async down(connection) {
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'owner_remittances'
        AND COLUMN_NAME = 'org_id'
    `);

    if (columns.length > 0) {
      await connection.query(`
        ALTER TABLE owner_remittances
        DROP COLUMN org_id
      `);
    }
  }
};