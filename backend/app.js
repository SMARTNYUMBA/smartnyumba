/**
 * Smart Nyumba Pro — Backend Entry Point
 * Enterprise-grade Express application
 */

'use strict';

// ── Sentry error tracking (must be first) ─────────────────────
// Set SENTRY_DSN in .env to activate. Get your DSN at sentry.io
if (process.env.SENTRY_DSN) {
  try {
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn:         process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0.2,   // 20% of transactions traced — tune as needed
    });
    global.__sentry = Sentry;
    // Expose helper for route error handlers
    global.captureException = (e) => Sentry.captureException(e);
  } catch (_) {
    // @sentry/node not installed — run: npm install @sentry/node
  }
} else {
  global.captureException = () => {};
}

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const compression  = require('compression');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');
const path         = require('path');
const winston      = require('winston');
require('dotenv').config();

// ── Logger ────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    process.env.NODE_ENV === 'production'
      ? winston.format.json()
      : winston.format.combine(winston.format.colorize(), winston.format.simple())
  ),
  transports: [
    new winston.transports.Console(),
    ...(process.env.NODE_ENV === 'production' ? [
      new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'logs/combined.log' }),
    ] : []),
  ],
});
global.logger = logger;

const app = express();

// SECURITY FIX: trust proxy was never set, yet four separate places in
// this app (the M-Pesa callback IP allowlist, two rate-limit
// keyGenerators, and audit-log IP capture) all read the raw
// x-forwarded-for header directly. Without trust proxy configured, that
// header is whatever the connecting client sends — fully attacker-
// controlled — so any of those checks could be defeated by simply
// setting a fake header (e.g. spoofing a real Safaricom IP to forge a
// "payment successful" M-Pesa callback, or rotating a fake IP on every
// request to bypass login/OTP rate limiting entirely).
// '1' trusts exactly one hop in front of Node — correct for Railway's
// single edge proxy. If you later add another proxy/CDN in front (e.g.
// Cloudflare), increase this to 2, or app.js's req.ip (and everything
// below that now relies on it) silently reverts to being spoofable
// again by trusting one hop too many.
app.set('trust proxy', 1);

// ── Request ID middleware ─────────────────────────────────────
const { v4: uuidv4 } = require('uuid');
app.use((req, _res, next) => {
  req.id = uuidv4();
  next();
});

// ── Security headers ──────────────────────────────────────────
// ── Gzip compression — saves ~70% bandwidth on JSON responses ──────────
app.use(compression({ level: 6, threshold: 1024 }));

// ── Smart cache-control headers ──────────────────────────────────────────
// Slow-changing resources get a short browser cache; financial data never cached.
const NO_CACHE_ROUTES = ['/invoices', '/payments', '/mpesa', '/notifications', '/auth'];
const SHORT_CACHE_ROUTES = ['/properties', '/units', '/vendors', '/settings', '/reports'];
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const path = req.path;
  if (NO_CACHE_ROUTES.some(r => path.includes(r))) {
    res.set('Cache-Control', 'no-store');
  } else if (SHORT_CACHE_ROUTES.some(r => path.includes(r))) {
    res.set('Cache-Control', 'private, max-age=30'); // 30s browser cache
  }
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // HARDENING: this backend never serves any HTML of its own (checked —
      // no res.send('<html...') anywhere), so 'unsafe-inline' for scripts
      // was pure unused risk. styleSrc is left as-is: it doesn't protect
      // anything meaningful here either way (no HTML pages to inject into),
      // and touching it has no upside.
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', 'blob:'],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));

// ── CORS ──────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// Only allow localhost in non-production
if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.push(
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
  );
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Requested-With'],
}));

// ── Global rate limiter ───────────────────────────────────────
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  keyGenerator: (req) => req.ip, // SECURITY FIX: was reading raw x-forwarded-for directly, which is fully attacker-controlled without trust proxy set — see the trust proxy comment above. req.ip is now the correct, spoof-resistant value.
}));

// Strict rate limits on sensitive auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,
  message: { error: 'Too many authentication attempts, please try again in 15 minutes.' },
  skipSuccessfulRequests: true,
});
const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: { error: 'Too many OTP requests. Wait 5 minutes before trying again.' },
});

// FIX: added missing per-phone OTP reset limiter and API rate limiter
const otpResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.body?.phone ? `otp_reset:${req.body.phone}` : req.ip,
  message: { error: 'Too many OTP attempts. Please wait 15 minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests to this endpoint. Please slow down.' },
  keyGenerator: (req) => (req.ip) + ':' + (req.user?.sub || ''), // SECURITY FIX: same spoofable raw-header issue as the global limiter above
  skip: (req) => !req.user,
});

// ── Body parsers ──────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Structured request logging ────────────────────────────────
app.use(morgan(
  ':method :url :status :res[content-length] - :response-time ms',
  {
    stream: { write: (msg) => logger.http(msg.trim()) },
    skip: (req) => req.url === '/api/health',
  }
));

// ── Static files — uploads served from separate path ─────────
// NOTE: In production, serve uploads via nginx/CDN instead
// HARDENING: middleware/upload.js already verifies uploaded files by
// magic bytes against a strict allowlist (images/PDF/docx/xlsx only) and
// rejects/deletes anything that doesn't match, regardless of extension —
// so an .html/.svg/.js file genuinely cannot get into this folder through
// the normal upload path. These headers are a defense-in-depth backstop
// for anything that reaches this folder outside that path (a legacy file,
// a future code change that skips verifyMime): force download instead of
// inline rendering for any extension outside the known-safe set, so even
// an unexpected file here can't execute as HTML/script in the browser.
const SAFE_INLINE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf']);
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '1d',
  etag: true,
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!SAFE_INLINE_EXTS.has(path.extname(filePath).toLowerCase())) {
      res.setHeader('Content-Disposition', 'attachment');
    }
  },
}));

// ── CSRF protection ───────────────────────────────────────────
// FIX: no CSRF existed — any credentialed cross-origin POST was accepted
// All state-mutating requests from our axios instance include X-Requested-With
// Server-to-server callbacks (M-Pesa, webhooks) are exempt via the skip fn
app.use((req, res, next) => {
  const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
  if (SAFE.has(req.method)) return next();
  // Exempt webhook/callback paths that receive server callbacks without custom
  // headers. These are protected instead by IP allowlisting (M-Pesa) or
  // signature verification (billing/Flutterwave) — see safaricomIp.js and
  // controllers/admin/billing.js.
  if (req.path.endsWith('/mpesa/callback') || req.path.endsWith('/mpesa/stk/callback') ||
      req.path.includes('/webhooks/') || req.path.endsWith('/billing/webhook')) return next();
  // Allow server-to-server (no Origin) in development only
  if (!req.headers.origin && process.env.NODE_ENV !== 'production') return next();
  if (req.headers['x-requested-with']) return next();
  return res.status(403).json({ error: 'CSRF check failed: X-Requested-With header missing' });
});

// ── Health check ──────────────────────────────────────────────
const pool = require('./config/db');
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'healthy',
      app: 'Smart Nyumba Pro API',
      version: process.env.npm_package_version || '2.0.0',
      db: 'connected',
      environment: process.env.NODE_ENV || 'development',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    res.status(503).json({ status: 'unhealthy', db: 'disconnected', error: e.message });
  }
});

// ── Apply auth-specific rate limits before routes ─────────────
app.use('/api/auth/login',           authLimiter);
app.use('/api/auth/self-register',   authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/otp/request',     otpLimiter);
app.use('/api/auth/otp/reset',       otpResetLimiter);  // FIX: added — was brute-forceable
app.use('/api/auth/mfa',             otpLimiter);

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth',            require('./routes/auth'));
app.use('/api/dashboard',       apiLimiter, require('./routes/dashboard'));  // FIX: rate-limited
app.use('/api/properties',      require('./routes/properties'));
app.use('/api/units',           require('./routes/units'));
app.use('/api/tenants',         require('./routes/tenants'));
app.use('/api/tenancies',       require('./routes/tenancies'));
app.use('/api/invoices',        require('./routes/invoices'));
app.use('/api/payments',        require('./routes/payments'));
app.use('/api/maintenance',     require('./routes/maintenance'));
app.use('/api/visitors',        require('./routes/visitors'));
app.use('/api/parking',         require('./routes/parking'));
app.use('/api/expenses',        require('./routes/expenses'));
app.use('/api/reports',         apiLimiter, require('./routes/reports'));  // FIX: rate-limited
app.use('/api/import',          require('./routes/import'));               // bulk CSV/XLSX import
app.use('/api/announcements',   require('./routes/announcements'));
app.use('/api/bulk-comms',      (() => {
  const r = require('express').Router();
  const auth = require('./middleware/auth');
  const bc = require('./controllers/admin/bulk_comms');
  const MGRS = ['super_admin','property_manager'];
  r.post('/remind',     auth(MGRS), bc.remindBulk);
  r.post('/sms-blast',  auth(MGRS), bc.announcementSmsBlast);
  return r;
})());
app.use('/api/vacate',          require('./routes/vacate'));
app.use('/api/utilities',       require('./routes/utilities'));
// FEATURE: /meter-readings/pending was called live by
// pages/caretaker/Dashboard.jsx with no backend implementation at all
// (see controllers/admin/utilities.js#getPending for the definition of
// "pending" used here). Standalone route rather than a whole new router
// file, matching the existing /api/brand pattern below.
app.get('/api/meter-readings/pending', require('./middleware/auth')(['super_admin','property_manager','caretaker']),
  require('./controllers/admin/utilities').getPending);
app.use('/api/users',           require('./routes/users'));
app.use('/api/settings',        require('./routes/settings'));
app.use('/api/mpesa',           require('./routes/mpesa'));
app.use('/api/mpesa/stk',        require('./routes/mpesaStk'));  // FIX: was /api/mpesa-stk
app.use('/api/pdf',             require('./routes/pdf'));
app.use('/api/vendors',         require('./routes/vendors'));
app.use('/api/vendor-invoices',  require('./routes/vendorInvoices'));
app.use('/api/access-log',      require('./routes/accessLog'));
app.use('/api/search',          require('./routes/search'));
app.use('/api/inspections',     require('./routes/inspections'));
app.use('/api/sharedMeters',    require('./routes/sharedMeters'));
app.use('/api/messages',        require('./routes/messages'));
app.use('/api/notifications',   require('./routes/notifications'));
app.use('/api/cases',           require('./routes/cases'));
app.use('/api/documents',       require('./routes/documents'));
app.use('/api/ratings',         require('./routes/ratings'));
app.use('/api/owner',           require('./routes/owner'));
app.use('/api/logbook',         require('./routes/logbook'));
app.use('/api/service-charges', require('./routes/serviceCharges'));

// ── Schedules (caretaker inspection/task schedules) ───────────
app.use('/api/schedules', (() => {
  const router = require('express').Router();
  const auth   = require('./middleware/auth');
  const pool   = require('./config/db');
  const roles  = ['super_admin','property_manager','caretaker'];
  router.get('/', auth(roles), async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM schedules WHERE 1=1 ORDER BY scheduled_date DESC LIMIT 50`
      ).catch(() => [[]]);
      res.json({ schedules: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  return router;
})());

// ── Cron log endpoint ────────────────────────────────────────
app.get('/api/cron-logs', require('./middleware/auth')(['super_admin']), async (req, res) => {
  try {
    const pool  = require('./config/db');
    const limit = parseInt(req.query.limit) || 50;
    const [rows] = await pool.query(
      'SELECT * FROM cron_logs ORDER BY started_at DESC LIMIT ?', [limit]);
    res.json({ logs: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Audit log endpoint ────────────────────────────────────────
app.get('/api/audit-log', require('./middleware/auth')(['super_admin']), async (req, res) => {
  try {
    const pool  = require('./config/db');
    const limit = parseInt(req.query.limit) || 50;
    const page  = parseInt(req.query.page)  || 1;
    const [rows] = await pool.query(
      'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, (page - 1) * limit]);
    const [[{total}]] = await pool.query('SELECT COUNT(*) AS total FROM audit_log');
    res.json({ logs: rows, total, page, limit });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Previously unmounted routes — now wired ─────────────────
// FIX: these route files existed but had no app.use() — all their
// endpoints returned 404. Wrapped in try/catch so a missing or
// broken file never crashes the entire server.
try {
  const ent = require('./routes/enterprise');
  // enterprise.js exports { serviceCharges, security, imports } — not a single router
  if (typeof ent === 'function')                app.use('/api/enterprise',              ent);
  else {
    if (ent.serviceCharges) app.use('/api/enterprise/service-charges', ent.serviceCharges);
    // BUG FIX: this was mounted at /api/enterprise/security, but the only
    // caller — pages/security/CheckIn.jsx's vehicle-plate lookup — calls
    // /api/security/vehicle-lookup (matching this file's own header
    // comment, which documents /api/security as the intended mount).
    // Every plate lookup 404'd.
    if (ent.security)       app.use('/api/security',              ent.security);
    if (ent.imports)        app.use('/api/enterprise/import',          ent.imports);
  }
} catch (_) {}
try { app.use('/api/security-logbook', require('./routes/securityLogbook')); } catch (_) {}
try { app.use('/api/sms',              require('./routes/sms'));              } catch (_) {}
try { app.use('/api/webhooks',         require('./routes/webhooks'));         } catch (_) {}

// ── SaaS routes ───────────────────────────────────────────────
// IMPORTANT: must be mounted BEFORE the 404 handler
const sseRouter    = require('./routes/sse');
const billingRouter = require('./routes/billing');
const orgRouter    = require('./routes/organisations');
const apiKeyRouter = require('./routes/apiKeys');
const jobsRouter   = require('./routes/jobs');

app.get ('/api/brand',                  require('./controllers/admin/organisations').brand);
app.post('/api/organisations/register', require('./controllers/admin/organisations').register);
app.use ('/api/organisations',          orgRouter);
app.use ('/api/billing',                billingRouter);
app.use ('/api/api-keys',               apiKeyRouter);
app.use ('/api/events',                 sseRouter);
app.use ('/api/jobs',                   jobsRouter);
// Versioned API — new integrations should use /api/v1/
app.use ('/api/v1',                     require('./routes/v1'));

// ── 404 handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.url} not found` });
});

// ── Global error handler ──────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;

  logger.error({
    message: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    requestId: req.id,
    method: req.method,
    url: req.url,
    userId: req.user?.sub,
  });

  // CORS errors
  if (err.message?.startsWith('CORS:')) {
    return res.status(403).json({ error: err.message });
  }

  // Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large' });
  }
  if (err.name === 'MulterError') {
    return res.status(400).json({ error: err.message });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // MySQL errors — strip internal details in production
  if (err.code?.startsWith('ER_')) {
    const msg = process.env.NODE_ENV === 'production'
      ? 'Database error'
      : err.message;
    return res.status(500).json({ error: msg });
  }

  res.status(status).json({
    error: process.env.NODE_ENV === 'production' && status === 500
      ? 'Internal server error'
      : err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { requestId: req.id }),
  });
});


module.exports = app;
