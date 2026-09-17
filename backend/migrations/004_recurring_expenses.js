'use strict';

module.exports = {
  name: '004_recurring_expenses',
  async up(pool) {
    const [rows] = await pool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='expenses'"
    );
    if (!rows.length) return; // expenses table doesn't exist yet
    const cols = rows.map(r => r.COLUMN_NAME.toLowerCase());
    const toAdd = [
      ['is_recurring',       'TINYINT DEFAULT 0'],
      ['recurrence_type',    "ENUM('monthly','quarterly','annual') DEFAULT NULL"],
      ['recurrence_day',     "TINYINT DEFAULT 1 COMMENT 'Day of month to auto-create'"],
      ['next_due_date',      'DATE DEFAULT NULL'],
      ['parent_expense_id',  'INT DEFAULT NULL'],
    ];
    for (const [col, def] of toAdd) {
      if (!cols.includes(col)) {
        await pool.query(`ALTER TABLE expenses ADD COLUMN ${col} ${def}`).catch(() => {});
      }
    }
  },
};
