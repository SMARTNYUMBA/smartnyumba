// frontend/src/components/ui/BulkInvoicePreview.jsx
// Show a preview + confirmation step before bulk invoice generation.
// Prevents accidental generation of 60+ invoices with one click.
//
// Usage in admin/Invoices.jsx:
//   const [showPreview, setShowPreview] = useState(false);
//
//   // Replace the direct api.post call with:
//   <button onClick={() => setShowPreview(true)}>Generate invoices</button>
//   <BulkInvoicePreview
//     open={showPreview}
//     params={{ month, property_id }}
//     onClose={() => setShowPreview(false)}
//     onGenerated={() => { setShowPreview(false); qc.invalidateQueries(['invoices']); }}
//   />

import { useState, useEffect } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import { fmt } from '../../utils/helpers';

export default function BulkInvoicePreview({ open, params = {}, onClose, onGenerated }) {
  const [preview, setPreview]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [generating, setGen]    = useState(false);
  const [error, setError]       = useState(null);

  // Load dry-run preview whenever modal opens
  useEffect(() => {
    if (!open) { setPreview(null); setError(null); return; }
    setLoading(true);
    setError(null);
    api.post('/invoices/bulk-generate', { ...params, dry_run: true })
      .then(r => setPreview(r.data))
      .catch(e => setError(e?.response?.data?.error || 'Failed to load preview'))
      .finally(() => setLoading(false));
  }, [open, JSON.stringify(params)]);

  const generate = async () => {
    setGen(true);
    try {
      const { data } = await api.post('/invoices/bulk-generate', { ...params, dry_run: false });
      toast.success(`Generated ${data.generated || preview?.count || 0} invoices`);
      onGenerated?.();
    } catch(e) {
      toast.error(e?.response?.data?.error || 'Generation failed');
    } finally { setGen(false); }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget && !generating) onClose?.(); }}
    >
      <div className="bg-white dark:bg-slate-800 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Generate invoices — preview</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Review what will be created before confirming.
          </p>
        </div>

        {/* Body */}
        <div className="p-5 flex-1 overflow-y-auto">
          {loading && (
            <div className="space-y-3 animate-pulse">
              {[1,2,3].map(i => <div key={i} className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />)}
            </div>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          {preview && !loading && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Invoices to create', value: preview.count ?? '—' },
                  { label: 'Total amount',        value: fmt(preview.total_amount ?? 0) },
                  { label: 'Active tenancies',    value: preview.active_tenancies ?? '—' },
                  { label: 'Already invoiced',    value: preview.already_invoiced ?? 0 },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>

              {preview.breakdown?.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 px-3 py-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
                    By property
                  </p>
                  {preview.breakdown.map(b => (
                    <div key={b.property_id} className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-700 last:border-0 text-sm">
                      <span className="text-slate-700 dark:text-slate-300">{b.property_name}</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{b.count} × {fmt(b.avg_rent)}</span>
                    </div>
                  ))}
                </div>
              )}

              {preview.skipped?.length > 0 && (
                <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
                  ⚠️ {preview.skipped.length} tenancies skipped (invoices already exist for this period or tenancy inactive).
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-5 border-t border-slate-100 dark:border-slate-700 flex gap-3">
          <button
            onClick={onClose}
            disabled={generating}
            className="flex-1 py-2.5 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={generate}
            disabled={!preview || loading || generating || (preview?.count === 0)}
            className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-blue-500 hover:bg-blue-600 text-white transition disabled:opacity-40"
          >
            {generating
              ? 'Generating…'
              : preview?.count
                ? `Generate ${preview.count} invoice${preview.count !== 1 ? 's' : ''} →`
                : 'No invoices to generate'
            }
          </button>
        </div>
      </div>
    </div>
  );
}