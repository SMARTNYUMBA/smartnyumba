import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import Badge     from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import api, { getInvoices } from '../../api';
import { fmt, fmtDate } from '../../utils/helpers';

const TYPE_ICONS = { rent:'🏠',water:'💧',electricity:'⚡',service_charge:'🏢',garbage:'🗑️',parking:'🚗',penalty:'⚠️',deposit:'💰' };

export default function TenantInvoices() {
  const { user, profile: p } = useAuth();
  // profile from useAuth
  const { data, isLoading } = useQuery({
    queryKey:['my-invoices'],
    queryFn: () => getInvoices({}).then(r=>r.data.invoices),
  });

  if (!p.tenancy_id) return (
    <AppLayout title="My Invoices">
      <div className="card card-body text-center py-12 text-[--text-muted]">
        <div className="text-4xl mb-3">🧾</div>
        <p className="font-medium text-[--text-secondary]">No tenancy found</p>
        <p className="text-sm text-[--text-muted] mt-1">Your invoices will appear here once your property manager sets up your tenancy.</p>
      </div>
    </AppLayout>
  );

  const totals = (data||[]).reduce((acc,i)=>{acc.total+=Number(i.amount);if(i.status==='paid')acc.paid+=Number(i.amount);return acc;},{total:0,paid:0});

  return (
    <AppLayout title="My Invoices">
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="card card-body text-center"><p className="text-2xl font-bold text-[--text-primary]">{fmt(totals.total)}</p><p className="text-xs text-[--text-muted] mt-1">Total invoiced</p></div>
        <div className="card card-body text-center"><p className="text-2xl font-bold text-[--green]">{fmt(totals.paid)}</p><p className="text-xs text-[--text-muted] mt-1">Paid</p></div>
        <div className="card card-body text-center"><p className="text-2xl font-bold text-[--amber]">{fmt(totals.total-totals.paid)}</p><p className="text-xs text-[--text-muted] mt-1">Outstanding</p></div>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {isLoading ? <p className="text-center py-10 text-[--text-muted]">Loading...</p> :
         !(data||[]).length ? <div className="card card-body text-center py-12 text-[--text-muted]">No invoices yet</div> :
         (data||[]).map((inv,i) => (
          <div key={i} className="card card-body">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[--surface-muted] flex items-center justify-center text-2xl flex-shrink-0">
                {TYPE_ICONS[inv.type]||'🧾'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold capitalize">{inv.type.replace(/_/g,' ')} #{inv.id}</p>
                <p className="text-sm text-[--text-muted]">Due: {fmtDate(inv.due_date)}</p>
                {inv.balance > 0 && inv.balance < inv.amount &&
                  <p className="text-xs text-[--amber]">Balance remaining: {fmt(inv.balance)}</p>}
              </div>
              <div className="text-right mr-2">
                <p className="text-lg font-bold text-[--text-primary]">{fmt(inv.amount)}</p>
                <Badge status={inv.status} />
              </div>
              <div className="flex flex-col gap-1.5 min-w-fit">
                {['unpaid','overdue','partial'].includes(inv.status) && (
                  <Link to="/tenant/payments" className="btn-primary btn-sm text-center">Pay now</Link>
                )}
                {/* Pass token as query param so PDF opens in browser */}
                <button className="text-[--brand] text-xs hover:underline"
                  onClick={() => api.get(`/pdf/invoice/${inv.id}`, { responseType:'blob' }).then(res => {
                    const url = URL.createObjectURL(res.data);
                    const a = document.createElement('a');
                    a.href = url; a.download = `Invoice-${inv.id}.pdf`; a.click();
                    URL.revokeObjectURL(url);
                  })}>📄 PDF</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}
