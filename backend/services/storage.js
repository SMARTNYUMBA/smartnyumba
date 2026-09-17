'use strict';

/**
 * SmartNyumba Pro — Storage Service
 *
 * Abstracts file storage behind a single interface so the app can switch
 * between local disk (development) and S3-compatible object storage
 * (production: AWS S3, Cloudflare R2, DigitalOcean Spaces) by changing
 * one environment variable.
 *
 * STORAGE_DRIVER=local   → saves to ./uploads/ (default, backward-compatible)
 * STORAGE_DRIVER=s3      → uploads to S3/R2 via AWS SDK v3
 *
 * Required env vars for S3:
 *   S3_BUCKET         — bucket name
 *   S3_REGION         — e.g. "af-south-1" or "auto" for R2
 *   S3_ENDPOINT       — custom endpoint URL (for R2/Spaces, leave blank for AWS)
 *   S3_ACCESS_KEY     — access key ID
 *   S3_SECRET_KEY     — secret access key
 *   S3_PUBLIC_URL     — base public URL for served files (e.g. https://cdn.example.com)
 *
 * Public API:
 *   storage.save(buffer, filename, mimeType)  → { url, key }
 *   storage.delete(key)                       → void
 *   storage.url(key)                          → string
 *   storage.multerStorage(subdir)             → multer StorageEngine
 */

const path = require('path');
const fs   = require('fs');
const crypto = require('crypto');

const DRIVER = (process.env.STORAGE_DRIVER || 'local').toLowerCase();

// ── LOCAL DRIVER ──────────────────────────────────────────────

function localSave(buffer, filename, subdir = 'uploads') {
  const dir = path.join(__dirname, '..', 'uploads', subdir);
  fs.mkdirSync(dir, { recursive: true });
  const ext  = path.extname(filename).toLowerCase();
  const name = `${subdir}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  const dest = path.join(dir, name);
  fs.writeFileSync(dest, buffer);
  const key = `uploads/${subdir}/${name}`;
  return { url: `/${key}`, key };
}

function localDelete(key) {
  try {
    const filePath = path.join(__dirname, '..', key);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {}
}

function localUrl(key) {
  return key.startsWith('/') ? key : `/${key}`;
}

// ── S3 DRIVER ─────────────────────────────────────────────────

let _s3Client = null;

function getS3Client() {
  if (_s3Client) return _s3Client;
  try {
    // Dynamically require so the app still boots without @aws-sdk installed
    const { S3Client } = require('@aws-sdk/client-s3');
    _s3Client = new S3Client({
      region:      process.env.S3_REGION || 'auto',
      endpoint:    process.env.S3_ENDPOINT || undefined,
      credentials: {
        accessKeyId:     process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY,
      },
      forcePathStyle: !!process.env.S3_ENDPOINT, // needed for Cloudflare R2 / MinIO
    });
    return _s3Client;
  } catch (e) {
    throw new Error(
      'S3 storage driver selected but @aws-sdk/client-s3 is not installed. ' +
      'Run: npm install @aws-sdk/client-s3 @aws-sdk/lib-storage'
    );
  }
}

async function s3Save(buffer, filename, subdir = 'uploads') {
  const { Upload } = require('@aws-sdk/lib-storage');
  const ext  = path.extname(filename).toLowerCase();
  const name = `${subdir}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;

  const upload = new Upload({
    client: getS3Client(),
    params: {
      Bucket:      process.env.S3_BUCKET,
      Key:         name,
      Body:        buffer,
      ContentType: mimeForExt(ext),
    },
  });
  await upload.done();

  const publicBase = (process.env.S3_PUBLIC_URL || '').replace(/\/$/, '');
  return { url: `${publicBase}/${name}`, key: name };
}

async function s3Delete(key) {
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  try {
    await getS3Client().send(new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key:    key,
    }));
  } catch (_) {}
}

function s3Url(key) {
  const publicBase = (process.env.S3_PUBLIC_URL || '').replace(/\/$/, '');
  return `${publicBase}/${key}`;
}

// ── Multer storage engine that routes through the driver ──────

function multerStorage(subdir = 'uploads') {
  const multer = require('multer'); // lazy-require: only needed when handling uploads
  if (DRIVER === 's3') {
    return multer.memoryStorage();
  }
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

// ── Helpers ───────────────────────────────────────────────────
function mimeForExt(ext) {
  const map = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png',  '.webp': 'image/webp',
    '.gif': 'image/gif',  '.pdf':  'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return map[ext] || 'application/octet-stream';
}

// ── Public interface ──────────────────────────────────────────
const storage = {
  driver: DRIVER,

  /**
   * Save a file buffer.
   * @param {Buffer} buffer
   * @param {string} originalName  original filename (for extension)
   * @param {string} subdir        subdirectory within bucket / uploads folder
   * @returns {{ url: string, key: string }}
   */
  save: async (buffer, originalName, subdir = 'uploads') => {
    if (DRIVER === 's3') return s3Save(buffer, originalName, subdir);
    return localSave(buffer, originalName, subdir);
  },

  /**
   * Delete a file by its storage key.
   */
  delete: async (key) => {
    if (DRIVER === 's3') return s3Delete(key);
    return localDelete(key);
  },

  /**
   * Get the public URL for a stored file key.
   */
  url: (key) => {
    if (!key) return null;
    if (DRIVER === 's3') return s3Url(key);
    return localUrl(key);
  },

  /**
   * Returns a multer StorageEngine for use in upload middleware.
   * For S3: returns memoryStorage (caller must call storage.save in the route).
   * For local: returns diskStorage writing to uploads/<subdir>/.
   */
  multerStorage,
};

module.exports = storage;
