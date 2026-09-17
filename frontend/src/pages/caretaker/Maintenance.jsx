import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AppLayout from '../../components/layout/AppLayout';
import Badge     from '../../components/ui/Badge';
import { Table } from '../../components/ui/Table';
import Modal     from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import api from '../../api';
import { fmtDate } from '../../utils/helpers';
import toast from 'react-hot-toast';

const STATUS_NEXT = { assigned:'in_progress', in_progress:'completed' };
const STATUS_LABEL = { assigned:'Start work', in_progress:'Mark complete' };
const PC = { urgent:'#DC2626', high:'#EA580C', medium:'#D97706', low:'#16A34A' };

export default function CaretakerMaintenance() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['caretaker-maintenance'],
    queryFn: () => api.get('/maintenance', { params: { assigned_to: user?.id, limit: 100 } }).then(r => r.data.requests),
  });

  const update = useMutation({
    mutationFn: ({ id, status, notes }) => api.put(`/maintenance/${id}`, { status, notes }),
    onSuccess: () => {
      toast.success('Status updated');
      qc.invalidateQueries(['caretaker-maintenance']);
      setSelected(null); setNote('');
    },
    onError: e => toast.error(e.response?.data?.error || 'Failed'),
  });

  const advance = (req) => {
    const next = STATUS_NEXT[req.status];
    if (!next) return;
    update.mutate({ id: req.id, status: next, notes: note });
  };

  const cols = [
    { label: 'Priority', width: 80, render: r => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: PC[r.priority] || '#9C9991' }} />
        <span style={{ fontSize: 12, textTransform: 'capitalize', color: 'var(--text-muted)' }}>{r.priority}</span>
      </div>
    )},
    { label: 'Request', render: r => (
      <div>
        <p style={{ fontWeight: 600, fontSize: 13 }}>{r.title}</p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.unit_number} · {r.property_name}</p>
      </div>
    )},
    { label: 'Category', render: r => <span style={{ fontSize: 12, textTransform: 'capitalize', color: 'var(--text-muted)' }}>{r.category?.replace(/_/g,' ') || '—'}</span> },
    { label: 'Reported', render: r => <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(r.created_at)}</span> },
    { label: 'Status', render: r => <Badge status={r.status} label={r.status?.replace(/_/g,' ')} /> },
    { label: '', render: r => STATUS_NEXT[r.status] && (
      <button className="btn-primary btn-sm" onClick={e => { e.stopPropagation(); setSelected(r); setNote(''); }}>
        {STATUS_LABEL[r.status]}
      </button>
    )},
  ];

  const open  = (data || []).filter(r => r.status !== 'completed' && r.status !== 'cancelled');
  const done  = (data || []).filter(r => r.status === 'completed');

  return (
    <AppLayout title="Maintenance">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-fade-in">

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {[
            { label: 'Assigned to me', value: open.length,                color: open.length > 0 ? '#D97706' : '#16A34A' },
            { label: 'In progress',    value: open.filter(r=>r.status==='in_progress').length, color: '#2563EB' },
            { label: 'Completed',      value: done.length,                color: '#16A34A' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '1rem', textAlign: 'center' }}>
              <p style={{ fontFamily: 'Fraunces,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 28, color, lineHeight: 1 }}>{value}</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{label}</p>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontFamily: 'Fraunces,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 16 }}>My tasks</h2>
          </div>
          <Table columns={cols} data={open} loading={isLoading} onRow={setSelected}
            emptyMsg="No tasks assigned to you" />
        </div>

        {done.length > 0 && (
          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ fontFamily: 'Fraunces,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 16, color: 'var(--text-muted)' }}>Completed (last 20)</h2>
            </div>
            <Table columns={cols.slice(0,-1)} data={done.slice(0,20)} />
          </div>
        )}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)}
        title={selected?.title || 'Update task'}
        footer={<>
          <button className="btn-secondary btn-sm" onClick={() => setSelected(null)}>Cancel</button>
          {STATUS_NEXT[selected?.status] && (
            <button className="btn-primary btn-sm" disabled={update.isPending}
              onClick={() => advance(selected)}>
              {update.isPending ? 'Saving…' : STATUS_LABEL[selected?.status]}
            </button>
          )}
        </>}>
        {selected && (
          <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'var(--surface-muted)', borderRadius: 10, padding: '0.75rem' }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Location</p>
              <p style={{ fontSize: 14, fontWeight: 600 }}>{selected.unit_number} · {selected.property_name}</p>
            </div>
            {selected.description && (
              <div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Description</p>
                <p style={{ fontSize: 13 }}>{selected.description}</p>
              </div>
            )}
            <div>
              <label className="label">Work note (optional)</label>
              <textarea className="input" style={{ minHeight: 80 }} value={note} onChange={e=>setNote(e.target.value)}
                placeholder="Describe what was done…" />
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
