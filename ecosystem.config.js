'use strict';

/**
 * PM2 ecosystem config — Smart Nyumba Pro
 *
 * Deploy usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 reload ecosystem.config.js --env production  (zero-downtime reload)
 *
 * Expected server layout at /opt/smartnyumba:
 *   /opt/smartnyumba/
 *     backend/      ← git-cloned backend folder
 *       server.js
 *       package.json
 *       ...
 *     frontend/
 *       dist/       ← built frontend (served by nginx)
 *     ecosystem.config.js  ← this file
 *     logs/
 *
 * Cron note: cron jobs only start on worker NODE_APP_INSTANCE=0 (see server.js).
 * This prevents duplicate SMS/email sends when running multiple cluster workers.
 */

module.exports = {
  apps: [
    {
      name:       'snp-api',
      script:     './backend/server.js',
      cwd:        '/opt/smartnyumba',

      // ── Cluster mode — one process per CPU core ────────────
      instances:  'max',
      exec_mode:  'cluster',

      // ── Environment ────────────────────────────────────────
      env: {
        NODE_ENV: 'development',
        PORT:     3002,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT:     3002,
      },

      // ── Memory & restart policy ────────────────────────────
      max_memory_restart: '512M',
      restart_delay:      4000,   // 4s between restarts
      max_restarts:       10,
      min_uptime:         '10s',  // must be up 10s to count as successful start

      // ── Logging ────────────────────────────────────────────
      out_file:        './logs/pm2-out.log',
      error_file:      './logs/pm2-err.log',
      merge_logs:      true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // ── Graceful shutdown ──────────────────────────────────
      kill_timeout:    10000,   // 10s before SIGKILL
      listen_timeout:  8000,    // 8s for process to start listening

      // ── Watch (dev only — keep false in production) ────────
      watch:        false,
      ignore_watch: ['node_modules', 'uploads', 'logs', '*.log'],

      // ── Node.js flags ─────────────────────────────────────
      node_args: '--max-old-space-size=512',
    },
  ],
};
