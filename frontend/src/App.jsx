/**
 * Smart Nyumba Pro — Root App Component
 * Features:
 *  - Role-based code splitting via React.lazy (each role group = separate chunk)
 *  - Error boundaries around every role portal
 *  - Loading skeleton during chunk download
 *  - Sentry-ready error boundary callback
 */

import React, { Suspense, lazy, Component } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import useSSE from './hooks/useSSE';
import { LanguageProvider } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';

// ── Eager-loaded (tiny, always needed) ───────────────────────
import Login               from './pages/auth/Login';
import NotFound            from './pages/NotFound';
import ResetPasswordByLink from './pages/auth/ResetPasswordByLink';
import SelfRegister        from './pages/auth/SelfRegister';
import SessionTimeout from './components/ui/SessionTimeout';
import ForgotPassword from './pages/auth/ForgotPassword';

// ── Safe lazy loader — shows error card instead of crashing ──
const safeLazy = (importer) => lazy(() =>
  importer().catch(() => ({ default: () => (
    <div style={{padding:'40px',textAlign:'center',color:'#64748b'}}>
      <p style={{fontSize:'2rem',marginBottom:'8px'}}>⚠️</p>
      <p style={{fontWeight:600,marginBottom:'4px'}}>Page failed to load</p>
      <p style={{fontSize:'13px'}}>Try refreshing the page.</p>
    </div>
  )}))
);

// ── Lazy-loaded by role group (separate webpack/vite chunks) ──
const AdminPages      = {
  Dashboard:     safeLazy(() => import('./pages/admin/Dashboard')),
  Properties:    safeLazy(() => import('./pages/admin/Properties')),
  Units:         safeLazy(() => import('./pages/admin/Units')),
  Tenants:       safeLazy(() => import('./pages/admin/Tenants')),
  Tenancies:     safeLazy(() => import('./pages/admin/Tenancies')),
  Invoices:      safeLazy(() => import('./pages/admin/Invoices')),
  Payments:      safeLazy(() => import('./pages/admin/Payments')),
  Expenses:      safeLazy(() => import('./pages/admin/Expenses')),
  Reports:       safeLazy(() => import('./pages/admin/Reports')),
  Maintenance:   safeLazy(() => import('./pages/admin/Maintenance')),
  Visitors:      safeLazy(() => import('./pages/admin/Visitors')),
  Parking:       safeLazy(() => import('./pages/admin/Parking')),
  Utilities:     safeLazy(() => import('./pages/admin/Utilities')),
  Announcements: safeLazy(() => import('./pages/admin/Announcements')),
  Vacate:        safeLazy(() => import('./pages/admin/Vacate')),
  Users:         safeLazy(() => import('./pages/admin/Users')),
  Settings:      safeLazy(() => import('./pages/admin/Settings')),
  Cases:         safeLazy(() => import('./pages/admin/Cases')),
  Vendors:       safeLazy(() => import('./pages/admin/Vendors')),
  SharedMeters:  safeLazy(() => import('./pages/admin/SharedMeters')),
  ServiceCharges:safeLazy(() => import('./pages/admin/ServiceCharges')),
  BulkImport:    safeLazy(() => import('./pages/admin/BulkImport')),
  VendorInvoices:safeLazy(() => import('./pages/admin/VendorInvoices')),
};

const ManagerPages    = {
  Dashboard:     safeLazy(() => import('./pages/manager/Dashboard')),
  Properties:    safeLazy(() => import('./pages/manager/Properties')),
  Units:         safeLazy(() => import('./pages/manager/Units')),
  Tenants:       safeLazy(() => import('./pages/manager/Tenants')),
  Tenancies:     safeLazy(() => import('./pages/manager/Tenancies')),
  Invoices:      safeLazy(() => import('./pages/manager/Invoices')),
  Payments:      safeLazy(() => import('./pages/manager/Payments')),
  Expenses:      safeLazy(() => import('./pages/manager/Expenses')),
  Reports:       safeLazy(() => import('./pages/manager/Reports')),
  Maintenance:   safeLazy(() => import('./pages/manager/Maintenance')),
  Visitors:      safeLazy(() => import('./pages/manager/Visitors')),
  Parking:       safeLazy(() => import('./pages/manager/Parking')),
  Utilities:     safeLazy(() => import('./pages/manager/Utilities')),
  Announcements: safeLazy(() => import('./pages/manager/Announcements')),
  Vacate:        safeLazy(() => import('./pages/manager/Vacate')),
  SharedMeters:  safeLazy(() => import('./pages/manager/SharedMeters')),
  Vendors:       safeLazy(() => import('./pages/manager/Vendors')),
  Staff:         safeLazy(() => import('./pages/manager/Staff')),
  VendorInvoices:safeLazy(() => import('./pages/admin/VendorInvoices')),
  Remittances:   safeLazy(() => import('./pages/manager/Remittances')),
};

const TenantPages     = {
  Dashboard:     safeLazy(() => import('./pages/tenant/Dashboard')),
  Invoices:      safeLazy(() => import('./pages/tenant/Invoices')),
  Payments:      safeLazy(() => import('./pages/tenant/Payments')),
  Maintenance:   safeLazy(() => import('./pages/tenant/Maintenance')),
  Visitors:      safeLazy(() => import('./pages/tenant/Visitors')),
  Vacate:        safeLazy(() => import('./pages/tenant/VacateNotice')),
  Announcements: safeLazy(() => import('./pages/tenant/Announcements')),
  Statement:     safeLazy(() => import('./pages/tenant/Statement')),
  Ledger:        safeLazy(() => import('./pages/tenant/Ledger')),
  Utilities:     safeLazy(() => import('./pages/tenant/Utilities')),
  Cases:         safeLazy(() => import('./pages/tenant/Cases')),
};

const CaretakerPages  = {
  Dashboard:     safeLazy(() => import('./pages/caretaker/Dashboard')),
  Readings:      safeLazy(() => import('./pages/caretaker/Readings')),
  Inspections:   safeLazy(() => import('./pages/caretaker/Inspections')),
  Maintenance:   safeLazy(() => import('./pages/caretaker/Maintenance')),
  Units:         safeLazy(() => import('./pages/caretaker/Units')),
  Tenants:       safeLazy(() => import('./pages/caretaker/Tenants')),
  Announcements: safeLazy(() => import('./pages/manager/Announcements')), // reuse manager page
};

const SecurityPages   = {
  Dashboard:     safeLazy(() => import('./pages/security/Dashboard')),
  CheckIn:       safeLazy(() => import('./pages/security/CheckIn')),
  Visitors:      safeLazy(() => import('./pages/security/Visitors')),
  Parking:       safeLazy(() => import('./pages/security/Parking')),
  Units:         safeLazy(() => import('./pages/security/Units')),
  Alerts:        safeLazy(() => import('./pages/security/Alerts')),
  AccessLog:     safeLazy(() => import('./pages/security/AccessLog')),
  Logbook:       safeLazy(() => import('./pages/security/Logbook')),
};

const OwnerPages      = {
  Dashboard:     safeLazy(() => import('./pages/owner/Dashboard')),
  Remittances:   safeLazy(() => import('./pages/owner/Remittances')),
  Properties:    safeLazy(() => import('./pages/owner/Properties')),
  Units:         safeLazy(() => import('./pages/owner/Units')),
  Maintenance:   safeLazy(() => import('./pages/owner/Maintenance')),
  Invoices:      safeLazy(() => import('./pages/owner/Invoices')),
  Expenses:      safeLazy(() => import('./pages/owner/Expenses')),
  Tenants:       safeLazy(() => import('./pages/owner/Tenants')),
};

const SharedPages     = {
  Profile:       safeLazy(() => import('./pages/shared/Profile')),
  Messages:      safeLazy(() => import('./pages/shared/Messages')),
};

// ── SaaS pages ──────────────────────────────────────────────────────
// Register.jsx import removed — was routed to dead code, see note near
// the SaaS routes section below. The component still exists on disk.
const OrgSignup   = safeLazy(() => import('./pages/auth/OrgSignup'));
const Onboarding  = safeLazy(() => import('./pages/auth/Onboarding'));
const Billing     = safeLazy(() => import('./pages/admin/Billing'));
const ApiKeys     = safeLazy(() => import('./pages/admin/ApiKeys'));
const OrgSettings = safeLazy(() => import('./pages/admin/OrgSettings'));
const AuditLog    = safeLazy(() => import('./pages/admin/AuditLog'));
const Sessions    = safeLazy(() => import('./pages/admin/Sessions'));
import CrispChat  from './components/ui/CrispChat';

// ── TanStack Query client ─────────────────────────────────────
const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:          30_000,
      retry:              1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});


// ── SSE Bootstrapper — runs inside QueryClientProvider + AuthProvider ────────
// Calls useSSE only when user is authenticated. Placed here (not in AuthContext)
// so it has access to QueryClientProvider which useQueryClient() requires.
function SSEBootstrapper() {
  const { user } = useAuth();
  // Only mount SSE connection when logged in
  if (!user) return null;
  return <SSEConnection />;
}
function SSEConnection() {
  useSSE();
  return null;
}

// ── Full-page loading skeleton ────────────────────────────────
function PageSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    </div>
  );
}

// ── Error Boundary ────────────────────────────────────────────
class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Report to Sentry if available
    if (window.Sentry) {
      window.Sentry.captureException(error, { contexts: { react: info } });
    }
    console.error('Page error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-slate-50 dark:bg-slate-900">
          <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 transition-colors"
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Protected route wrapper ───────────────────────────────────
function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();

  if (loading) return <PageSkeleton />;
  if (!user)   return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/login" replace />;

  return (
    <PageErrorBoundary>
        <SessionTimeout />
      <Suspense fallback={<PageSkeleton />}>
        {children}
      </Suspense>
    </PageErrorBoundary>
  );
}

const A  = ['super_admin'];
const AM = ['super_admin', 'property_manager'];

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <AuthProvider>
        <SSEBootstrapper />
          <LanguageProvider>
            <BrowserRouter>
              <CrispChat />
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 4000,
                  style: { borderRadius: '12px', fontSize: '14px' },
                  success: { iconTheme: { primary: '#16a34a', secondary: '#fff' } },
                  error:   { iconTheme: { primary: '#dc2626', secondary: '#fff' } },
                }}
              />

              <Routes>
                {/* Public */}
                <Route path="/login"           element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPasswordByLink />} />
                <Route path="/signup"          element={<OrgSignup />} />
                <Route path="/join/:slug"       element={<SelfRegister />} />
                <Route path="/register"          element={<SelfRegister />} />
                <Route path="/onboarding"       element={<Onboarding />} />
                <Route path="/"                element={<Navigate to="/login" replace />} />

                {/* Shared (all authenticated roles) */}
                <Route path="/profile"  element={<ProtectedRoute><SharedPages.Profile /></ProtectedRoute>} />
                <Route path="/messages" element={<ProtectedRoute><SharedPages.Messages /></ProtectedRoute>} />

                {/* ── Super Admin ──────────────────────────────── */}
                <Route path="/admin"                   element={<ProtectedRoute roles={A}><AdminPages.Dashboard /></ProtectedRoute>} />
                <Route path="/admin/properties"        element={<ProtectedRoute roles={A}><AdminPages.Properties /></ProtectedRoute>} />
                <Route path="/admin/units"             element={<ProtectedRoute roles={A}><AdminPages.Units /></ProtectedRoute>} />
                <Route path="/admin/tenants"           element={<ProtectedRoute roles={A}><AdminPages.Tenants /></ProtectedRoute>} />
                <Route path="/admin/tenancies"         element={<ProtectedRoute roles={A}><AdminPages.Tenancies /></ProtectedRoute>} />
                <Route path="/admin/invoices"          element={<ProtectedRoute roles={A}><AdminPages.Invoices /></ProtectedRoute>} />
                <Route path="/admin/payments"          element={<ProtectedRoute roles={A}><AdminPages.Payments /></ProtectedRoute>} />
                <Route path="/admin/expenses"          element={<ProtectedRoute roles={A}><AdminPages.Expenses /></ProtectedRoute>} />
                <Route path="/admin/reports"           element={<ProtectedRoute roles={A}><AdminPages.Reports /></ProtectedRoute>} />
                <Route path="/admin/maintenance"       element={<ProtectedRoute roles={A}><AdminPages.Maintenance /></ProtectedRoute>} />
                <Route path="/admin/visitors"          element={<ProtectedRoute roles={A}><AdminPages.Visitors /></ProtectedRoute>} />
                <Route path="/admin/parking"           element={<ProtectedRoute roles={A}><AdminPages.Parking /></ProtectedRoute>} />
                <Route path="/admin/utilities"         element={<ProtectedRoute roles={A}><AdminPages.Utilities /></ProtectedRoute>} />
                <Route path="/admin/announcements"     element={<ProtectedRoute roles={A}><AdminPages.Announcements /></ProtectedRoute>} />
                <Route path="/admin/vacate"            element={<ProtectedRoute roles={A}><AdminPages.Vacate /></ProtectedRoute>} />
                <Route path="/admin/users"             element={<ProtectedRoute roles={A}><AdminPages.Users /></ProtectedRoute>} />
                <Route path="/admin/settings"          element={<ProtectedRoute roles={A}><AdminPages.Settings /></ProtectedRoute>} />
                <Route path="/admin/cases"             element={<ProtectedRoute roles={A}><AdminPages.Cases /></ProtectedRoute>} />
                <Route path="/admin/vendors"           element={<ProtectedRoute roles={A}><AdminPages.Vendors /></ProtectedRoute>} />
                <Route path="/admin/shared-meters"     element={<ProtectedRoute roles={A}><AdminPages.SharedMeters /></ProtectedRoute>} />
                <Route path="/admin/service-charges"   element={<ProtectedRoute roles={A}><AdminPages.ServiceCharges /></ProtectedRoute>} />
                <Route path="/admin/bulk-import"            element={<ProtectedRoute roles={A}><AdminPages.BulkImport /></ProtectedRoute>} />
                <Route path="/admin/vendor-invoices"   element={<ProtectedRoute roles={A}><AdminPages.VendorInvoices /></ProtectedRoute>} />

                {/* ── Property Manager ─────────────────────────── */}
                <Route path="/manager"                 element={<ProtectedRoute roles={AM}><ManagerPages.Dashboard /></ProtectedRoute>} />
                <Route path="/manager/properties"      element={<ProtectedRoute roles={AM}><ManagerPages.Properties /></ProtectedRoute>} />
                <Route path="/manager/units"           element={<ProtectedRoute roles={AM}><ManagerPages.Units /></ProtectedRoute>} />
                <Route path="/manager/tenants"         element={<ProtectedRoute roles={AM}><ManagerPages.Tenants /></ProtectedRoute>} />
                <Route path="/manager/tenancies"       element={<ProtectedRoute roles={AM}><ManagerPages.Tenancies /></ProtectedRoute>} />
                <Route path="/manager/invoices"        element={<ProtectedRoute roles={AM}><ManagerPages.Invoices /></ProtectedRoute>} />
                <Route path="/manager/payments"        element={<ProtectedRoute roles={AM}><ManagerPages.Payments /></ProtectedRoute>} />
                <Route path="/manager/expenses"        element={<ProtectedRoute roles={AM}><ManagerPages.Expenses /></ProtectedRoute>} />
                <Route path="/manager/reports"         element={<ProtectedRoute roles={AM}><ManagerPages.Reports /></ProtectedRoute>} />
                <Route path="/manager/maintenance"     element={<ProtectedRoute roles={AM}><ManagerPages.Maintenance /></ProtectedRoute>} />
                <Route path="/manager/visitors"        element={<ProtectedRoute roles={AM}><ManagerPages.Visitors /></ProtectedRoute>} />
                <Route path="/manager/parking"         element={<ProtectedRoute roles={AM}><ManagerPages.Parking /></ProtectedRoute>} />
                <Route path="/manager/utilities"       element={<ProtectedRoute roles={AM}><ManagerPages.Utilities /></ProtectedRoute>} />
                <Route path="/manager/announcements"   element={<ProtectedRoute roles={AM}><ManagerPages.Announcements /></ProtectedRoute>} />
                <Route path="/manager/vacate"          element={<ProtectedRoute roles={AM}><ManagerPages.Vacate /></ProtectedRoute>} />
                <Route path="/manager/shared-meters"   element={<ProtectedRoute roles={AM}><ManagerPages.SharedMeters /></ProtectedRoute>} />
                <Route path="/manager/vendors"         element={<ProtectedRoute roles={AM}><ManagerPages.Vendors /></ProtectedRoute>} />
                <Route path="/manager/remittances"     element={<ProtectedRoute roles={['property_manager']}><ManagerPages.Remittances /></ProtectedRoute>} />
                <Route path="/manager/staff"           element={<ProtectedRoute roles={['property_manager']}><ManagerPages.Staff /></ProtectedRoute>} />
                <Route path="/manager/vendor-invoices"  element={<ProtectedRoute roles={['property_manager']}><ManagerPages.VendorInvoices /></ProtectedRoute>} />

                {/* ── Tenant ───────────────────────────────────── */}
                <Route path="/tenant"                  element={<ProtectedRoute roles={['tenant']}><TenantPages.Dashboard /></ProtectedRoute>} />
                <Route path="/tenant/invoices"         element={<ProtectedRoute roles={['tenant']}><TenantPages.Invoices /></ProtectedRoute>} />
                <Route path="/tenant/payments"         element={<ProtectedRoute roles={['tenant']}><TenantPages.Payments /></ProtectedRoute>} />
                <Route path="/tenant/maintenance"      element={<ProtectedRoute roles={['tenant']}><TenantPages.Maintenance /></ProtectedRoute>} />
                <Route path="/tenant/visitors"         element={<ProtectedRoute roles={['tenant']}><TenantPages.Visitors /></ProtectedRoute>} />
                <Route path="/tenant/vacate"           element={<ProtectedRoute roles={['tenant']}><TenantPages.Vacate /></ProtectedRoute>} />
                <Route path="/tenant/announcements"    element={<ProtectedRoute roles={['tenant']}><TenantPages.Announcements /></ProtectedRoute>} />
                <Route path="/tenant/statement"        element={<ProtectedRoute roles={['tenant']}><TenantPages.Statement /></ProtectedRoute>} />
                <Route path="/tenant/ledger"           element={<ProtectedRoute roles={['tenant']}><TenantPages.Ledger /></ProtectedRoute>} />
                <Route path="/tenant/utilities"        element={<ProtectedRoute roles={['tenant']}><TenantPages.Utilities /></ProtectedRoute>} />
                <Route path="/tenant/cases"            element={<ProtectedRoute roles={['tenant']}><TenantPages.Cases /></ProtectedRoute>} />

                {/* ── Caretaker ────────────────────────────────── */}
                <Route path="/caretaker"               element={<ProtectedRoute roles={['caretaker']}><CaretakerPages.Dashboard /></ProtectedRoute>} />
                <Route path="/caretaker/readings"      element={<ProtectedRoute roles={['caretaker']}><CaretakerPages.Readings /></ProtectedRoute>} />
                <Route path="/caretaker/inspections"   element={<ProtectedRoute roles={['caretaker']}><CaretakerPages.Inspections /></ProtectedRoute>} />
                <Route path="/caretaker/maintenance"   element={<ProtectedRoute roles={['caretaker']}><CaretakerPages.Maintenance /></ProtectedRoute>} />
                <Route path="/caretaker/announcements" element={<ProtectedRoute roles={['caretaker']}><CaretakerPages.Announcements /></ProtectedRoute>} />
                <Route path="/caretaker/units"         element={<ProtectedRoute roles={['caretaker']}><CaretakerPages.Units /></ProtectedRoute>} />
                <Route path="/caretaker/tenants"       element={<ProtectedRoute roles={['caretaker']}><CaretakerPages.Tenants /></ProtectedRoute>} />

                {/* ── Security ─────────────────────────────────── */}
                <Route path="/security"                element={<ProtectedRoute roles={['security']}><SecurityPages.Dashboard /></ProtectedRoute>} />
                <Route path="/security/check-in"       element={<ProtectedRoute roles={['security']}><SecurityPages.CheckIn /></ProtectedRoute>} />
                <Route path="/security/visitors"       element={<ProtectedRoute roles={['security']}><SecurityPages.Visitors /></ProtectedRoute>} />
                <Route path="/security/parking"        element={<ProtectedRoute roles={['security']}><SecurityPages.Parking /></ProtectedRoute>} />
                <Route path="/security/units"          element={<ProtectedRoute roles={['security']}><SecurityPages.Units /></ProtectedRoute>} />
                <Route path="/security/alerts"         element={<ProtectedRoute roles={['security']}><SecurityPages.Alerts /></ProtectedRoute>} />
                <Route path="/security/access-log"     element={<ProtectedRoute roles={['security']}><SecurityPages.AccessLog /></ProtectedRoute>} />
                <Route path="/security/logbook"        element={<ProtectedRoute roles={['security']}><SecurityPages.Logbook /></ProtectedRoute>} />

                {/* ── Owner ────────────────────────────────────── */}
                <Route path="/owner/dashboard"        element={<ProtectedRoute roles={['owner']}><OwnerPages.Dashboard /></ProtectedRoute>} />
                <Route path="/owner"                   element={<ProtectedRoute roles={['owner']}><OwnerPages.Dashboard /></ProtectedRoute>} />
                <Route path="/owner/remittances"       element={<ProtectedRoute roles={['owner']}><OwnerPages.Remittances /></ProtectedRoute>} />
                <Route path="/owner/properties"        element={<ProtectedRoute roles={['owner']}><OwnerPages.Properties /></ProtectedRoute>} />
                <Route path="/owner/units"             element={<ProtectedRoute roles={['owner']}><OwnerPages.Units /></ProtectedRoute>} />
                <Route path="/owner/maintenance"       element={<ProtectedRoute roles={['owner']}><OwnerPages.Maintenance /></ProtectedRoute>} />
                <Route path="/owner/invoices"          element={<ProtectedRoute roles={['owner']}><OwnerPages.Invoices /></ProtectedRoute>} />
                <Route path="/owner/expenses"          element={<ProtectedRoute roles={['owner']}><OwnerPages.Expenses /></ProtectedRoute>} />
                <Route path="/owner/tenants"         element={<ProtectedRoute roles={['owner']}><OwnerPages.Tenants /></ProtectedRoute>} />

            {/* ── SaaS routes ─────────────────────────────────────── */}
                {/* NOTE: a second `/register` route (element={<Register />}) used to be
                    here, but it was dead code — the /register path is already claimed
                    above by SelfRegister (line ~282), which React Router matches first.
                    Register.jsx and OrgSignup.jsx (mounted at /signup) both post to the
                    same /organisations/register endpoint and look like two versions of
                    the same org-signup wizard — worth deciding which one to keep rather
                    than silently reviving the unreachable one. */}
                <Route path="/onboarding/step/:n" element={<Onboarding />} />
                <Route path="/admin/billing"     element={<ProtectedRoute roles={['super_admin']}><Billing /></ProtectedRoute>} />
                <Route path="/admin/api-keys"    element={<ProtectedRoute roles={['super_admin']}><ApiKeys /></ProtectedRoute>} />
                <Route path="/admin/org"         element={<ProtectedRoute roles={['super_admin']}><OrgSettings /></ProtectedRoute>} />
                <Route path="/admin/audit-log"   element={<ProtectedRoute roles={['super_admin']}><AuditLog /></ProtectedRoute>} />
                <Route path="/admin/sessions"    element={<ProtectedRoute roles={['super_admin']}><Sessions /></ProtectedRoute>} />

                {/* 404 — must be last */}
                <Route path="*" element={<NotFound />} />

        </Routes>
            </BrowserRouter>
          </LanguageProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}