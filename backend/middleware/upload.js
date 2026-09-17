'use strict';

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

// ── Magic bytes for allowed types ─────────────────────────────
const MAGIC = {
  // Images
  'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
  'image/png':  [Buffer.from([0x89, 0x50, 0x4E, 0x47])],
  'image/webp': [Buffer.from([0x52, 0x49, 0x46, 0x46])],   // RIFF header — check bytes 8-12 for WEBP in fileFilter
  'image/gif':  [Buffer.from([0x47, 0x49, 0x46, 0x38])],
  // Documents
  'application/pdf': [Buffer.from([0x25, 0x50, 0x44, 0x46])],  // %PDF
  // MS Office (ZIP-based) — .docx .xlsx start with PK
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [Buffer.from([0x50, 0x4B, 0x03, 0x04])],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':       [Buffer.from([0x50, 0x4B, 0x03, 0x04])],
};

/**
 * Read the first N bytes of a stream to detect magic bytes.
 * multer stores the file in memory first when using memoryStorage,
 * or on disk when using diskStorage — for diskStorage we read the saved file.
 */
function sniffMime(filePath, allowedMimes) {
  const buf = Buffer.allocUnsafe(8);
  const fd  = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buf, 0, 8, 0);
  } finally {
    fs.closeSync(fd);
  }

  for (const mime of allowedMimes) {
    const magics = MAGIC[mime] || [];
    for (const magic of magics) {
      if (buf.slice(0, magic.length).equals(magic)) return mime;
    }
  }
  return null;
}

// ── Storage factories ─────────────────────────────────────────
function makeStorage(subdir) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, '..', 'uploads', subdir);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext  = path.extname(file.originalname).toLowerCase();
      const name = `${subdir}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      cb(null, name);
    },
  });
}

// ── Post-upload MIME verification middleware ──────────────────
/**
 * Use this AFTER multer to validate the saved file's magic bytes.
 * Deletes the file and rejects the request if MIME is spoofed.
 */
function verifyMime(allowedMimes) {
  return (req, res, next) => {
    if (!req.file && !req.files) return next();

    const files = req.files
      ? (Array.isArray(req.files) ? req.files : Object.values(req.files).flat())
      : [req.file];

    for (const file of files) {
      if (!file?.path) continue;
      const detected = sniffMime(file.path, allowedMimes);
      if (!detected) {
        fs.unlink(file.path, () => {});
        return res.status(400).json({ error: `File type not allowed. Detected content does not match an accepted format.` });
      }
      // Correct the mimetype field to the verified value
      file.mimetype = detected;
    }
    next();
  };
}

// ── Upload configurations ─────────────────────────────────────
const photoUpload = multer({
  storage: makeStorage('photos'),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExts.includes(ext)) {
      return cb(new Error(`Only image files allowed (jpg, png, webp, gif). Got: ${ext}`));
    }
    cb(null, true);
  },
});

// BUG FIX: added to support the missing POST /organisations/me/logo route
// (see controllers/admin/organisations.js uploadLogo) — OrgSettings.jsx
// already had a full upload UI wired to an endpoint that never existed.
const logoUpload = multer({
  storage: makeStorage('logos'),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExts.includes(ext)) {
      return cb(new Error(`Only image files allowed (jpg, png, webp). Got: ${ext}`));
    }
    cb(null, true);
  },
});

const leaseUpload = multer({
  storage: makeStorage('leases'),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error(`Only PDF, Word (.docx), or image files allowed. Got: ${ext}`));
    }
    cb(null, true);
  },
});

const docUpload = multer({
  storage: makeStorage('documents'),
  limits: { fileSize: 20 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.xlsx', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error(`Unsupported file type: ${ext}`));
    }
    cb(null, true);
  },
});

const photoMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const docMimes   = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
];

module.exports = {
  photoUpload,
  logoUpload,
  leaseUpload,
  docUpload,
  verifyMime,
  photoMimes,
  docMimes,
};