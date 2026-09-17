module.exports = {
  apps: [
    {
      name: 'snp-api',
      script: './backend/server.js',
      cwd: '/opt/smartnyumba',

      // ── Cluster mode for multi-core utilisation ─────────────
      instances: 'max',       // Use all available CPU cores
      exec_mode: 'cluster',

      // ── Environment ────────────────────────────────────────
      env: {
        NODE_ENV: 'development',
        PORT:     3002,
      },
      env_production: {
        NODE_ENV:  'production',
        PORT:      3002,
      },

      // ── Memory & restart policy ────────────────────────────
      max_memory_restart: '512M',
      restart_delay:      4000,  // 4s between restarts
      max_restarts:       10,
      min_uptime:         '10s', // Must be up 10s to count as successful start

      // ── Logging ────────────────────────────────────────────
      out_file:     './logs/pm2-out.log',
      error_file:   './logs/pm2-err.log',
      merge_logs:   true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // ── Graceful shutdown ──────────────────────────────────
      kill_timeout: 10000,   // 10s for graceful shutdown before SIGKILL
      listen_timeout: 8000,  // 8s for process to start listening

      // ── Watch (dev only) ──────────────────────────────────
      watch:        false,
      ignore_watch: ['node_modules', 'uploads', 'logs', '*.log'],

      // ── Node.js flags ─────────────────────────────────────
      node_args: '--max-old-space-size=512',
    },
  ],
};