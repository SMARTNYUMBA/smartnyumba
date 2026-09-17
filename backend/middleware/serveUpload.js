'use strict';

/**
 * Authenticated static file serving for /uploads.
 *
 * Replaces the unauthenticated express.static('/uploads') mount in app.js.
 * All uploaded files (leases, documents, photos) require a valid JWT to access.
 *
 * Usage in app.js:
 *   app.use('/uploads', require('./middleware/serveUpload'));
 */

const path   = require('path');
const fs     = require('fs');
const jwt    = require('jsonwebtoken');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Allowed extensions — rejects path traversal and unexpected types
const ALLOWED_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif',
  '.pdf', '.docx', '.xlsx',
]);

module.exports = (req, res, next) => {
  // ── 1. Auth check ──────────────────────────────────────────
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required to access files' });
  }

  const secret = process.env.JWT_SECRET;
  try {
    jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // ── 2. Path sanitisation ───────────────────────────────────
  // Decode and strip leading slashes; block traversal sequences
  let relativePath;
  try {
    relativePath = decodeURIComponent(req.path).replace(/^\/+/, '');
  } catch {
    return res.status(400).json({ error: 'Invalid file path' });
  }

  if (relativePath.includes('..') || relativePath.includes('\0')) {
    return res.status(400).json({ error: 'Invalid file path' });
  }

  const ext = path.extname(relativePath).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return res.status(403).json({ error: 'File type not serveable' });
  }

  const fullPath = path.join(UPLOADS_DIR, relativePath);

  // Ensure the resolved path is still inside uploads dir (double-check)
  if (!fullPath.startsWith(UPLOADS_DIR + path.sep) && fullPath !== UPLOADS_DIR) {
    return res.status(400).json({ error: 'Invalid file path' });
  }

  // ── 3. Stream the file ─────────────────────────────────────
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Cache for 1 day — authenticated, so private
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.sendFile(fullPath);
};
