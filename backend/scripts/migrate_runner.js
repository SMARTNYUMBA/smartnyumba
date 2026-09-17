'use strict';

/**
 * SmartNyumba Pro — Migration Runner
 *
 * Loads all migration files from ./migrations/*.js and runs them
 * in alphabetical order, skipping already-applied ones via the
 * _migrations table (version tracking added in v2.1).
 *
 * Each migration file exports:
 *   module.exports = {
 *     name: 'unique_migration_name',   // must be unique across all files
 *     up:   async (pool) => { ... },   // forward migration
 *   };
 *
 * Usage (in auto_migrate.js):
 *   const runner = require('./migrate_runner');
 *   await runner.runAll(pool);
 */

const fs   = require('fs');
const path = require('path');

async function ensureVersionTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(150) NOT NULL UNIQUE,
      run_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      duration_ms INT DEFAULT 0,
      INDEX idx_mig_name (name)
    )
  `).catch(() => {});
}

async function hasRun(pool, name) {
  try {
    const [[r]] = await pool.query('SELECT id FROM _migrations WHERE name=?', [name]);
    return !!r;
  } catch { return false; }
}

async function markRun(pool, name, durationMs) {
  await pool.query(
    'INSERT IGNORE INTO _migrations (name, duration_ms) VALUES (?,?)',
    [name, durationMs || 0]
  ).catch(() => {});
}

async function runAll(pool) {
  const log  = (m) => { if (global.logger) global.logger.info(m);  else console.log(m); };
  const warn = (m) => { if (global.logger) global.logger.warn(m);  else console.warn(m); };

  await ensureVersionTable(pool);

  const dir   = path.join(__dirname, '..', 'migrations'); // migrations/ lives at backend root
  if (!fs.existsSync(dir)) {
    log('No migrations/ directory found — skipping file-based migrations');
    return;
  }

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.js'))
    .sort(); // alphabetical = chronological when named 001_xxx.js

  let ran = 0;
  for (const file of files) {
    let migration;
    try {
      migration = require(path.join(dir, file));
    } catch (e) {
      warn(`Migration load error (${file}): ${e.message}`);
      continue;
    }

    const name = migration.name || file.replace('.js', '');
    if (await hasRun(pool, name)) continue;

    const start = Date.now();
    try {
      await migration.up(pool);
      await markRun(pool, name, Date.now() - start);
      log(`✅ Migration [${name}] applied (${Date.now() - start}ms)`);
      ran++;
    } catch (e) {
      warn(`Migration [${name}] FAILED: ${e.message}`);
      // Don't throw — allow other migrations to proceed
    }
  }

  if (ran === 0) log('✅ All file-based migrations already applied');
}

module.exports = { runAll, ensureVersionTable, hasRun, markRun };
