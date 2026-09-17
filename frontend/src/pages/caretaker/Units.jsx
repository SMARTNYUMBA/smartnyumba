import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AppLayout from '../../components/layout/AppLayout';
import Badge     from '../../components/ui/Badge';
import { Table } from '../../components/ui/Table';
import Modal     from '../../components/ui/Modal';
import api from '../../api';
import { fmt, fmtDate } from '../../utils/helpers';

export default function CaretakerUnits() {
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['caretaker-units'],
    queryFn: () => api.get('/units', { params: { limit: 500 } }).then(r => r.data.units),
  });

  const filtered = (data || []).filter(u =>
    !search || u.unit_number?.toLowerCase().includes(search.toLowerCase()) ||
    u.property_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.tenant_name?.toLowerCase().includes(search.toLowerCase())
  );

  const cols = [
    { label: 'Unit', render: r => (
      <div>
        <p style={{ fontWeight: 700, fontSize: 13 }}>{r.unit_number}</p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.property_name}</p>
      </div>
    )},
    { label: 'Type', render: r => <span style={{ fontSize: 12, textTransform: 'capitalize', color: 'var(--text-muted)' }}>{r.type?.replace(/_/g,' ') || '—'}</span> },
    { label: 'Status', render: r => <Badge status={r.status} label={r.status} /> },
    { label: 'Tenant', render: r => r.tenant_name
      ? <div><p style={{ fontSize: 13, fontWeight: 600 }}>{r.tenant_name}</p><p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.tenant_phone}</p></div>
      : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Vacant</span>
    },
    { label: 'Rent/mo', align: 'right', render: r => r.rent_amount
      ? <span style={{ fontFamily: 'Fraunces,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 14, color: 'var(--green)' }}>{fmt(r.rent_amount)}</span>
      : '—'
    },
  ];

  const vacant  = (data || []).filter(u => u.status === 'vacant').length;
  const occupied = (data || []).filter(u => u.status === 'occupied').length;

  return (
    <AppLayout title="Units">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="animate-fade-in">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {[
            { label: 'Total units', value: (data||[]).length, color: 'var(--text-primary)' },
            { label: 'Occupied', value: occupied, color: 'var(--green)' },
            { label: 'Vacant',   value: vacant,   color: 'var(--amber)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '1rem', textAlign: 'center' }}>
              <p style={{ fontFamily: 'Fraunces,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 28, color, lineHeight: 1 }}>{value}</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{label}</p>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10 }}>
            <input className="input" style={{ maxWidth: 280 }} placeholder="Search unit, property, tenant…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Table columns={cols} data={filtered} loading={isLoading} onRow={setDetail}
            emptyMsg="No units found" />
        </div>
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Unit ${detail?.unit_number || ''}`}>
        {detail && (
          <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              ['Property', detail.property_name],
              ['Type', detail.type?.replace(/_/g,' ')],
              ['Floor', detail.floor || '—'],
              ['Bedrooms', detail.bedrooms || '—'],
              ['Rent', detail.rent_amount ? fmt(detail.rent_amount)+'/mo' : '—'],
              ['Status', detail.status],
              ['Tenant', detail.tenant_name || 'Vacant'],
              ['Tenant phone', detail.tenant_phone || '—'],
              ['Lease from', detail.start_date ? fmtDate(detail.start_date) : '—'],
              ['Lease to',   detail.end_date   ? fmtDate(detail.end_date)   : '—'],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{l}</span>
                <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{v || '—'}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
