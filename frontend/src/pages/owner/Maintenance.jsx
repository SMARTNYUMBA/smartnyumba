import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AppLayout from '../../components/layout/AppLayout';
import { Table }  from '../../components/ui/Table';
import Badge      from '../../components/ui/Badge';
import KpiCard    from '../../components/ui/KpiCard';
import api from '../../api';
import { fmtDate, priorityColor } from '../../utils/helpers';

export default function OwnerMaintenance() {
  const [statusFilter, setStatusFilter] = useState('open');  // default to open
  const [propFilter,   setPropFilter]   = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['owner-maintenance'],
    queryFn: () => api.get('/owner/maintenance').then(r => r.data.requests),
  });

  const properties = [...new Map((data||[]).map(r => [r.property_id, { id: r.property_id, name: r.property_name }])).values()];

  // "open" filter covers pending + in_progress + assigned
  const isOpen = r => !['completed','cancelled','closed'].includes(r.status);

  const filtered = (data||[]).filter(r =>
    (!propFilter || String(r.property_id) === propFilter) &&
    (statusFilter === 'open' ? isOpen(r) : !statusFilter || r.status === statusFilter)
  );

  const open      = (data||[]).filter(isOpen).length;
  const emergency = (data||[]).filter(r => r.priority === 'emergency' && isOpen(r)).length;
  const completed = (data||[]).filter(r => r.status === 'completed').length;

  const cols = [
    { label: 'Request',  render: r => (
      <div>
        <p className="font-medium">{r.title}</p>
        <p className="text-xs text-[--text-muted]">{r.unit_number} · {r.property_name}</p>
      </div>
    )},
    { label: 'Priority',  render: r => <span className={priorityColor(r.priority)}>{r.priority}</span> },
    { label: 'Status',    render: r => <Badge status={r.status} label={r.status.replace('_',' ')} /> },
    { label: 'Category',  render: r => <span className="capitalize text-sm text-[--text-muted]">{r.category||'other'}</span> },
    { label: 'Assigned',  render: r => r.assigned_name || <span className="text-[--text-muted] text-xs">Unassigned</span> },
    { label: 'Submitted', render: r => fmtDate(r.created_at) },
    { label: 'Resolved',  render: r => r.resolved_at ? fmtDate(r.resolved_at) : '—' },
  ];

  const STATUS_TABS = [
    { v: 'open',        l: `Open (${open})` },
    { v: 'in_progress', l: 'In progress' },
    { v: 'completed',   l: 'Completed' },
    { v: '',            l: 'All' },
  ];

  return (
    <AppLayout title="Maintenance Requests">
      <div className="grid grid-cols-3 gap-4 mb-6">
        <KpiCard label="Open requests"  value={open}      icon="🔧" color="amber" />
        <KpiCard label="Emergency"      value={emergency} icon="🚨" color="red"   />
        <KpiCard label="Completed"      value={completed} icon="✅" color="green" />
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select className="input w-48 text-sm" value={propFilter} onChange={e => setPropFilter(e.target.value)}>
          <option value="">All properties</option>
          {properties.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
        </select>
        <div className="flex gap-2 flex-wrap">
          {STATUS_TABS.map(({v,l}) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={`px-4 py-2 text-sm rounded-xl font-medium transition ${statusFilter===v ? 'bg-brand-600 text-white' : 'bg-[--surface-muted] text-[--text-secondary]'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)",padding:"1.25rem"}}>
        <Table columns={cols} data={filtered} loading={isLoading} emptyMsg="No maintenance requests found" />
        </div>
    </AppLayout>
  );
}
