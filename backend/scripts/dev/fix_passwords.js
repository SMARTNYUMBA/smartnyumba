// Run this in the backend folder: node fix_passwords.js
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config();

const users = [
  { email: 'admin@smartnyumba.com',     password: 'Admin@123',   role: 'super_admin',       name: 'System Administrator', phone: '0700000001' },
  { email: 'manager@smartnyumba.com',   password: 'Manager@123', role: 'property_manager',  name: 'James Kariuki',        phone: '0711000002' },
  { email: 'alice@smartnyumba.com',     password: 'Tenant@123',  role: 'tenant',             name: 'Alice Wanjiku',        phone: '0722111001' },
  { email: 'bob@smartnyumba.com',       password: 'Tenant@123',  role: 'tenant',             name: 'Bob Otieno',           phone: '0733222002' },
  { email: 'carol@smartnyumba.com',     password: 'Tenant@123',  role: 'tenant',             name: 'Carol Muthoni',        phone: '0744333003' },
  { email: 'caretaker@smartnyumba.com', password: 'Staff@123',   role: 'caretaker',          name: 'David Njoroge',        phone: '0755444004' },
  { email: 'security@smartnyumba.com',  password: 'Staff@123',   role: 'security',           name: 'Grace Akinyi',         phone: '0766555005' },
  { email: 'owner@smartnyumba.com',     password: 'Owner@123',   role: 'owner',              name: 'Mark Mutwiwa',         phone: '0715662332' },
];

async function run() {
  const pool = await mysql.createPool({
    host:     process.env.DB_HOST     || 'localhost',
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'smartnyumba',
  });

  console.log('Connected to database');
  
  // Fix role enum first
  try {
    await pool.query("ALTER TABLE users MODIFY COLUMN role ENUM('super_admin','property_manager','tenant','caretaker','security','owner') NOT NULL DEFAULT 'tenant'");
    console.log('Role enum updated');
  } catch(e) { console.log('Role enum (already ok):', e.message); }

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    
    // Try update first, then insert
    const [existing] = await pool.query('SELECT id FROM users WHERE email=?', [u.email]);
    
    if (existing.length > 0) {
      await pool.query(
        'UPDATE users SET password_hash=?, role=?, is_active=1 WHERE email=?',
        [hash, u.role, u.email]
      );
      console.log('Updated:', u.email, '(' + u.password + ')');
    } else {
      await pool.query(
        'INSERT INTO users (full_name, email, phone, password_hash, role, is_active) VALUES (?,?,?,?,?,1)',
        [u.name, u.email, u.phone, hash, u.role]
      );
      console.log('Created:', u.email, '(' + u.password + ')');
    }
  }

  // Also create tenant profiles
  const [tenantUsers] = await pool.query("SELECT id FROM users WHERE role='tenant'");
  for (const t of tenantUsers) {
    try {
      await pool.query('INSERT IGNORE INTO tenants (user_id) VALUES (?)', [t.id]);
    } catch(e) {}
  }
  console.log('Tenant profiles ensured');

  await pool.end();
  console.log('\n✅ All passwords fixed! Try logging in now.');
  console.log('Admin: admin@smartnyumba.com / Admin@123');
}

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });