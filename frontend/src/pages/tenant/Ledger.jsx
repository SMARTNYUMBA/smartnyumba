import { useQuery } from '@tanstack/react-query';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../context/AuthContext';
import api from '../../api';
import { fmt, fmtDate } from '../../utils/helpers';

export default function TenantLedger() {
  const { profile: p } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['my-ledger', p?.tenancy_id],
    queryFn:  () => api.get(`/reports/statement/${p.tenancy_id}`).then(r => r.data),
    enabled:  !!p?.tenancy_id,
  });

  const ledger  = data?.ledger  || [];
  const summary = data?.summary || {};

  // Use server-calculated running balance from last entry, or fallback to re-sum
  const balance = ledger.length ? Number(ledger[ledger.length - 1].running_balance ?? ledger.reduce((s,e) => s + (e.type==='debit'?Number(e.amount):-Number(e.amount)), 0)) : 0;

  if (!p?.tenancy_id) return (
    <AppLayout title="Account Ledger">
      <div className="card card-body text-center py-12 text-[--text-muted]">
        <p className="text-4xl mb-3">📒</p>
        <p className="font-medium">No active tenancy</p>
      </div>
    </AppLayout>
  );

  return (
    <AppLayout title="Account Ledger">
      <div style={{display:"flex",flexDirection:"column",gap:20}}>

        {/* Balance summary */}
        <div className={`card card-body flex items-center justify-between ${balance > 0 ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-green-500'}`}>
          <div>
            <p className="text-sm text-[--text-muted]">Current balance</p>
            <p className={`text-3xl font-bold mt-1 ${balance > 0 ? 'text-[--red]' : 'text-[--green]'}`}>
              {balance > 0 ? `${fmt(balance)} owed` : balance === 0 ? '✓ Clear' : `${fmt(Math.abs(balance))} credit`}
            </p>
            <p className="text-xs text-[--text-muted] mt-1">Unit {p.unit_number} · {p.property_name}</p>
          </div>
          <div className="text-right space-y-1">
            <div className="text-sm">
              <span className="text-[--text-muted]">Total charged: </span>
              <span className="font-semibold text-[--red]">{fmt(summary.total_invoiced || 0)}</span>
            </div>
            <div className="text-sm">
              <span className="text-[--text-muted]">Total paid: </span>
              <span className="font-semibold text-[--green]">{fmt(summary.total_paid || 0)}</span>
            </div>
          </div>
        </div>

        {/* Transaction history */}
        <div className="card card-body">
          <h2 className="text-sm font-semibold text-[--text-primary] mb-4">Transaction history</h2>

          {isLoading ? (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {[...Array(5)].map((_,i) => <div key={i} className="h-12 bg-[--surface-muted] rounded animate-pulse" />)}
            </div>
          ) : !ledger.length ? (
            <p className="text-center text-[--text-muted] py-8">No transactions yet</p>
          ) : (
            <>
              {/* Table header */}
              <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-[--text-muted] uppercase tracking-wide pb-2 border-b border-[--border]">
                <div className="col-span-2">Date</div>
                <div className="col-span-6">Description</div>
                <div className="col-span-2 text-right">Charges</div>
                <div className="col-span-2 text-right">Payments</div>
              </div>

              {/* Running balance calc */}
              {(() => {
                let running = 0;
                return ledger.map((entry, i) => {
                  if (entry.type === 'debit')  running += Number(entry.amount);
                  if (entry.type === 'credit') running -= Number(entry.amount);
                  const isDebit = entry.type === 'debit';
                  return (
                    <div key={i} className="grid grid-cols-12 gap-2 py-3 border-b border-slate-50 hover:bg-[--surface-muted] transition-colors text-sm">
                      <div className="col-span-2 text-[--text-muted] text-xs pt-0.5">{fmtDate(entry.created_at)}</div>
                      <div className="col-span-6">
                        <p className="font-medium text-[--text-primary] capitalize">
                          {entry.description || entry.ref_type}
                        </p>
                        {entry.ref_type && (
                          <p className="text-xs text-[--text-muted]">{entry.ref_type.replace('_',' ')}</p>
                        )}
                      </div>
                      <div className="col-span-2 text-right">
                        {isDebit
                          ? <span className="font-semibold text-[--red]">{fmt(entry.amount)}</span>
                          : <span className="text-[--text-muted]">—</span>
                        }
                      </div>
                      <div className="col-span-2 text-right">
                        {!isDebit
                          ? <span className="font-semibold text-[--green]">{fmt(entry.amount)}</span>
                          : <span className="text-[--text-muted]">—</span>
                        }
                      </div>
                    </div>
                  );
                });
              })()}

              {/* Running total row */}
              <div className={`grid grid-cols-12 gap-2 py-3 mt-1 rounded-xl text-sm font-bold ${balance > 0 ? 'bg-[--red-bg] text-red-700' : 'bg-[--green-bg] text-green-700'}`}>
                <div className="col-span-8 pl-2">Balance</div>
                <div className="col-span-4 text-right pr-2">
                  {balance > 0 ? `${fmt(balance)} owed` : balance === 0 ? 'Clear ✓' : `${fmt(Math.abs(balance))} credit`}
                </div>
              </div>
            </>
          )}
        </div>

        <p className="text-xs text-center text-[--text-muted]">
          Showing all charges and payments for your current tenancy.
          For a full PDF statement, go to{' '}
          <a href="/tenant/statement" className="text-[--brand] hover:underline">Account Statement</a>.
        </p>
      </div>
    </AppLayout>
  );
}
