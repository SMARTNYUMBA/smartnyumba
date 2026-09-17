// Smart Nyumba Pro — Safe Demo Data Reset + Reseed
//
// Removes records belonging to the comprehensive demo dataset only.
// Real users, real properties and the database schema are preserved.
//
// Run:
//   npm run reset-seed

require('dotenv').config();

const { spawn } = require('child_process');
const pool = require('../config/db');

const DEMO_PROPERTY_NAMES = [
  'Westlands Heights',
  'Kilimani Gardens',
  'Nyali Palm Residences'
];

const DEMO_EMAIL_DOMAIN = '@demo.co.ke';

const DEMO_STAFF_EMAILS = [
  'manager@demo.co.ke',
  'owner@demo.co.ke',
  'caretaker@demo.co.ke',
  'security@demo.co.ke'
];

function placeholders(values) {
  return values.map(() => '?').join(',');
}

async function tableExists(connection, table) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS n
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = ?`,
    [table]
  );

  return Number(row.n) > 0;
}

async function columnExists(connection, table, column) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS n
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?`,
    [table, column]
  );

  return Number(row.n) > 0;
}

async function getColumnNames(connection, table) {
  const [rows] = await connection.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?`,
    [table]
  );

  return rows.map(row => row.column_name);
}

async function getIds(connection) {
  const ids = {
    propertyIds: [],
    unitIds: [],
    tenantIds: [],
    tenancyIds: [],
    invoiceIds: [],
    paymentIds: [],
    maintenanceIds: [],
    sharedMeterIds: [],
    userIds: []
  };

  /*
   * ------------------------------------------------------------
   * DEMO USERS
   * ------------------------------------------------------------
   */

  const [staff] = await connection.query(
    `SELECT id
     FROM users
     WHERE email IN (${placeholders(DEMO_STAFF_EMAILS)})`,
    DEMO_STAFF_EMAILS
  );

  ids.userIds.push(...staff.map(row => row.id));

  /*
   * Also find all demo users by email domain.
   *
   * This catches the 15 demo tenant accounts without touching
   * normal users.
   */

  const [demoUsers] = await connection.query(
    `SELECT id
     FROM users
     WHERE LOWER(email) LIKE ?`,
    [`%${DEMO_EMAIL_DOMAIN}`]
  );

  ids.userIds.push(...demoUsers.map(row => row.id));

  /*
   * ------------------------------------------------------------
   * DEMO PROPERTIES
   * ------------------------------------------------------------
   */

  const [properties] = await connection.query(
    `SELECT id
     FROM properties
     WHERE name IN (${placeholders(DEMO_PROPERTY_NAMES)})`,
    DEMO_PROPERTY_NAMES
  );

  ids.propertyIds.push(...properties.map(row => row.id));

  /*
   * ------------------------------------------------------------
   * DEMO UNITS
   * ------------------------------------------------------------
   */

  if (ids.propertyIds.length) {
    const ph = placeholders(ids.propertyIds);

    const [units] = await connection.query(
      `SELECT id
       FROM units
       WHERE property_id IN (${ph})`,
      ids.propertyIds
    );

    ids.unitIds.push(...units.map(row => row.id));
  }

  /*
   * ------------------------------------------------------------
   * DEMO TENANTS
   * ------------------------------------------------------------
   */

  if (await tableExists(connection, 'tenants')) {
    const tenantColumns = await getColumnNames(connection, 'tenants');

    if (tenantColumns.includes('user_id') && ids.userIds.length) {
      const ph = placeholders(ids.userIds);

      const [tenants] = await connection.query(
        `SELECT id
         FROM tenants
         WHERE user_id IN (${ph})`,
        ids.userIds
      );

      ids.tenantIds.push(...tenants.map(row => row.id));
    }
  }

  /*
   * ------------------------------------------------------------
   * DEMO TENANCIES
   * ------------------------------------------------------------
   */

  if (await tableExists(connection, 'tenancies')) {
    const conditions = [];
    const params = [];

    if (ids.unitIds.length) {
      conditions.push(`unit_id IN (${placeholders(ids.unitIds)})`);
      params.push(...ids.unitIds);
    }

    if (ids.tenantIds.length) {
      conditions.push(`tenant_id IN (${placeholders(ids.tenantIds)})`);
      params.push(...ids.tenantIds);
    }

    if (conditions.length) {
      const [tenancies] = await connection.query(
        `SELECT id, tenant_id, unit_id
         FROM tenancies
         WHERE ${conditions.join(' OR ')}`,
        params
      );

      ids.tenancyIds.push(...tenancies.map(row => row.id));

      ids.tenantIds.push(
        ...tenancies
          .map(row => row.tenant_id)
          .filter(Boolean)
      );

      ids.unitIds.push(
        ...tenancies
          .map(row => row.unit_id)
          .filter(Boolean)
      );
    }
  }

  /*
   * ------------------------------------------------------------
   * DEMO INVOICES
   * ------------------------------------------------------------
   */

  if (await tableExists(connection, 'invoices') && ids.tenancyIds.length) {
    const [invoices] = await connection.query(
      `SELECT id
       FROM invoices
       WHERE tenancy_id IN (${placeholders(ids.tenancyIds)})`,
      ids.tenancyIds
    );

    ids.invoiceIds.push(...invoices.map(row => row.id));
  }

  /*
   * ------------------------------------------------------------
   * DEMO PAYMENTS
   * ------------------------------------------------------------
   */

  if (await tableExists(connection, 'payments')) {
    const conditions = [];
    const params = [];

    if (ids.invoiceIds.length) {
      conditions.push(
        `invoice_id IN (${placeholders(ids.invoiceIds)})`
      );
      params.push(...ids.invoiceIds);
    }

    if (ids.tenancyIds.length) {
      conditions.push(
        `tenancy_id IN (${placeholders(ids.tenancyIds)})`
      );
      params.push(...ids.tenancyIds);
    }

    if (conditions.length) {
      const [payments] = await connection.query(
        `SELECT id
         FROM payments
         WHERE ${conditions.join(' OR ')}`,
        params
      );

      ids.paymentIds.push(...payments.map(row => row.id));
    }
  }

  /*
   * ------------------------------------------------------------
   * MAINTENANCE
   * ------------------------------------------------------------
   */

  if (
    await tableExists(connection, 'maintenance_requests') &&
    ids.propertyIds.length
  ) {
    const propertyPh = placeholders(ids.propertyIds);

    const [maintenance] = await connection.query(
      `SELECT id
       FROM maintenance_requests
       WHERE property_id IN (${propertyPh})`,
      ids.propertyIds
    );

    ids.maintenanceIds.push(
      ...maintenance.map(row => row.id)
    );
  }

  /*
   * ------------------------------------------------------------
   * SHARED METERS
   * ------------------------------------------------------------
   */

  if (
    await tableExists(connection, 'shared_meters') &&
    ids.propertyIds.length
  ) {
    const [meters] = await connection.query(
      `SELECT id
       FROM shared_meters
       WHERE property_id IN (${placeholders(ids.propertyIds)})`,
      ids.propertyIds
    );

    ids.sharedMeterIds.push(
      ...meters.map(row => row.id)
    );
  }

  /*
   * Remove duplicates.
   */

  for (const key of Object.keys(ids)) {
    ids[key] = [...new Set(ids[key].filter(Boolean))];
  }

  return ids;
}

async function deleteByIds(connection, table, column, ids) {
  if (!ids.length) return 0;

  if (!(await tableExists(connection, table))) {
    return 0;
  }

  if (!(await columnExists(connection, table, column))) {
    return 0;
  }

  const [result] = await connection.query(
    `DELETE FROM \`${table}\`
     WHERE \`${column}\` IN (${placeholders(ids)})`,
    ids
  );

  return Number(result.affectedRows || 0);
}

async function deleteByUserIds(connection, table, columns, userIds) {
  if (!userIds.length) return 0;
  if (!(await tableExists(connection, table))) return 0;

  const existingColumns = await getColumnNames(connection, table);

  const usableColumns = columns.filter(column =>
    existingColumns.includes(column)
  );

  if (!usableColumns.length) return 0;

  const conditions = usableColumns.map(
    column => `\`${column}\` IN (${placeholders(userIds)})`
  );

  const params = [];

  for (const column of usableColumns) {
    params.push(...userIds);
  }

  const [result] = await connection.query(
    `DELETE FROM \`${table}\`
     WHERE ${conditions.join(' OR ')}`,
    params
  );

  return Number(result.affectedRows || 0);
}

async function resetDemo() {
  const connection = await pool.getConnection();

  let totalDeleted = 0;

  try {
    console.log('');
    console.log('================================================');
    console.log(' Smart Nyumba Pro — SAFE DEMO DATA RESET');
    console.log('================================================');
    console.log('');

    /*
     * Never start with an unrestricted DELETE.
     */

    const ids = await getIds(connection);

    console.log(`Demo properties found : ${ids.propertyIds.length}`);
    console.log(`Demo units found      : ${ids.unitIds.length}`);
    console.log(`Demo tenants found    : ${ids.tenantIds.length}`);
    console.log(`Demo tenancies found  : ${ids.tenancyIds.length}`);
    console.log(`Demo invoices found   : ${ids.invoiceIds.length}`);
    console.log(`Demo payments found   : ${ids.paymentIds.length}`);
    console.log(`Demo maintenance     : ${ids.maintenanceIds.length}`);
    console.log(`Demo shared meters    : ${ids.sharedMeterIds.length}`);
    console.log(`Demo users found      : ${ids.userIds.length}`);
    console.log('');

    if (
      !ids.propertyIds.length &&
      !ids.userIds.length
    ) {
      console.log('No demo data was found.');
      console.log('Nothing will be deleted.');
      return;
    }

    /*
     * ------------------------------------------------------------
     * TRANSACTION / FOREIGN KEYS
     * ------------------------------------------------------------
     */

    await connection.beginTransaction();

    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    /*
     * ------------------------------------------------------------
     * PAYMENT CHILDREN
     * ------------------------------------------------------------
     */

    totalDeleted += await deleteByIds(
      connection,
      'receipts',
      'payment_id',
      ids.paymentIds
    );

    /*
     * ------------------------------------------------------------
     * MPESA
     * ------------------------------------------------------------
     */

    totalDeleted += await deleteByIds(
      connection,
      'mpesa_transactions',
      'invoice_id',
      ids.invoiceIds
    );

    totalDeleted += await deleteByIds(
      connection,
      'mpesa_transactions',
      'tenancy_id',
      ids.tenancyIds
    );

    /*
     * ------------------------------------------------------------
     * LEDGER
     * ------------------------------------------------------------
     */

    totalDeleted += await deleteByIds(
      connection,
      'tenant_ledger',
      'tenancy_id',
      ids.tenancyIds
    );

    /*
     * ------------------------------------------------------------
     * UTILITY READINGS
     * ------------------------------------------------------------
     */

    totalDeleted += await deleteByIds(
      connection,
      'utility_readings',
      'invoice_id',
      ids.invoiceIds
    );

    totalDeleted += await deleteByIds(
      connection,
      'utility_readings',
      'tenancy_id',
      ids.tenancyIds
    );

    totalDeleted += await deleteByIds(
      connection,
      'utility_readings',
      'unit_id',
      ids.unitIds
    );

    /*
     * ------------------------------------------------------------
     * DEPOSIT REFUNDS
     * ------------------------------------------------------------
     */

    totalDeleted += await deleteByIds(
      connection,
      'deposit_refunds',
      'tenancy_id',
      ids.tenancyIds
    );

    totalDeleted += await deleteByIds(
      connection,
      'deposit_refunds',
      'payment_id',
      ids.paymentIds
    );

    /*
     * ------------------------------------------------------------
     * PAYMENTS
     * ------------------------------------------------------------
     */

    totalDeleted += await deleteByIds(
      connection,
      'payments',
      'id',
      ids.paymentIds
    );

    /*
     * ------------------------------------------------------------
     * INVOICE CHILDREN
     * ------------------------------------------------------------
     */

    const invoiceChildTables = [
      ['invoice_items', 'invoice_id'],
      ['invoice_notes', 'invoice_id'],
      ['invoice_payments', 'invoice_id'],
      ['credit_notes', 'invoice_id'],
      ['vendor_invoices', 'invoice_id']
    ];

    for (const [table, column] of invoiceChildTables) {
      totalDeleted += await deleteByIds(
        connection,
        table,
        column,
        ids.invoiceIds
      );
    }

    /*
     * ------------------------------------------------------------
     * INVOICES
     * ------------------------------------------------------------
     */

    totalDeleted += await deleteByIds(
      connection,
      'invoices',
      'id',
      ids.invoiceIds
    );

    /*
     * ------------------------------------------------------------
     * MAINTENANCE CHILDREN
     * ------------------------------------------------------------
     */

    totalDeleted += await deleteByIds(
      connection,
      'maintenance_updates',
      'request_id',
      ids.maintenanceIds
    );

    totalDeleted += await deleteByIds(
      connection,
      'maintenance_photos',
      'request_id',
      ids.maintenanceIds
    );

    totalDeleted += await deleteByIds(
      connection,
      'maintenance_ratings',
      'request_id',
      ids.maintenanceIds
    );

    totalDeleted += await deleteByIds(
      connection,
      'maintenance_requests',
      'id',
      ids.maintenanceIds
    );

    /*
     * ------------------------------------------------------------
     * SHARED METERS
     * ------------------------------------------------------------
     */

    totalDeleted += await deleteByIds(
      connection,
      'shared_meter_units',
      'shared_meter_id',
      ids.sharedMeterIds
    );

    totalDeleted += await deleteByIds(
      connection,
      'shared_meters',
      'id',
      ids.sharedMeterIds
    );

    /*
     * ------------------------------------------------------------
     * PROPERTY-BASED DEMO DATA
     * ------------------------------------------------------------
     */

    const propertyTables = [
      'maintenance_schedules',
      'visitors',
      'expenses',
      'announcements',
      'parking_slots',
      'notifications',
      'documents',
      'security_logbook',
      'security_log_incidents',
      'security_log_patrols',
      'security_log_equipment',
      'access_log',
      'cases',
      'unit_inspections',
      'vacate_notices',
      'service_charge_rates'
    ];

    for (const table of propertyTables) {
      totalDeleted += await deleteByIds(
        connection,
        table,
        'property_id',
        ids.propertyIds
      );
    }

    /*
     * ------------------------------------------------------------
     * UNIT-BASED CHILD DATA
     * ------------------------------------------------------------
     */

    const unitTables = [
      'unit_inspections',
      'utility_readings',
      'parking_slots',
      'documents'
    ];

    for (const table of unitTables) {
      totalDeleted += await deleteByIds(
        connection,
        table,
        'unit_id',
        ids.unitIds
      );
    }

    /*
     * ------------------------------------------------------------
     * TENANCY-BASED CHILD DATA
     * ------------------------------------------------------------
     */

    const tenancyTables = [
      'vacate_notices',
      'deposit_refunds',
      'tenant_ledger',
      'notifications',
      'messages'
    ];

    for (const table of tenancyTables) {
      totalDeleted += await deleteByIds(
        connection,
        table,
        'tenancy_id',
        ids.tenancyIds
      );
    }

    /*
     * ------------------------------------------------------------
     * TENANCIES
     * ------------------------------------------------------------
     */

    totalDeleted += await deleteByIds(
      connection,
      'tenancies',
      'id',
      ids.tenancyIds
    );

    /*
     * ------------------------------------------------------------
     * TENANTS
     * ------------------------------------------------------------
     */

    totalDeleted += await deleteByIds(
      connection,
      'tenants',
      'id',
      ids.tenantIds
    );

    /*
     * ------------------------------------------------------------
     * UNITS
     * ------------------------------------------------------------
     */

    totalDeleted += await deleteByIds(
      connection,
      'units',
      'id',
      ids.unitIds
    );

    /*
     * ------------------------------------------------------------
     * PROPERTIES
     * ------------------------------------------------------------
     */

    totalDeleted += await deleteByIds(
      connection,
      'properties',
      'id',
      ids.propertyIds
    );

    /*
     * ------------------------------------------------------------
     * DEMO USER-OWNED RECORDS
     *
     * This catches things such as notifications, messages,
     * audit entries and other records whose only relationship
     * to the demo dataset is through a demo user.
     *
     * IMPORTANT:
     * The four demo staff accounts + demo tenant accounts
     * are the only users targeted.
     * ------------------------------------------------------------
     */

    const userLinkedTables = [
      'notifications',
      'messages',
      'refresh_tokens',
      'otp_codes',
      'mfa_otps',
      'password_reset_tokens',
      'audit_log',
      'cron_logs',
      'sms_logs',
      'system_alerts',
      'access_log',
      'import_logs',
      'webhooks',
      'whatsapp_logs'
    ];

    for (const table of userLinkedTables) {
      totalDeleted += await deleteByUserIds(
        connection,
        table,
        [
          'user_id',
          'created_by',
          'updated_by',
          'recorded_by',
          'posted_by',
          'assigned_to',
          'assigned_to_user_id',
          'checked_in_by',
          'host_user_id'
        ],
        ids.userIds
      );
    }

    /*
     * ------------------------------------------------------------
     * DEMO TENANT USERS
     *
     * We deliberately delete ONLY users whose emails belong
     * to the demo domain.
     *
     * Never delete super_admin here.
     * ------------------------------------------------------------
     */

    const [demoUsersBeforeDelete] = await connection.query(
      `SELECT id, email, role
       FROM users
       WHERE LOWER(email) LIKE ?
         AND role <> 'super_admin'`,
      [`%${DEMO_EMAIL_DOMAIN}`]
    );

    for (const user of demoUsersBeforeDelete) {
      console.log(
        `Removing demo user: ${user.email} (${user.role})`
      );
    }

    const [deletedUsers] = await connection.query(
      `DELETE FROM users
       WHERE LOWER(email) LIKE ?
         AND role <> 'super_admin'`,
      [`%${DEMO_EMAIL_DOMAIN}`]
    );

    totalDeleted += Number(deletedUsers.affectedRows || 0);

    /*
     * ------------------------------------------------------------
     * RE-ENABLE FOREIGN KEYS
     * ------------------------------------------------------------
     */

    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    await connection.commit();

    console.log('');
    console.log('-----------------------------------------------');
    console.log(`Total demo records deleted : ${totalDeleted}`);
    console.log('-----------------------------------------------');
    console.log('');
    console.log('✅ Demo data reset completed successfully.');
    console.log('');

  } catch (error) {
    try {
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    } catch (_) {}

    try {
      await connection.rollback();
    } catch (_) {}

    console.error('');
    console.error('❌ DEMO RESET FAILED');
    console.error('');
    console.error(error.message);
    console.error('');
    console.error(error.stack);

    throw error;

  } finally {
    connection.release();
  }
}

function runSeed() {
  return new Promise((resolve, reject) => {
    console.log('🌱 Starting comprehensive demo seed...');
    console.log('');

    const child = spawn(
      process.execPath,
      ['scripts/seed_demo.js'],
      {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: process.env
      }
    );

    child.on('error', reject);

    child.on('exit', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Comprehensive demo seed exited with code ${code}`
          )
        );
      }
    });
  });
}

async function verifyDemo() {
  const connection = await pool.getConnection();

  try {
    const [[properties]] = await connection.query(
      `SELECT COUNT(*) AS n
       FROM properties
       WHERE name IN (${placeholders(DEMO_PROPERTY_NAMES)})`,
      DEMO_PROPERTY_NAMES
    );

    const [[demoUsers]] = await connection.query(
      `SELECT COUNT(*) AS n
       FROM users
       WHERE LOWER(email) LIKE ?`,
      [`%${DEMO_EMAIL_DOMAIN}`]
    );

    let units = 0;
    let tenants = 0;
    let tenancies = 0;
    let invoices = 0;
    let payments = 0;
    let maintenance = 0;
    let visitors = 0;
    let expenses = 0;

    const [[unitResult]] = await connection.query(
      `SELECT COUNT(*) AS n
       FROM units u
       JOIN properties p ON p.id=u.property_id
       WHERE p.name IN (${placeholders(DEMO_PROPERTY_NAMES)})`,
      DEMO_PROPERTY_NAMES
    );
    units = Number(unitResult.n);

    const [[tenantResult]] = await connection.query(
      `SELECT COUNT(*) AS n
       FROM tenants t
       JOIN users u ON u.id=t.user_id
       WHERE LOWER(u.email) LIKE ?`,
      [`%${DEMO_EMAIL_DOMAIN}`]
    );
    tenants = Number(tenantResult.n);

    const [[tenancyResult]] = await connection.query(
      `SELECT COUNT(*) AS n
       FROM tenancies t
       JOIN units u ON u.id=t.unit_id
       JOIN properties p ON p.id=u.property_id
       WHERE p.name IN (${placeholders(DEMO_PROPERTY_NAMES)})`,
      DEMO_PROPERTY_NAMES
    );
    tenancies = Number(tenancyResult.n);

    const [[invoiceResult]] = await connection.query(
      `SELECT COUNT(*) AS n
       FROM invoices i
       JOIN tenancies t ON t.id=i.tenancy_id
       JOIN units u ON u.id=t.unit_id
       JOIN properties p ON p.id=u.property_id
       WHERE p.name IN (${placeholders(DEMO_PROPERTY_NAMES)})`,
      DEMO_PROPERTY_NAMES
    );
    invoices = Number(invoiceResult.n);

    const [[paymentResult]] = await connection.query(
      `SELECT COUNT(*) AS n
       FROM payments pm
       JOIN tenancies t ON t.id=pm.tenancy_id
       JOIN units u ON u.id=t.unit_id
       JOIN properties p ON p.id=u.property_id
       WHERE p.name IN (${placeholders(DEMO_PROPERTY_NAMES)})`,
      DEMO_PROPERTY_NAMES
    );
    payments = Number(paymentResult.n);

    const [[maintenanceResult]] = await connection.query(
      `SELECT COUNT(*) AS n
       FROM maintenance_requests mr
       JOIN properties p ON p.id=mr.property_id
       WHERE p.name IN (${placeholders(DEMO_PROPERTY_NAMES)})`,
      DEMO_PROPERTY_NAMES
    );
    maintenance = Number(maintenanceResult.n);

    const [[visitorResult]] = await connection.query(
      `SELECT COUNT(*) AS n
       FROM visitors v
       JOIN properties p ON p.id=v.property_id
       WHERE p.name IN (${placeholders(DEMO_PROPERTY_NAMES)})`,
      DEMO_PROPERTY_NAMES
    );
    visitors = Number(visitorResult.n);

    const [[expenseResult]] = await connection.query(
      `SELECT COUNT(*) AS n
       FROM expenses e
       JOIN properties p ON p.id=e.property_id
       WHERE p.name IN (${placeholders(DEMO_PROPERTY_NAMES)})`,
      DEMO_PROPERTY_NAMES
    );
    expenses = Number(expenseResult.n);

    console.log('');
    console.log('================================================');
    console.log(' DEMO DATA VERIFICATION');
    console.log('================================================');
    console.log(`Properties       : ${properties.n}`);
    console.log(`Units            : ${units}`);
    console.log(`Demo users       : ${demoUsers.n}`);
    console.log(`Tenants          : ${tenants}`);
    console.log(`Tenancies        : ${tenancies}`);
    console.log(`Invoices         : ${invoices}`);
    console.log(`Payments         : ${payments}`);
    console.log(`Maintenance      : ${maintenance}`);
    console.log(`Visitors         : ${visitors}`);
    console.log(`Expenses         : ${expenses}`);
    console.log('================================================');
    console.log('');
  } finally {
    connection.release();
  }
}

async function main() {
  try {
    await resetDemo();

    /*
     * resetDemo() uses the pool.
     * Start the seed as a separate Node process so that the
     * seed's pool lifecycle cannot interfere with this script.
     */

    await runSeed();

    /*
     * Give the child process a moment to release its DB pool.
     */

    await new Promise(resolve => setTimeout(resolve, 500));

    await verifyDemo();

    console.log('✅ RESET + RESEED COMPLETE');
    console.log('');
    console.log('Demo password: Demo@2026!');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ RESET-SEED FAILED');
    console.error(error.message);
    console.error('');

    process.exitCode = 1;
  } finally {
    try {
      await pool.end();
    } catch (_) {}
  }
}

main();