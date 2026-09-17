import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AppLayout from '../../components/layout/AppLayout';
import Avatar    from '../../components/ui/Avatar';
import { Table } from '../../components/ui/Table';
import Modal     from '../../components/ui/Modal';
import api from '../../api';
import { fmtDate } from '../../utils/helpers';

export default function CaretakerTenants() {
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['caretaker-tenants'],
    queryFn: () => api.get('/tenants', { params: { limit: 500 } }).then(r => r.data.tenants),
  });

  const filtered = (data || []).filter(t =>
    !search ||
    t.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    t.unit_number?.toLowerCase().includes(search.toLowerCase()) ||
    t.phone?.includes(search)
  );

  const cols = [
    { label: 'Tenant', render: r => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name={r.full_name} size="sm" src={r.profile_photo} />
        <div>
          <p style={{ fontWeight: 600, fontSize: 13 }}>{r.full_name}</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.phone}</p>
        </div>
      </div>
    )},
    { label: 'Unit', render: r => (
      <div>
        <p style={{ fontWeight: 600, fontSize: 13 }}>{r.unit_number}</p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.property_name}</p>
      </div>
    )},
    { label: 'Lease end', render: r => r.end_date
      ? <span style={{ fontSize: 13 }}>{fmtDate(r.end_date)}</span>
      : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
    },
    { label: 'Emergency contact', render: r => r.emergency_phone
      ? <a href={`tel:${r.emergency_phone}`} style={{ fontSize: 13, color: 'var(--brand)' }}>{r.emergency_phone}</a>
      : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
    },
  ];

  return (
    <AppLayout title="Tenants">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="animate-fade-in">
        <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <h2 style={{ fontFamily: 'Fraunces,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 16 }}>
              Tenants <span style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'normal', fontFamily: 'Outfit,sans-serif', fontWeight: 400 }}>({filtered.length})</span>
            </h2>
            <input className="input" style={{ maxWidth: 240 }} placeholder="Search name, unit, phone…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Table columns={cols} data={filtered} loading={isLoading} onRow={setDetail}
            emptyMsg="No tenants found" />
        </div>
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.full_name || 'Tenant'}>
        {detail && (
          <div style={{ padding: '1rem 1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1rem' }}>
              <Avatar name={detail.full_name} size="lg" src={detail.profile_photo} />
              <div>
                <p style={{ fontWeight: 700, fontSize: 15 }}>{detail.full_name}</p>
                <a href={`tel:${detail.phone}`} style={{ fontSize: 13, color: 'var(--brand)' }}>{detail.phone}</a>
              </div>
            </div>
            {[
              ['Unit',       detail.unit_number],
              ['Property',   detail.property_name],
              ['Lease start', fmtDate(detail.start_date)],
              ['Lease end',   detail.end_date ? fmtDate(detail.end_date) : 'Ongoing'],
              ['Emergency contact', detail.emergency_contact || '—'],
              ['Emergency phone',   detail.emergency_phone || '—'],
              ['Vehicle',    detail.vehicle_plate || '—'],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{l}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
