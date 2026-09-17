// ── Currency formatting ───────────────────────────────────────
/**
 * Format a number as Kenyan Shillings.
 * Examples: fmt(12500) → "KES 12,500"
 */
export const fmt = (n) =>
  `KES ${Number(n || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

export const fmtDecimal = (n) =>
  `KES ${Number(n || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// ── Date formatting (East Africa Time) ───────────────────────
const EAT = { timeZone: 'Africa/Nairobi' };

export const fmtDate = (d) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-KE', {
      ...EAT,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch { return String(d); }
};

export const fmtDateShort = (d) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-KE', {
      ...EAT,
      day: '2-digit',
      month: 'short',
    });
  } catch { return String(d); }
};

export const fmtDateTime = (d) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('en-KE', {
      ...EAT,
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch { return String(d); }
};

export const fmtTime = (d) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleTimeString('en-KE', {
      ...EAT,
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch { return String(d); }
};

/**
 * Days remaining until a date (negative if past).
 */
export const daysUntil = (d) => {
  if (!d) return null;
  return Math.ceil((new Date(d) - new Date()) / (1000 * 60 * 60 * 24));
};

// ── Initials avatar ───────────────────────────────────────────
export const initials = (name = '') =>
  name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

// ── Status → badge class maps ─────────────────────────────────
const STATUS_MAP = {
  // Invoice / payment
  paid:          'badge-green',
  waived:        'badge-green',
  unpaid:        'badge-amber',
  partial:       'badge-purple',
  overdue:       'badge-red',
  cancelled:     'badge-gray',
  // Tenancy
  active:        'badge-green',
  terminated:    'badge-red',
  expired:       'badge-gray',
  notice_given:  'badge-purple',
  // Unit
  occupied:      'badge-blue',
  vacant:        'badge-gray',
  reserved:      'badge-purple',
  under_maintenance: 'badge-amber',
  // Maintenance / cases
  open:          'badge-amber',
  in_progress:   'badge-blue',
  assigned:      'badge-blue',
  completed:     'badge-green',
  resolved:      'badge-green',
  closed:        'badge-gray',
  cancelled:     'badge-gray',
  notice_given:  'badge-amber',
  vacated:       'badge-gray',
  terminated:    'badge-red',
  pending:       'badge-amber',
  // Visitor
  checked_in:    'badge-green',
  checked_out:   'badge-gray',
  // General
  failed:        'badge-red',
  success:       'badge-green',
  running:       'badge-blue',
};

export const statusColor = (status) => STATUS_MAP[status] || 'badge-gray';

// ── Priority → badge class ────────────────────────────────────
export const priorityColor = (p) => ({
  emergency: 'badge-red',
  urgent:    'badge-orange',
  normal:    'badge-blue',
  low:       'badge-gray',
}[p] || 'badge-gray');

// ── Role helpers ──────────────────────────────────────────────
export const roleColor = (role) => ({
  super_admin:       'badge-red',
  property_manager:  'badge-purple',
  owner:             'badge-purple',
  tenant:            'badge-blue',
  caretaker:         'badge-green',
  security:          'badge-teal',
}[role] || 'badge-gray');

export const roleName = (role) => ({
  super_admin:       'Super Admin',
  property_manager:  'Manager',
  owner:             'Owner',
  tenant:            'Tenant',
  caretaker:         'Caretaker',
  security:          'Security',
}[role] || role);

export const roleHome = (role) => ({
  super_admin:       '/admin',
  property_manager:  '/manager',
  owner:             '/owner',
  tenant:            '/tenant',
  caretaker:         '/caretaker',
  security:          '/security',
}[role] || '/login');

// ── Validation helpers ────────────────────────────────────────
/**
 * Validate an M-Pesa transaction code.
 * Returns an error string or null if valid.
 */
export const validateMpesaCode = (code) => {
  if (!code) return null;
  const upper = code.toUpperCase().replace(/\s/g, '');
  if (!/^[A-Z0-9]{10}$/.test(upper)) {
    return 'M-Pesa code must be exactly 10 alphanumeric characters (e.g. QK7Y3MPESA1)';
  }
  return null;
};

export const validateBankRef = (ref) => {
  if (!ref) return null;
  if (ref.length < 6) return 'Bank reference must be at least 6 characters';
  return null;
};

export const validatePhone = (phone) => {
  if (!phone) return null;
  const clean = phone.replace(/[\s\-+]/g, '');
  if (!/^(07|01|2547|2541)\d{8}$/.test(clean)) {
    return 'Enter a valid Kenyan phone number (07XX or 01XX)';
  }
  return null;
};

// ── Skeleton loader classes (for use in JSX) ──────────────────
export const skeletonClass = 'animate-pulse bg-slate-200 dark:bg-slate-700 rounded';

/**
 * Generate an array of placeholder items for skeleton lists.
 * Usage: skeletonRows(5).map((_, i) => <SkeletonRow key={i} />)
 */
export const skeletonRows = (n = 5) => Array.from({ length: n });

// ── Misc utilities ────────────────────────────────────────────
/**
 * Clamp a value between min and max.
 */
export const clamp = (val, min, max) => Math.min(max, Math.max(min, val));

/**
 * Truncate a string to a maximum length with ellipsis.
 */
export const truncate = (str, maxLen = 60) =>
  str && str.length > maxLen ? str.slice(0, maxLen) + '…' : str || '';

/**
 * Convert a byte count to a human-readable size string.
 */
export const fmtBytes = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

/**
 * Debounce a function (for search inputs).
 */
export const debounce = (fn, delay = 300) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
};

/**
 * Download a blob as a file (for PDF downloads).
 */
export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};