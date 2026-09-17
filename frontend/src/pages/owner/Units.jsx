import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AppLayout from '../../components/layout/AppLayout';
import { Table }  from '../../components/ui/Table';
import Badge      from '../../components/ui/Badge';
import KpiCard    from '../../components/ui/KpiCard';
import api from '../../api';
import { fmt, fmtDate } from '../../utils/helpers';

export default function OwnerUnits() {
  const [statusFilter, setStatusFilter] = useState('');
  const [propFilter,   setPropFilter]   = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['owner-units'],
    queryFn: () => api.get('/owner/units').then(r => r.data.units),
  });

  // Unique properties from data
  const properties = [...new Map((data||[]).map(u => [u.property_id, { id: u.property_id, name: u.property_name }])).values()];

  const filtered = (data||[]).filter(u =>
    (!statusFilter || u.status === statusFilter) &&
    (!propFilter   || String(u.property_id) === propFilter)
  );

  const vacant   = (data||[]).filter(u => u.status === 'vacant').length;
  const occupied = (data||[]).filter(u => u.status === 'occupied').length;

  const cols = [
    { label: 'Unit',     render: r => <span className="font-semibold">{r.unit_number}</span> },
    { label: 'Property', render: r => <span className="text-[--text-muted] text-sm">{r.property_name}</span> },
    { label: 'Status',   render: r => <Badge status={r.status} label={r.status} /> },
    { label: 'Tenant',   render: r => r.tenant_name
        ? <div><p className="font-medium text-sm">{r.tenant_name}</p><p className="text-xs text-[--text-muted]">{r.tenant_phone}</p></div>
        : <span className="text-[--text-muted] text-sm">Vacant</span> },
    { label: 'Rent',        render: r => r.rent_amount ? <span className="font-semibold text-[--green]">{fmt(r.rent_amount)}/mo</span> : '—' },
    { label: 'Lease start', render: r => r.start_date ? fmtDate(r.start_date) : '—' },
    { label: 'Lease end',   render: r => r.end_date ? fmtDate(r.end_date) : <span className="text-[--text-muted]">Open</span> },
    { label: 'Tenancy',     render: r => r.tenancy_status ? <Badge status={r.tenancy_status} label={r.tenancy_status} /> : '—' },
  ];

  return (
    <AppLayout title="Units & Tenants">
      <div className="grid grid-cols-3 gap-4 mb-6">
        <KpiCard label="Total units"   value={data?.length||0} icon="🏠" color="brand" />
        <KpiCard label="Occupied"      value={occupied}        icon="👥" color="green" />
        <KpiCard label="Vacant"        value={vacant}          icon="🔓" color="amber" />
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select className="input w-48 text-sm" value={propFilter} onChange={e => setPropFilter(e.target.value)}>
          <option value="">All properties</option>
          {properties.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
        </select>
        <div className="flex gap-2">
          {[{v:'',l:'All'},{v:'occupied',l:'Occupied'},{v:'vacant',l:'Vacant'},{v:'maintenance',l:'Maintenance'}].map(({v,l}) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={`px-4 py-2 text-sm rounded-xl font-medium transition ${statusFilter===v ? 'bg-brand-600 text-white' : 'bg-[--surface-muted] text-[--text-secondary]'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)",padding:"1.25rem"}}>
        <Table columns={cols} data={filtered} loading={isLoading} emptyMsg="No units found" />
        </div>
    </AppLayout>
  );
}
