// backend/routes/auth.js
const router  = require('express').Router();
const auth    = require('../middleware/auth');
const { photoUpload } = require('../middleware/upload');
const c             = require('../controllers/auth/index');
const mfa           = require('../controllers/auth/mfa');
const selfRegister  = require('../controllers/auth/selfRegister');
const resetByEmail  = require('../controllers/auth/resetByEmail');

// ── Standard auth ─────────────────────────────────────────────
router.post('/login',           c.login);
router.post('/signup',          selfRegister.selfRegister);  // ✅ NEW - Maps to self-register
router.post('/refresh',         c.refresh);
router.post('/logout',          auth(), c.logout);
router.post('/logout-all',      auth(), c.logoutAll);   // revoke all sessions for this user
router.get('/me',               auth(), c.me);
router.put('/change-password',  auth(), c.changePassword);
router.put('/profile',          auth(), c.updateProfile);
router.post('/otp/request',     c.requestOtp);
router.post('/otp/reset',       c.resetPassword);
router.post('/photo',           auth(), photoUpload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const photoUrl = `/uploads/photos/${req.file.filename}`;
  require('../config/db').query('UPDATE users SET profile_photo=? WHERE id=?', [photoUrl, req.user.sub])
    .then(() => res.json({ success: true, photo_url: photoUrl, message: 'Photo updated' }))
    .catch(e => res.status(500).json({ error: e.message }));
});

// ── MFA (Two-Factor Authentication) ──────────────────────────
router.post('/mfa/enable',         auth(), mfa.enable);
router.post('/mfa/confirm-enable', auth(), mfa.confirmEnable);
router.post('/mfa/disable',        auth(), mfa.disable);
router.post('/mfa/verify',         mfa.verify);
router.post('/mfa/resend',         mfa.resend);

// ── Tenant self-registration ──────────────────────────────────
router.get('/invite/:slug',    selfRegister.getInviteInfo);
router.post('/self-register',  selfRegister.selfRegister);

// ── Email-based password reset (link) ─────────────────────────
router.post('/forgot-password',     resetByEmail.forgotPassword);
router.post('/reset-password-link', resetByEmail.resetPasswordByLink);

module.exports = router;