/**
 * roleGuard.js — role-based UI visibility helpers
 *
 * Usage:
 *   import { can, isSuperAdmin, isManager } from '../../utils/roleGuard';
 *   const { user } = useAuth();
 *
 *   {can(user, 'manage_users') && <button>Delete</button>}
 *   {isSuperAdmin(user) && <AdminOnlyTab />}
 *
 * Design principle: the API already enforces role scoping — these guards
 * are purely cosmetic, preventing confusion and accidental clicks. The
 * backend returns 403 if a manager somehow hits a super_admin endpoint.
 */

export const isSuperAdmin = (user) => user?.role === 'super_admin';
export const isManager    = (user) => user?.role === 'property_manager';
export const isTenant     = (user) => user?.role === 'tenant';
export const isCaretaker  = (user) => user?.role === 'caretaker';
export const isSecurity   = (user) => user?.role === 'security';
export const isOwner      = (user) => user?.role === 'owner';
export const isAdmin      = (user) => ['super_admin', 'property_manager'].includes(user?.role);
export const isStaff      = (user) => ['super_admin', 'property_manager', 'caretaker', 'security'].includes(user?.role);

/**
 * Permission map — what each role can do in the UI.
 * super_admin implicitly gets everything.
 */
const PERMISSIONS = {
  // Tenant management
  create_tenant:         ['super_admin', 'property_manager'],
  delete_tenant:         ['super_admin'],
  edit_tenant:           ['super_admin', 'property_manager'],
  view_tenant_id:        ['super_admin', 'property_manager'],

  // Financial
  create_invoice:        ['super_admin', 'property_manager'],
  delete_invoice:        ['super_admin'],
  bulk_generate:         ['super_admin', 'property_manager'],
  record_payment:        ['super_admin', 'property_manager'],
  delete_payment:        ['super_admin'],
  waive_late_fee:        ['super_admin', 'property_manager'],
  create_expense:        ['super_admin', 'property_manager'],
  delete_expense:        ['super_admin'],
  view_reports:          ['super_admin', 'property_manager', 'owner'],
  record_remittance:     ['super_admin', 'property_manager'],

  // Properties
  create_property:       ['super_admin'],
  delete_property:       ['super_admin'],
  edit_property:         ['super_admin', 'property_manager'],
  create_unit:           ['super_admin', 'property_manager'],
  delete_unit:           ['super_admin'],

  // System
  manage_users:          ['super_admin'],
  view_audit_log:        ['super_admin'],
  manage_settings:       ['super_admin'],
  manage_org:            ['super_admin'],
  api_keys:              ['super_admin'],
  webhooks:              ['super_admin'],
  bulk_import:           ['super_admin', 'property_manager'],

  // Operations
  manage_maintenance:    ['super_admin', 'property_manager', 'caretaker'],
  manage_visitors:       ['super_admin', 'property_manager', 'security', 'caretaker'],
  manage_parking:        ['super_admin', 'property_manager', 'security'],
  manage_announcements:  ['super_admin', 'property_manager'],
  manage_staff:          ['super_admin', 'property_manager'],
  view_vendors:          ['super_admin', 'property_manager'],
  manage_vendors:        ['super_admin'],
  manage_service_charges:['super_admin', 'property_manager'],
  manage_utilities:      ['super_admin', 'property_manager', 'caretaker'],
  enter_meter_readings:  ['super_admin', 'property_manager', 'caretaker'],
};

/**
 * Check if a user has a specific permission.
 * @param {object} user  — the auth user object { role, ... }
 * @param {string} perm  — key from PERMISSIONS above
 */
export function can(user, perm) {
  if (!user) return false;
  if (user.role === 'super_admin') return true; // super admin can do everything
  const allowed = PERMISSIONS[perm];
  if (!allowed) return false;
  return allowed.includes(user.role);
}

/**
 * Returns the set of permissions for a role as a Set for fast lookup.
 */
export function permissionsFor(role) {
  const s = new Set();
  if (role === 'super_admin') {
    Object.keys(PERMISSIONS).forEach(k => s.add(k));
    return s;
  }
  Object.entries(PERMISSIONS).forEach(([k, roles]) => {
    if (roles.includes(role)) s.add(k);
  });
  return s;
}
