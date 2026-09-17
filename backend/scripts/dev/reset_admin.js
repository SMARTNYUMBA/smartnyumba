'use strict';
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool   = require('./config/db');

(async () => {
  try {
    const hash  = await bcrypt.hash('Admin@1234', 12);
    const [r]   = await pool.query(
      "UPDATE users SET password_hash=?, is_active=1 WHERE email='admin@smartnyumba.com'",
      [hash]
    );
    if (r.affectedRows) {
      console.log('✅ Password reset — login with:');
      console.log('   Email   : admin@smartnyumba.com');
      console.log('   Password: Admin@1234');
    } else {
      console.log('❌ User not found. Super-admin accounts in DB:');
      const [admins] = await pool.query(
        "SELECT id, email, role, is_active FROM users WHERE role='super_admin'"
      );
      console.table(admins);
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
})();