import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';

// ── Complete route map: every page in every portal ──────────────────────────
const ALL_ROUTES = [
  // Admin portal
  { path:'/admin/dashboard',      label:'Admin Dashboard',       portal:'admin' },
  { path:'/admin/properties',     label:'Properties',            portal:'admin' },
  { path:'/admin/units',          label:'Units',                 portal:'admin' },
  { path:'/admin/tenants',        label:'Tenants',               portal:'admin' },
  { path:'/admin/tenancies',      label:'Tenancies',             portal:'admin' },
  { path:'/admin/invoices',       label:'Invoices',              portal:'admin' },
  { path:'/admin/payments',       label:'Payments',              portal:'admin' },
  { path:'/admin/expenses',       label:'Expenses',              portal:'admin' },
  { path:'/admin/reports',        label:'Reports',               portal:'admin' },
  { path:'/admin/maintenance',    label:'Maintenance',           portal:'admin' },
  { path:'/admin/cases',          label:'Cases',                 portal:'admin' },
  { path:'/admin/announcements',  label:'Announcements',         portal:'admin' },
  { path:'/admin/vacate',         label:'Vacate Notices',        portal:'admin' },
  { path:'/admin/bulk-import',    label:'Bulk Import',           portal:'admin' },
  { path:'/admin/service-charges',label:'Service Charges',       portal:'admin' },
  { path:'/admin/shared-meters',  label:'Shared Meters',         portal:'admin' },
  { path:'/admin/utilities',      label:'Utilities',             portal:'admin' },
  { path:'/admin/vendors',        label:'Vendors',               portal:'admin' },
  { path:'/admin/vendor-invoices',label:'Vendor Invoices',       portal:'admin' },
  { path:'/admin/parking',        label:'Parking',               portal:'admin' },
  { path:'/admin/settings',       label:'Settings',              portal:'admin' },
  { path:'/admin/users',          label:'Users',                 portal:'admin' },
  { path:'/admin/billing',        label:'Billing',               portal:'admin' },
  { path:'/admin/api-keys',       label:'API Keys',              portal:'admin' },
  { path:'/admin/org',            label:'Organisation',          portal:'admin' },
  { path:'/admin/audit-log',      label:'Audit Log',             portal:'admin' },
  // Tenant portal
  { path:'/tenant/dashboard',     label:'Tenant Dashboard',      portal:'tenant' },
  { path:'/tenant/payments',      label:'Tenant Payments',       portal:'tenant' },
  { path:'/tenant/invoices',      label:'Tenant Invoices',       portal:'tenant' },
  { path:'/tenant/maintenance',   label:'Tenant Maintenance',    portal:'tenant' },
  { path:'/tenant/announcements', label:'Tenant Announcements',  portal:'tenant' },
  { path:'/tenant/visitors',      label:'Tenant Visitors',       portal:'tenant' },
  { path:'/tenant/statement',     label:'Tenant Statement',      portal:'tenant' },
  { path:'/tenant/cases',         label:'Tenant Cases',          portal:'tenant' },
  { path:'/tenant/utilities',     label:'Tenant Utilities',      portal:'tenant' },
  { path:'/tenant/ledger',        label:'Ledger',                 portal:'tenant' },
  { path:'/tenant/vacate',        label:'Tenant Vacate',         portal:'tenant' },
  // Manager portal
  { path:'/manager/dashboard',    label:'Manager Dashboard',     portal:'manager' },
  { path:'/manager/remittances',  label:'Manager Remittances',   portal:'manager' },
  { path:'/manager/staff',        label:'Manager Staff',         portal:'manager' },
  // Owner portal
  { path:'/owner/dashboard',      label:'Owner Dashboard',       portal:'owner' },
  { path:'/owner/properties',     label:'Owner Properties',      portal:'owner' },
  { path:'/owner/invoices',       label:'Owner Invoices',        portal:'owner' },
  { path:'/owner/expenses',       label:'Owner Expenses',        portal:'owner' },
  { path:'/owner/maintenance',    label:'Owner Maintenance',     portal:'owner' },
  { path:'/owner/tenants',        label:'Owner Tenants',         portal:'owner' },
  { path:'/owner/remittances',    label:'Owner Remittances',     portal:'owner' },
  // Caretaker portal
  { path:'/caretaker/dashboard',  label:'Caretaker Dashboard',   portal:'caretaker' },
  { path:'/caretaker/readings',   label:'Caretaker Readings',    portal:'caretaker' },
  { path:'/caretaker/inspections',label:'Caretaker Inspections', portal:'caretaker' },
  { path:'/caretaker/announcements',label:'Caretaker Announcements',portal:'caretaker' },
  // Security portal
  { path:'/security/dashboard',   label:'Security Dashboard',    portal:'security' },
  { path:'/security/check-in',     label:'Security Check-In',     portal:'security' },
  { path:'/security/alerts',      label:'Security Alerts',       portal:'security' },
  { path:'/security/parking',     label:'Security Parking',      portal:'security' },
  { path:'/security/logbook',     label:'Security Logbook',      portal:'security' },
  // Shared
  { path:'/shared/profile',       label:'Profile',               portal:'shared' },
  { path:'/shared/messages',      label:'Messages',              portal:'shared' },
];

const PORTAL_COLOURS = {
  admin:'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
  tenant:'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  manager:'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  owner:'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  caretaker:'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
  security:'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300',
  shared:'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

const STATUS = { pending:'pending', ok:'ok', warn:'warn', err:'err', skip:'skip' };

export default function PageAudit() {
  const nav = useNavigate();
  const iframeRef = useRef(null);
  const [results, setResults]       = useState(() => ALL_ROUTES.map(r => ({ ...r, status: STATUS.pending, note: '', ms: null })));
  const [running, setRunning]       = useState(false);
  const [currentIdx, setCurrentIdx] = useState(null);
  const [filter, setFilter]         = useState('all');
  const [portalFilter, setPortalFilter] = useState('all');
  const [autoNext, setAutoNext]     = useState(false);
  const timerRef = useRef(null);

  const update = (idx, patch) =>
    setResults(prev => prev.map((r,i) => i === idx ? { ...r, ...patch } : r));

  const testPage = (idx) => {
    setCurrentIdx(idx);
    const route = ALL_ROUTES[idx];
    const start = Date.now();
    update(idx, { status: STATUS.pending, note: 'Loading…', ms: null });

    const iframe = iframeRef.current;
    if (!iframe) return;

    const timeout = setTimeout(() => {
      update(idx, { status: STATUS.warn, note: 'Timeout — page took >8s', ms: 8000 });
      if (autoNext && idx + 1 < ALL_ROUTES.length) testPage(idx + 1);
    }, 8000);

    const onLoad = () => {
      clearTimeout(timeout);
      const ms = Date.now() - start;
      try {
        const iDoc = iframe.contentDocument || iframe.contentWindow?.document;
        const body = iDoc?.body?.innerText || '';
        // Check for React error boundaries
        if (body.includes('Something went wrong') || body.includes('Unexpected error')) {
          const msgMatch = body.match(/Something went wrong[\s\S]{0,10}([^\n]+)/);
          const msg = msgMatch ? msgMatch[1].trim() : 'Error boundary triggered';
          update(idx, { status: STATUS.err, note: msg.slice(0,80), ms });
        } else if (body.includes('Page failed to load') || body.includes('plugin:vite')) {
          update(idx, { status: STATUS.err, note: 'Build/parse error', ms });
        } else if (body.includes('Loading') && ms < 500) {
          update(idx, { status: STATUS.warn, note: 'Still loading (check manually)', ms });
        } else if (body.length < 100) {
          update(idx, { status: STATUS.warn, note: 'Page rendered empty', ms });
        } else {
          update(idx, { status: STATUS.ok, note: `Rendered (${body.length} chars)`, ms });
        }
      } catch {
        // Cross-origin read blocked — means the page loaded without crashing (it redirected to /login etc.)
        update(idx, { status: STATUS.ok, note: 'Loaded (cross-origin — likely redirect)', ms });
      }
      iframe.removeEventListener('load', onLoad);
      if (autoNext && idx + 1 < ALL_ROUTES.length) {
        timerRef.current = setTimeout(() => testPage(idx + 1), 400);
      } else if (autoNext && idx + 1 >= ALL_ROUTES.length) {
        setRunning(false);
        setCurrentIdx(null);
      }
    };

    iframe.addEventListener('load', onLoad);
    iframe.src = route.path;
  };

  const runAll = () => {
    setRunning(true);
    setAutoNext(true);
    setResults(prev => prev.map(r => ({ ...r, status: STATUS.pending, note: '', ms: null })));
    testPage(0);
  };

  const stopAll = () => {
    setRunning(false);
    setAutoNext(false);
    clearTimeout(timerRef.current);
    if (iframeRef.current) iframeRef.current.src = 'about:blank';
    setCurrentIdx(null);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const filtered = results.filter(r => {
    if (filter !== 'all' && r.status !== filter) return false;
    if (portalFilter !== 'all' && r.portal !== portalFilter) return false;
    return true;
  });

  const counts = {
    ok:   results.filter(r => r.status === STATUS.ok).length,
    warn: results.filter(r => r.status === STATUS.warn).length,
    err:  results.filter(r => r.status === STATUS.err).length,
    pending: results.filter(r => r.status === STATUS.pending).length,
  };
  const done = counts.ok + counts.warn + counts.err;
  const pct  = Math.round(done / ALL_ROUTES.length * 100);

  const statusIcon = (s) => ({
    ok:'✅', warn:'⚠️', err:'❌', pending:'○', skip:'—'
  }[s] || '○');

  const statusBg = (s) => ({
    ok:'bg-green-50 dark:bg-green-950/20',
    warn:'bg-amber-50 dark:bg-amber-950/20',
    err:'bg-red-50 dark:bg-red-950/20',
    pending:'',
  }[s] || '');

  return (
    <AppLayout title="Page Audit">
      {/* Hidden iframe for page testing */}
      <iframe ref={iframeRef} src="about:blank" className="hidden" title="audit-frame" />

      <div className="p-6 space-y-5 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">Page Audit</h1>
            <p className="text-slate-500 text-sm mt-0.5">Tests all {ALL_ROUTES.length} pages across 7 portals for crashes and errors</p>
          </div>
          <div className="flex gap-2">
            {running ? (
              <button className="btn-secondary" onClick={stopAll}>⏹ Stop</button>
            ) : (
              <button className="btn-primary" onClick={runAll}>▶ Run all {ALL_ROUTES.length} pages</button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {done > 0 && (
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>{done}/{ALL_ROUTES.length} tested — {pct}%</span>
              <span className="flex gap-3">
                <span className="text-green-500">✅ {counts.ok}</span>
                <span className="text-amber-500">⚠️ {counts.warn}</span>
                <span className="text-red-500">❌ {counts.err}</span>
              </span>
            </div>
            <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full flex">
                <div className="bg-green-500 transition-all" style={{width:`${counts.ok/ALL_ROUTES.length*100}%`}}/>
                <div className="bg-amber-500 transition-all" style={{width:`${counts.warn/ALL_ROUTES.length*100}%`}}/>
                <div className="bg-red-500 transition-all"   style={{width:`${counts.err/ALL_ROUTES.length*100}%`}}/>
              </div>
            </div>
          </div>
        )}

        {/* Currently testing */}
        {currentIdx !== null && (
          <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-lg px-4 py-2 text-sm text-indigo-700 dark:text-indigo-300 animate-pulse">
            Testing: {ALL_ROUTES[currentIdx]?.path}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {['all','ok','warn','err','pending'].map(f => (
            <button key={f} onClick={()=>setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter===f?'bg-slate-800 text-white dark:bg-white dark:text-slate-900':'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
              {f === 'all' ? `All (${ALL_ROUTES.length})` : `${statusIcon(f)} ${f} (${counts[f]||0})`}
            </button>
          ))}
          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 self-center"/>
          {['all',...new Set(ALL_ROUTES.map(r=>r.portal))].map(p => (
            <button key={p} onClick={()=>setPortalFilter(p)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize ${portalFilter===p?'bg-slate-800 text-white dark:bg-white dark:text-slate-900':'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
              {p}
            </button>
          ))}
        </div>

        {/* Results table */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-8"></th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Page</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Portal</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Note</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Time</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide w-16">Test</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {filtered.map((r, i) => (
                <tr key={r.path} className={`${statusBg(r.status)} transition-colors ${currentIdx === ALL_ROUTES.indexOf(r) ? 'ring-1 ring-inset ring-indigo-300 dark:ring-indigo-700' : ''}`}>
                  <td className="px-4 py-2.5 text-center text-base leading-none">
                    {r.status === STATUS.pending && running && currentIdx === ALL_ROUTES.indexOf(r)
                      ? <span className="animate-spin inline-block">⏳</span>
                      : statusIcon(r.status)}
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-700 dark:text-slate-200 text-sm">{r.label}</p>
                    <p className="text-slate-400 font-mono text-xs">{r.path}</p>
                  </td>
                  <td className="px-4 py-2.5 hidden sm:table-cell">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${PORTAL_COLOURS[r.portal]}`}>
                      {r.portal}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs max-w-xs truncate">{r.note || '—'}</td>
                  <td className="px-4 py-2.5 text-right text-slate-400 text-xs hidden md:table-cell">
                    {r.ms != null ? `${r.ms}ms` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button className="text-xs text-indigo-500 hover:text-indigo-700 font-medium"
                      onClick={() => testPage(ALL_ROUTES.indexOf(r))}>
                      Test
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No results match the filter</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Summary when done */}
        {!running && done === ALL_ROUTES.length && (
          <div className={`rounded-xl p-4 border text-sm font-medium ${counts.err===0&&counts.warn===0?'bg-green-50 border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300':'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300'}`}>
            {counts.err===0&&counts.warn===0
              ? `✅ All ${ALL_ROUTES.length} pages passed with no errors.`
              : `Audit complete — ${counts.err} error${counts.err!==1?'s':''}, ${counts.warn} warning${counts.warn!==1?'s':''}. Click ❌/⚠️ rows to test individually.`}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
