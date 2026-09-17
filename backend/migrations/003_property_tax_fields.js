'use strict';

module.exports = {
  name: '003_property_tax_and_invite_fields',
  async up(pool) {
    const [rows] = await pool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='properties'"
    );
    const cols = rows.map(r => r.COLUMN_NAME.toLowerCase());
    const toAdd = [
      ['kra_pin',      "VARCHAR(20)  DEFAULT NULL COMMENT 'KRA PIN'"],
      ['business_reg', "VARCHAR(50)  DEFAULT NULL COMMENT 'Business Registration Number'"],
      ['vat_number',   "VARCHAR(30)  DEFAULT NULL COMMENT 'VAT Registration Number'"],
      ['invite_slug',  "VARCHAR(100) DEFAULT NULL UNIQUE COMMENT 'Self-registration invite slug'"],
    ];
    for (const [col, def] of toAdd) {
      if (!cols.includes(col)) {
        await pool.query(`ALTER TABLE properties ADD COLUMN ${col} ${def}`).catch(() => {});
      }
    }
  },
};
