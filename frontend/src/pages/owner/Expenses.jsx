import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AppLayout from '../../components/layout/AppLayout';
import { Table }  from '../../components/ui/Table';
import KpiCard    from '../../components/ui/KpiCard';
import api from '../../api';
import { fmt, fmtDate } from '../../utils/helpers';

export default function OwnerExpenses() {
  const [propFilter, setPropFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['owner-expenses'],
    queryFn: () => api.get('/owner/expenses').then(r => r.data.expenses),
  });

  const properties = Object.values(
    (data||[]).reduce((acc, e) => {
      if (e.property_id && !acc[e.property_id]) acc[e.property_id] = { id: e.property_id, name: e.property_name };
      return acc;
    }, {})
  );

  const filtered = (data||[]).filter(e => !propFilter || String(e.property_id) === propFilter);

  const now = new Date();
  const thisMonth = filtered.filter(e => {
    const d = new Date(e.expense_date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((s, e) => s + Number(e.amount||0), 0);

  const totalAll = filtered.reduce((s, e) => s + Number(e.amount||0), 0);

  const byCategory = filtered.reduce((acc, e) => {
    const k = e.category || 'general';
    acc[k] = (acc[k]||0) + Number(e.amount||0);
    return acc;
  }, {});

  const cols = [
    { label: 'Description', render: r => <span className="font-medium">{r.description}</span> },
    { label: 'Property',    render: r => <span className="text-sm text-[--text-muted]">{r.property_name}</span> },
    { label: 'Category',    render: r => <span className="capitalize text-xs bg-[--surface-muted] px-2 py-1 rounded-full">{(r.category||'general').replace(/_/g,' ')}</span> },
    { label: 'Amount',      render: r => <span className="font-bold text-[--red]">{fmt(r.amount)}</span> },
    { label: 'Date',        render: r => fmtDate(r.expense_date) },
    { label: 'Ref',         render: r => <span className="text-xs text-[--text-muted] font-mono">{r.reference||'—'}</span> },
  ];

  return (
    <AppLayout title="Expenses">
      <div className="grid grid-cols-2 gap-4 mb-6">
        <KpiCard label="This month"  value={fmt(thisMonth)} icon="📅" color="red"   />
        <KpiCard label="All time"    value={fmt(totalAll)}  icon="💸" color="amber" />
      </div>

      {/* Property filter */}
      <div className="flex gap-3 mb-4">
        <select className="input w-48 text-sm" value={propFilter} onChange={e => setPropFilter(e.target.value)}>
          <option value="">All properties</option>
          {properties.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
        </select>
      </div>

      {/* Category breakdown */}
      {Object.keys(byCategory).length > 0 && (
        <div className="card card-body mb-5">
          <h3 className="text-sm font-semibold text-[--text-secondary] uppercase tracking-wide mb-3">By Category</h3>
          <div className="flex gap-3 flex-wrap">
            {Object.entries(byCategory).sort((a,b)=>b[1]-a[1]).map(([cat, total]) => (
              <div key={cat} className="bg-[--surface-muted] rounded-xl px-4 py-2 text-center">
                <p className="text-sm font-bold text-[--text-primary]">{fmt(total)}</p>
                <p className="text-xs text-[--text-muted] capitalize mt-0.5">{cat.replace(/_/g,' ')}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)",padding:"1.25rem"}}>
        <Table columns={cols} data={filtered} loading={isLoading} emptyMsg="No expenses recorded" />
        </div>
    </AppLayout>
  );
}
