import { useQuery } from '@tanstack/react-query';
import AppLayout  from '../../components/layout/AppLayout';
import ExportBar, { exportToCsv, printSection } from '../../components/ui/ExportBar';
import { useAuth } from '../../context/AuthContext';
import api from '../../api';
import toast from 'react-hot-toast';
import { fmt, fmtDate } from '../../utils/helpers';

export default function TenantStatement() {
  const { profile: p } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['statement', p?.tenancy_id],
    queryFn:  () => api.get(`/reports/statement/${p.tenancy_id}`).then(r => r.data),
    enabled:  !!p?.tenancy_id,
  });

  const exportLedger = () => exportToCsv(
    (data?.ledger || []).map(l => ({
      Date:        fmtDate(l.created_at),
      Description: l.description,
      Charge:      l.type === 'debit'  ? l.amount : '',
      Payment:     l.type === 'credit' ? l.amount : '',
      Balance:     l.running_balance,
    })),
    `statement-${p?.unit_number}`
  );

  const downloadPdf = () => {
    api.get(`/pdf/statement/${p.tenancy_id}`, { responseType: 'blob' })
      .then(res => {
        const bUrl = URL.createObjectURL(res.data);
        const link = document.createElement('a');
        link.href = bUrl;
        link.download = `Statement-${p.unit_number}-${new Date().toISOString().slice(0, 7)}.pdf`;
        link.click();
        URL.revokeObjectURL(bUrl);
      })
      .catch(() => toast.error('Could not download PDF. Try again.'));
  };

  if (!p?.tenancy_id) return (
    <AppLayout title="My Statement">
      <div className="card card-body text-center py-12 text-[--text-muted]">
        No active tenancy found. Contact your property manager.
      </div>
    </AppLayout>
  );

  return (
    <AppLayout title="My Statement" actions={
      <div className="flex gap-2">
        <button onClick={downloadPdf} className="btn-primary btn-sm">📄 Download PDF</button>
        <ExportBar onCsv={exportLedger} onPrint={() => printSection('statement-body', 'Tenant Statement')} />
      </div>
    }>
      {isLoading
        ? <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" /></div>
        : data && (
          <div id="statement-body" className="space-y-6 animate-fade-in">

            {/* Header card */}
            <div className="card card-body bg-gradient-to-r from-brand-600 to-brand-700 text-white">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-bold">{data.tenancy?.full_name}</h2>
                  <p className="opacity-80 text-sm mt-1">Unit {data.tenancy?.unit_number} · {data.tenancy?.property_name}</p>
                  <p className="opacity-70 text-xs mt-1">Lease started: {fmtDate(data.tenancy?.start_date)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs opacity-70">Current balance</p>
                  <p className={`text-2xl font-bold mt-1 ${(data.balance || 0) > 0 ? 'text-red-300' : 'text-green-300'}`}>
                    {(data.balance || 0) > 0 ? `${fmt(data.balance)} owed` : 'All clear ✓'}
                  </p>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="card card-body text-center">
                <p className="text-xl font-bold text-[--text-primary]">{fmt(data.total_invoiced || 0)}</p>
                <p className="text-xs text-[--text-muted] mt-1">Total invoiced</p>
              </div>
              <div className="card card-body text-center">
                <p className="text-xl font-bold text-[--green]">{fmt(data.total_paid || 0)}</p>
                <p className="text-xs text-[--text-muted] mt-1">Total paid</p>
              </div>
              <div className="card card-body text-center">
                <p className={`text-xl font-bold ${(data.balance || 0) > 0 ? 'text-[--red]' : 'text-[--green]'}`}>
                  {fmt(Math.abs(data.balance || 0))}
                </p>
                <p className="text-xs text-[--text-muted] mt-1">{(data.balance || 0) > 0 ? 'Amount owed' : 'Credit / clear'}</p>
              </div>
            </div>

            {/* Ledger table */}
            <div className="card card-body">
              <h3 className="text-sm font-semibold mb-3 text-[--text-primary]">Transaction history</h3>
              <div className="overflow-x-auto">
                <div className="table-wrap">
                <table className="table w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left">Date</th>
                      <th className="text-left">Description</th>
                      <th className="text-right text-[--red]">Charge</th>
                      <th className="text-right text-[--green]">Payment</th>
                      <th className="text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!(data.ledger || []).length
                      ? <tr><td colSpan={5} className="text-center py-8 text-[--text-muted]">No transactions yet</td></tr>
                      : (data.ledger || []).map((l, i) => (
                        <tr key={i} className="border-t border-slate-50">
                          <td className="text-xs text-[--text-muted] py-2">{fmtDate(l.created_at)}</td>
                          <td className="py-2">{l.description || l.type}</td>
                          {/* l.type is 'debit' (charge) or 'credit' (payment) from tenant_ledger table */}
                          <td className="text-right text-[--red] py-2">
                            {l.type === 'debit' ? fmt(l.amount) : '—'}
                          </td>
                          <td className="text-right text-[--green] py-2">
                            {l.type === 'credit' ? fmt(l.amount) : '—'}
                          </td>
                          <td className={`text-right font-medium py-2 ${(l.running_balance || 0) > 0 ? 'text-[--red]' : 'text-[--green]'}`}>
                            {fmt(Math.abs(l.running_balance || 0))}
                            <span className="text-xs ml-1">{(l.running_balance || 0) > 0 ? 'owed' : 'cr'}</span>
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          </div>
        )
      }
    </AppLayout>
  );
}
