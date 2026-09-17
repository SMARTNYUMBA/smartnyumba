'use strict';

/**
 * Validates required environment variables before server starts.
 * Warns on missing optional vars, exits on missing critical vars.
 */
function validateEnv() {
  const required = [
    { key: 'JWT_SECRET',      check: v => v && v.length >= 32, msg: 'JWT_SECRET must be at least 32 characters' },
    { key: 'DB_HOST',         check: v => !!v,                 msg: 'DB_HOST is required' },
    { key: 'DB_NAME',         check: v => !!v,                 msg: 'DB_NAME is required' },
    { key: 'DB_USER',         check: v => !!v,                 msg: 'DB_USER is required' },
    // Required for AES-256-CBC encryption of PII (Kenya Data Protection Act 2019)
    { key: 'ENCRYPTION_KEY',  check: v => v && v.length === 64, msg: 'ENCRYPTION_KEY must be a 32-byte hex string (64 characters). Generate: node -e "require(\'crypto\').randomBytes(32).toString(\'hex\')"' },
  ];

  const optional = [
    'DB_PASSWORD', 'MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET',
    'MPESA_SHORTCODE', 'MPESA_PASSKEY', 'AT_USERNAME', 'AT_API_KEY',
    'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS',
  ];

  const errors = [];
  for (const { key, check, msg } of required) {
    if (!check(process.env[key])) errors.push('❌ ' + msg + ' (env: ' + key + ')');
  }

  if (errors.length > 0) {
    console.error('\n🚨 STARTUP FAILED — Missing required environment variables:');
    errors.forEach(e => console.error('  ' + e));
    console.error('\nCheck your .env file and try again.\n');
    process.exit(1);
  }

  const missing_optional = optional.filter(k => !process.env[k]);
  if (missing_optional.length > 0 && process.env.NODE_ENV === 'production') {
    console.warn('⚠️  Optional env vars not set: ' + missing_optional.join(', '));
    console.warn('   Some features (M-Pesa, SMS, email) may not work.\n');
  }
}

module.exports = { validateEnv };
