'use strict';
require('dotenv').config();

const app  = require('./app');
const cron = require('./scripts/cron');
const pool = require('./config/db');

const PORT = parseInt(process.env.PORT) || 3002;

const { validateEnv } = require('./scripts/validate_env');
validateEnv(); // Exits immediately if critical env vars are missing

async function start() {
  // ── Run DB migrations BEFORE accepting any requests ──────────
  try {
    const { runMigrations } = require('./scripts/auto_migrate');
    await runMigrations(pool);
  } catch (e) {
    global.logger.warn('Auto-migration warning: ' + e.message);
  }

  // NOTE: user suspension columns (is_suspended, suspension_reason,
  // suspended_at, suspended_by) used to be added here again with an
  // inline ALTER TABLE block, redundant with migrations/
  // 010_user_suspension_columns.js which already ran one step earlier
  // (via runMigrations() above) and does the same thing. There was also
  // a THIRD copy of this same schema change in
  // migrations/010_suspension_reason.js. Consolidated down to the one
  // migration file — three places doing one job made it too easy for a
  // future change to only land in one of them.

  // ── Start HTTP server ─────────────────────────────────────────
  const server = app.listen(PORT, () => {
    global.logger.info(`🚀 Smart Nyumba Pro API listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
    // Bootstrap webhook delivery table (idempotent)
    require('./services/webhooks').bootstrap().catch(e =>
      global.logger.warn('Webhook bootstrap failed (errno ' + (e.errno||'?') + '): ' + e.message)
    );
    // Only start cron in one cluster worker (worker id=1) or when running without cluster.
    // Without this guard, PM2 cluster mode fires every job once per CPU core.
    const workerId = process.env.NODE_APP_INSTANCE;
    if (workerId === undefined || workerId === '0') {
      cron.start();
    } else {
      global.logger.info(`Cron skipped on worker ${workerId} (runs on worker 0 only)`);
    }
  });

  // ── Graceful shutdown ─────────────────────────────────────────
  const shutdown = (signal) => {
    global.logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      global.logger.info('HTTP server closed');
      try { await pool.end(); global.logger.info('Database pool closed'); } catch (_) {}
      process.exit(0);
    });
    setTimeout(() => { global.logger.error('Forced shutdown after timeout'); process.exit(1); }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  return server;
}

start().catch(e => {
  if (global.logger) global.logger.error('Fatal startup error: ' + e.message);
  else console.error('Fatal startup error:', e.message);
  process.exit(1);
});

// BUG FIX: these handlers used to only log — the process kept handling
// new requests after a crash-worthy error. Node's own guidance is that
// after an uncaughtException the process is in an unknown state and
// should exit so the process manager (PM2/Railway) restarts it cleanly,
// rather than risk serving requests from a corrupted state.
process.on('uncaughtException', err => {
  const log = (m) => { if (global.logger) global.logger.error(m); else console.error(m); };
  log('UNCAUGHT EXCEPTION — exiting: ' + (err && err.stack || err));
  setTimeout(() => process.exit(1), 100); // brief delay to let the log line flush
});

process.on('unhandledRejection', err => {
  const log = (m) => { if (global.logger) global.logger.error(m); else console.error(m); };
  log('UNHANDLED REJECTION — exiting: ' + (err && err.stack || err));
  setTimeout(() => process.exit(1), 100);
});