import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AppLayout from '../../components/layout/AppLayout';
import { Table }  from '../../components/ui/Table';
import Badge      from '../../components/ui/Badge';
import KpiCard    from '../../components/ui/KpiCard';
import api from '../../api';
import { fmt, fmtDate } from '../../utils/helpers';

const TYPE_ICONS = { rent:'🏠', water:'💧', electricity:'⚡', service_charge:'🏢', garbage:'🗑️', parking:'🚗', penalty:'⚠️', deposit:'💰' };

export default function OwnerInvoices() {
  const [statusFilter, setStatusFilter] = useState('');
  const [propFilter,   setPropFilter]   = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['owner-invoices'],
    queryFn: () => api.get('/owner/invoices').then(r => r.data.invoices),
  });

  // Deduplicate properties from invoice data by property_id
  const properties = Object.values(
    (data||[]).reduce((acc, i) => {
      if (i.property_id && !acc[i.property_id]) acc[i.property_id] = { id: i.property_id, name: i.property_name };
      return acc;
    }, {})
  );

  const filtered = (data||[]).filter(i =>
    (!statusFilter || i.status === statusFilter) &&
    (!propFilter   || String(i.property_id) === String(propFilter))
  );

  const totalInvoiced    = filtered.reduce((s, i) => s + Number(i.amount||0), 0);
  const totalPaid        = filtered.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount||0), 0);
  const totalOutstanding = filtered.filter(i => ['unpaid','overdue','partial'].includes(i.status)).reduce((s, i) => s + Number(i.balance||0), 0);

  const cols = [
    { label: 'Invoice',  render: r => (
      <div className="flex items-center gap-2">
        <span className="text-xl">{TYPE_ICONS[r.type]||'🧾'}</span>
        <div>
          <p className="font-medium capitalize">{(r.type||'').replace(/_/g,' ')} #{r.id}</p>
          <p className="text-xs text-[--text-muted]">{r.tenant_name}</p>
        </div>
      </div>
    )},
    { label: 'Property', render: r => <span className="text-sm text-[--text-muted]">{r.property_name} · {r.unit_number}</span> },
    { label: 'Amount',   render: r => <span className="font-bold">{fmt(r.amount)}</span> },
    { label: 'Balance',  render: r => r.balance > 0 ? <span className="text-[--red] font-semibold">{fmt(r.balance)}</span> : <span className="text-[--green] text-xs">Cleared</span> },
    { label: 'Due date', render: r => fmtDate(r.due_date) },
    { label: 'Status',   render: r => <Badge status={r.status} label={r.status} /> },
  ];

  return (
    <AppLayout title="Invoices">
      <div className="grid grid-cols-3 gap-4 mb-6">
        <KpiCard label="Total invoiced"   value={fmt(totalInvoiced)}    icon="🧾" color="brand" />
        <KpiCard label="Total collected"  value={fmt(totalPaid)}        icon="✅" color="green" />
        <KpiCard label="Outstanding"      value={fmt(totalOutstanding)} icon="⚠️" color="red"   />
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select className="input w-48 text-sm" value={propFilter} onChange={e => setPropFilter(e.target.value)}>
          <option value="">All properties</option>
          {properties.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
        </select>
        <div className="flex gap-2 flex-wrap">
          {[{v:'',l:'All'},{v:'unpaid',l:'Unpaid'},{v:'overdue',l:'Overdue'},{v:'partial',l:'Partial'},{v:'paid',l:'Paid'}].map(({v,l}) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={`px-4 py-2 text-sm rounded-xl font-medium transition ${statusFilter===v ? 'bg-brand-600 text-white' : 'bg-[--surface-muted] text-[--text-secondary]'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)",padding:"1.25rem"}}>
        <Table columns={cols} data={filtered} loading={isLoading} emptyMsg="No invoices found" />
        </div>
    </AppLayout>
  );
}
