/**
 * Smart Nyumba Pro — API Client
 * Security improvements:
 *  - Access token stored in memory only (never localStorage) — XSS cannot steal it
 *  - User profile cached in sessionStorage (cleared when tab closes)
 *  - Refresh token sent as HttpOnly cookie by server in production
 *    (falls back to localStorage body token for dev/sandbox compatibility)
 *  - Race-condition-proof token refresh (single in-flight promise)
 *  - Structured error normalisation
 */

import axios from 'axios';

// ── Axios instance ────────────────────────────────────────────
const api = axios.create({
  baseURL:         import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL + '/api' : '/api',
  headers:         { 'Content-Type': 'application/json' },
  timeout:         20000,
  withCredentials: true,  // send HttpOnly cookies for refresh token
});

// ── Token storage — memory-first, no localStorage for tokens ──
// #3: Access token lives in memory only. XSS cannot read it.
// Refresh token: server sets as HttpOnly cookie in production.
// For dev/sandbox where cookie isn't set, we fall back to body token in sessionStorage.
let _accessToken = null;

export const tokenStore = {
  // Access token — memory only, never persisted
  getAccess:  ()  => _accessToken,
  setAccess:  (t) => { _accessToken = t; },

  // Refresh token — sessionStorage fallback for dev (HttpOnly cookie in prod)
  getRefresh: ()  => sessionStorage.getItem('snp_refresh'),
  setRefresh: (t) => { if (t) sessionStorage.setItem('snp_refresh', t); },

  // User profile — sessionStorage (cleared on tab close, not readable cross-tab like localStorage)
  getUser:    ()  => { try { return JSON.parse(sessionStorage.getItem('snp_user')); } catch { return null; } },
  setUser:    (u) => sessionStorage.setItem('snp_user', JSON.stringify(u)),

  clear: () => {
    _accessToken = null;
    sessionStorage.removeItem('snp_refresh');
    sessionStorage.removeItem('snp_user');
    // Also clear any legacy localStorage tokens from older versions
    try { localStorage.removeItem('snp_token'); localStorage.removeItem('snp_refresh'); localStorage.removeItem('snp_user'); } catch (_) {}
  },
};

// ── Request interceptor — attach token + request ID ───────────
api.interceptors.request.use(config => {
  const token = tokenStore.getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Required by server CSRF middleware — proves request came from our JS, not a forged form
  config.headers['X-Requested-With'] = 'XMLHttpRequest';
  config.headers['X-Request-ID'] = crypto.randomUUID();
  return config;
});

// ── Response interceptor — refresh token, normalise errors ────
let _refreshPromise = null;

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config;

    // Token expired → refresh once, then retry original request
    if (
      err.response?.status === 401 &&
      err.response?.data?.code === 'TOKEN_EXPIRED' &&
      !original._refreshAttempted
    ) {
      original._refreshAttempted = true;

      if (!_refreshPromise) {
        // Try refresh — server will use HttpOnly cookie in prod, body token in dev
        _refreshPromise = axios
          .post('/api/auth/refresh',
            { refresh_token: tokenStore.getRefresh() },
            { withCredentials: true })
          .then(({ data }) => {
            tokenStore.setAccess(data.access_token);
            if (data.refresh_token) tokenStore.setRefresh(data.refresh_token);
            return data.access_token;
          })
          .catch(() => {
            tokenStore.clear();
            window.location.href = '/login';
            return Promise.reject(new Error('Session expired'));
          })
          .finally(() => { _refreshPromise = null; });
      }

      try {
        const newToken = await _refreshPromise;
        original.headers.Authorization = `Bearer ${newToken}`;
        return api.request(original);
      } catch {
        return Promise.reject(err);
      }
    }

    // Any other 401 → logout (also catches a genuine 401 after a refresh attempt already ran)
    if (err.response?.status === 401 && !original._loggedOut) {
      original._loggedOut = true;
      tokenStore.clear();
      window.location.href = '/login';
    }

    // Normalise error shape for consistent UI handling
    const normalised = {
      message: err.response?.data?.error || err.response?.data?.message || err.message || 'Request failed',
      code:    err.response?.data?.code  || null,
      status:  err.response?.status,
      details: err.response?.data?.details || null,
    };
    return Promise.reject(Object.assign(err, { normalised }));
  }
);

export default api;

// ── Auth ──────────────────────────────────────────────────────
export const login           = d  => api.post('/auth/login', d);
export const logout          = d  => api.post('/auth/logout', d);
export const getMe           = () => api.get('/auth/me');
export const changePassword  = d  => api.put('/auth/change-password', d);
export const updateProfile   = d  => api.put('/auth/profile', d);
export const requestOtp      = d  => api.post('/auth/otp/request', d);
export const resetPassword   = d  => api.post('/auth/otp/reset', d);
export const uploadPhoto     = fd => api.post('/auth/photo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
export const enableMfa       = () => api.post('/auth/mfa/enable');
export const confirmMfa      = d  => api.post('/auth/mfa/confirm-enable', d);
export const disableMfa      = d  => api.post('/auth/mfa/disable', d);
export const verifyMfa       = d  => api.post('/auth/mfa/verify', d);

// ── Dashboard ─────────────────────────────────────────────────
export const getDashboard    = p  => api.get('/dashboard', { params: p });

// ── Properties ────────────────────────────────────────────────
export const getProperties   = ()     => api.get('/properties');
export const getProperty     = id     => api.get(`/properties/${id}`);
export const createProperty  = d      => api.post('/properties', d);
export const updateProperty  = (id,d) => api.put(`/properties/${id}`, d);
export const deleteProperty  = id     => api.delete(`/properties/${id}`);

// ── Units ─────────────────────────────────────────────────────
export const getUnits        = p      => api.get('/units', { params: p });
export const createUnit      = d      => api.post('/units', d);
export const updateUnit      = (id,d) => api.put(`/units/${id}`, d);

// ── Tenants ───────────────────────────────────────────────────
export const getTenants      = p      => api.get('/tenants', { params: p });
export const getTenant       = id     => api.get(`/tenants/${id}`);
export const createTenant    = d      => api.post('/tenants', d);
export const updateTenant    = (id,d) => api.put(`/tenants/${id}`, d);

// ── Tenancies ─────────────────────────────────────────────────
export const getTenancies    = p      => api.get('/tenancies', { params: p });
export const createTenancy   = d      => api.post('/tenancies', d);
export const updateTenancy   = (id,d) => api.put(`/tenancies/${id}`, d);
export const patchTenancy    = (id,d) => api.patch(`/tenancies/${id}`, d);
export const getMyTenancy    = ()     => api.get('/tenancies/my');
export const terminateTenancy= (id,d) => api.post(`/tenancies/${id}/terminate`, d);

// ── Invoices ──────────────────────────────────────────────────
export const getInvoices     = p      => api.get('/invoices', { params: p });
export const createInvoice   = d      => api.post('/invoices', d);
export const updateInvoice   = (id,d) => api.put(`/invoices/${id}`, d);
export const generateBulkInvoices = d      => api.post('/invoices/bulk', d);
export const sendBulkReminders    = d      => api.post('/invoices/remind-bulk', d);
export const waiveFee        = id     => api.post(`/invoices/${id}/waive-fee`);
export const markOverdue     = id     => api.put(`/invoices/${id}/overdue`);

// ── Payments ──────────────────────────────────────────────────
export const getPayments     = p      => api.get('/payments', { params: p });
export const recordPayment   = d      => api.post('/payments', d);
export const initiateStk     = d      => api.post('/payments/stk/initiate', d);
export const checkStk        = id     => api.get(`/payments/stk/${id}`);

// ── Maintenance ───────────────────────────────────────────────
export const getMaintenance  = p      => api.get('/maintenance', { params: p });
export const createMaintenance = d    => api.post('/maintenance', d);
export const updateMaintenance = (id,d) => api.put(`/maintenance/${id}`, d);

// ── Visitors ──────────────────────────────────────────────────
export const getVisitors     = p      => api.get('/visitors', { params: p });
export const checkInVisitor  = d      => api.post('/visitors', d);
export const checkOutVisitor = id     => api.put(`/visitors/${id}/out`);

// ── Parking ───────────────────────────────────────────────────
export const getParkingSlots  = ()     => api.get('/parking');
export const createParkingSlot= d      => api.post('/parking', d);
export const assignSlot       = (id,d) => api.put(`/parking/${id}/assign`, d);
export const updateSlotStatus = (id,d) => api.put(`/parking/${id}/status`, d);

// ── Expenses ──────────────────────────────────────────────────
export const getExpenses     = p      => api.get('/expenses', { params: p });
export const createExpense   = d      => api.post('/expenses', d);
export const deleteExpense   = id     => api.delete(`/expenses/${id}`);

// ── Reports ───────────────────────────────────────────────────
export const getReports      = p      => api.get('/reports/financial', { params: p });
export const getRentRoll     = p      => api.get('/reports/rent-roll', { params: p });
export const getOccupancy    = p      => api.get('/reports/occupancy', { params: p });

// ── Announcements ─────────────────────────────────────────────
export const getAnnouncements  = () => api.get('/announcements');
export const createAnnouncement= d  => api.post('/announcements', d);
export const deleteAnnouncement= id => api.delete(`/announcements/${id}`);

// ── Vacate ────────────────────────────────────────────────────
export const getVacateNotices   = p      => api.get('/vacate', { params: p });
export const createVacateNotice = d      => api.post('/vacate', d);
export const updateVacateNotice = (id,d) => api.put(`/vacate/${id}`, d);
// submitVacate removed — duplicate of createVacateNotice
// updateVacate removed — duplicate of updateVacateNotice

// ── Utilities / Meters ────────────────────────────────────────
export const getReadings       = p      => api.get('/utilities', { params: p });
export const createReading     = d      => api.post('/utilities', d);
export const getSharedMeters   = ()     => api.get('/sharedMeters');

// ── Users ─────────────────────────────────────────────────────
// getUsers with pagination params is exported at the bottom of this file
export const createUser        = d      => api.post('/users', d);
export const updateUser        = (id,d) => api.put(`/users/${id}`, d);
export const deleteUser        = id     => api.delete(`/users/${id}`);
export const resetUserPassword = (id,d) => api.put(`/users/${id}/password`, d);
export const uploadUserPhoto   = (id,fd)=> api.post(`/users/${id}/photo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });

// ── Settings ──────────────────────────────────────────────────
export const getSettings       = ()    => api.get('/settings');
export const updateSettings    = d     => api.put('/settings', d);
export const getAlerts         = ()    => api.get('/settings/alerts');
export const createAlert       = d     => api.post('/settings/alerts', d);

// ── Cases ─────────────────────────────────────────────────────
export const getCases          = p     => api.get('/cases', { params: p });
export const createCase        = d     => api.post('/cases', d);
export const updateCase        = (id,d)=> api.put(`/cases/${id}`, d);

// ── Documents ─────────────────────────────────────────────────
export const getDocuments      = p     => api.get('/documents', { params: p });
export const uploadDocument    = fd    => api.post('/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteDocument    = id    => api.delete(`/documents/${id}`);

// ── Messages ──────────────────────────────────────────────────
export const getMessages       = ()    => api.get('/messages');
export const sendMessage       = d     => api.post('/messages', d);

// ── Notifications ─────────────────────────────────────────────
export const getNotifications  = ()    => api.get('/notifications');
export const markNotifRead     = id    => api.put(`/notifications/${id}/read`);
export const markAllNotifRead  = ()    => api.put('/notifications/read-all');

// ── Service charges ───────────────────────────────────────────
export const getServiceCharges = p     => api.get('/service-charges', { params: p });
export const createServiceCharge = d   => api.post('/service-charges', d);

// ── Access log ────────────────────────────────────────────────
export const getAccessLog      = p     => api.get('/access-log', { params: p });

// ── Owner ─────────────────────────────────────────────────────
export const getOwnerDashboard = ()    => api.get('/owner/dashboard');
export const getOwnerRemittances = ()  => api.get('/owner/remittances');

// ── PDF downloads ─────────────────────────────────────────────
export const downloadInvoicePdf = id  => api.get(`/pdf/invoice/${id}`, { responseType: 'blob' });
export const downloadStatement  = id  => api.get(`/pdf/statement/${id}`, { responseType: 'blob' });
export const downloadReceipt    = id  => api.get(`/pdf/receipt/${id}`, { responseType: 'blob' });
// ── Auth — email-based password reset (#4, #11) ───────────────
export const forgotPasswordEmail    = d => api.post('/auth/forgot-password', d);
export const resetPasswordByLink    = d => api.post('/auth/reset-password-link', d);

// ── Auth — duplicate cleanup (#9) ────────────────────────────
// Removed duplicate bulkInvoices — use generateBulkInvoices only
// export const bulkInvoices = ... (removed duplicate)

// ── Onboarding (#11) ─────────────────────────────────────────
export const getOnboardingStatus   = () => api.get('/onboarding/status');

// ── Users — paginated (#11, #14) ─────────────────────────────
export const getUsers              = (p) => api.get('/users', { params: p });
export const suspendUser           = (id, d) => api.put(`/users/${id}/suspend`, d);
export const unsuspendUser         = (id)    => api.put(`/users/${id}/unsuspend`);
export const inviteUser            = (d)     => api.post('/users/invite', d);

// ── GDPR data export (#26) ───────────────────────────────────
export const exportMyData          = ()   => api.get('/auth/export-data');

// ── Health / metrics ─────────────────────────────────────────
export const getHealthMetrics      = ()   => api.get('/health'); // fixed: /health/metrics 404

// ── SaaS / Organisation ──────────────────────────────────────────────────────
export const registerOrg        = d     => api.post('/organisations/register', d);
export const getMyOrg           = ()    => api.get('/organisations/me');
export const updateMyOrg        = d     => api.patch('/organisations/me', d);
export const getOrgAuditLog     = p     => api.get('/organisations/audit', { params: p });
export const getActiveSessions  = p     => api.get('/organisations/sessions', { params: p });
export const revokeSession      = id    => api.delete(`/organisations/sessions/${id}`);

// ── API Keys ─────────────────────────────────────────────────────────────────
export const getApiKeys         = ()    => api.get('/api-keys');
export const createApiKey       = d     => api.post('/api-keys', d);
export const revokeApiKey       = id   => api.delete(`/api-keys/${id}`);

// ── Billing ──────────────────────────────────────────────────────────────────
export const getBillingStatus   = ()    => api.get('/billing/status');
export const getBillingPlans    = ()    => api.get('/billing/plans');
export const getBillingInvoices = ()    => api.get('/billing/invoices');
export const initiateBilling    = d     => api.post('/billing/initiate', d);

// ── Jobs ─────────────────────────────────────────────────────────────────────
export const getJob             = id   => api.get(`/jobs/${id}`);

// ── Tenant transfer ──────────────────────────────────────────────────────────
export const getTransferOptions = (tenancyId) => api.get(`/tenancies/${tenancyId}/transfer-options`);
export const transferTenant     = (tenancyId, d) => api.post(`/tenancies/${tenancyId}/transfer`, d);

// ── Billing mode ─────────────────────────────────────────────────────────────
export const setBillingMode     = (tenancyId, billing_mode) => api.patch(`/tenancies/${tenancyId}/billing-mode`, { billing_mode });

// ── Invoice control ───────────────────────────────────────────────────────────
export const sendInvoiceMessage = (d)    => api.post('/invoices/message', d);
export const reverseInvoices    = (d)    => api.post('/invoices/reverse', d);
export const reverseBulk        = (d)    => api.post('/invoices/reverse-bulk', d);