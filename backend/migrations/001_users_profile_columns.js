'use strict';

module.exports = {
  name: '001_users_profile_columns',
  async up(pool) {
    const [rows] = await pool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users'"
    );
    const cols = rows.map(r => r.COLUMN_NAME.toLowerCase());
    const toAdd = [
      ['id_number',         'VARCHAR(30) DEFAULT NULL'],
      ['id_type',           "VARCHAR(20) DEFAULT 'national_id'"],
      ['passport_number',   'VARCHAR(30) DEFAULT NULL'],
      ['emergency_contact', 'VARCHAR(100) DEFAULT NULL'],
      ['emergency_phone',   'VARCHAR(20) DEFAULT NULL'],
      ['vehicle_plate',     'VARCHAR(20) DEFAULT NULL'],
    ];
    for (const [col, def] of toAdd) {
      if (!cols.includes(col)) {
        await pool.query(`ALTER TABLE users ADD COLUMN ${col} ${def}`).catch(() => {});
      }
    }
  },
};
