import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout  from '../../components/layout/AppLayout';
import Modal      from '../../components/ui/Modal';
import Input      from '../../components/ui/Input';
import Select     from '../../components/ui/Select';
import { Table }  from '../../components/ui/Table';
import Badge      from '../../components/ui/Badge';
import KpiCard    from '../../components/ui/KpiCard';
import { useAuth } from '../../context/AuthContext';
import { getVisitors, checkInVisitor, checkOutVisitor, getUnits, getProperties } from '../../api';
import { fmtTime, fmtDate, fmtDateTime } from '../../utils/helpers';

const RANGE_OPTS = [
  { value: 'today',  label: 'Today' },
  { value: 'week',   label: 'Last 7 days' },
  { value: 'month',  label: 'Last 30 days' },
];

// BUG FIX: this used to compute a single shifted calendar date (e.g.
// "7 days ago") and send it as `date`, which the backend treats as an
// EXACT-day match (DATE(v.check_in)=?). So picking "Last 7 days" or
// "Last 30 days" never returned a rolling window — it only returned
// visitors checked in on that one specific day (usually none). The
// backend already supports a `period` param ('week'|'month'|'on_site')
// for real rolling-window queries; use that instead, and only send an
// exact `date` for the "Today" tab.
function getVisitorQueryParams(range) {
  if (range === 'week' || range === 'month') return { period: range };
  return { date: new Date().toISOString().split('T')[0] };
}

export default function SecurityVisitors() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [range, setRange]   = useState('today');
  const [modal, setModal]   = useState(false);
  const [busy,  setBusy]    = useState(false);

  // Pre-fill property from security guard's assignment
  const [form, setForm] = useState({
    property_id:   String(user?.property_id || ''),
    unit_id:       '',
    name:          '',
    phone:         '',
    id_number:     '',
    vehicle_plate: '',
    purpose:       '',
  });
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const rangeParams = getVisitorQueryParams(range);

  const { data, isLoading } = useQuery({
    queryKey: ['security-visitors', range, user?.property_id],
    queryFn: () => getVisitors({
      ...rangeParams,
      property_id: user?.property_id || undefined,
    }).then(r => r.data),
    refetchInterval: 30000, // auto-refresh every 30s
  });

  const { data: units }  = useQuery({
    queryKey: ['units-occupied', user?.property_id],
    queryFn: () => getUnits({ status: 'occupied', property_id: user?.property_id || undefined }).then(r => r.data.units),
  });

  const { data: props } = useQuery({
    queryKey: ['properties'],
    queryFn: () => getProperties().then(r => r.data.properties),
    enabled: !user?.property_id, // only fetch all properties if guard has none assigned
  });

  // Filter units by selected property in form
  const unitOpts = (units||[])
    .filter(u => !form.property_id || String(u.property_id) === String(form.property_id))
    .map(u => ({ value: u.id, label: `${u.unit_number}${u.tenant_name ? ' — ' + u.tenant_name : ''}` }));

  // If guard has a fixed property, only show that; otherwise show all
  const propOpts = user?.property_id
    ? [{ value: String(user.property_id), label: 'My property' }]
    : (props||[]).map(p => ({ value: String(p.id), label: p.name }));

  const allVisitors   = data?.visitors || [];
  const onSite        = allVisitors.filter(v => v.status === 'checked_in');
  const checkedOut    = allVisitors.filter(v => v.status === 'checked_out');

  const checkIn = async () => {
    if (!form.property_id || !form.name) return toast.error('Property and visitor name required');
    setBusy(true);
    try {
      await checkInVisitor({ ...form, checked_in_by: user?.id || user?.sub });
      toast.success(`${form.name} checked in!`);
      qc.invalidateQueries(['security-visitors']);
      setModal(false);
      setForm(f => ({ ...f, name:'', phone:'', id_number:'', vehicle_plate:'', purpose:'', unit_id:'' }));
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const doCheckOut = async (id, name) => {
    try {
      await checkOutVisitor(id);
      toast.success(`${name} checked out`);
      qc.invalidateQueries(['security-visitors']);
    } catch { toast.error('Failed to check out'); }
  };

  const cols = [
    { label: 'Visitor',   render: r => <div><p className="font-medium">{r.name}</p><p className="text-xs text-[--text-muted]">{r.phone||'—'}</p></div> },
    { label: 'ID',        render: r => <span className="text-xs text-[--text-muted] font-mono">{r.id_number||'—'}</span> },
    { label: 'Visiting',  render: r => r.unit_number ? `Unit ${r.unit_number}` : '—' },
    { label: 'Vehicle',   render: r => r.vehicle_plate ? <span className="font-mono text-xs bg-[--surface-muted] px-2 py-0.5 rounded">{r.vehicle_plate}</span> : '—' },
    { label: 'Purpose',   render: r => <span className="text-xs text-[--text-muted]">{r.purpose||'—'}</span> },
    { label: 'In',        render: r => <span className="text-xs font-mono">{fmtTime(r.check_in)}</span> },
    { label: 'Out',       render: r => r.check_out ? <span className="text-xs font-mono">{fmtTime(r.check_out)}</span> : '—' },
    { label: 'Status',    render: r => <Badge status={r.status} label={r.status === 'checked_in' ? 'On site' : 'Left'} /> },
    { label: '',          render: r => r.status === 'checked_in' && (
      <button className="btn-danger btn-sm" onClick={e => { e.stopPropagation(); doCheckOut(r.id, r.name); }}>
        Check out
      </button>
    )},
  ];

  return (
    <AppLayout title="Visitors" actions={
      <button className="btn-primary btn-sm" onClick={() => setModal(true)}>+ Check in visitor</button>
    }>
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <KpiCard label="Currently on site" value={onSite.length}       icon="👋" color="green" />
        <KpiCard label="Checked out"        value={checkedOut.length}  icon="✅" color="brand" />
        <KpiCard label="Total this period"  value={allVisitors.length} icon="📋" color="slate" />
      </div>

      {/* Range filter */}
      <div className="flex gap-2 mb-4">
        {RANGE_OPTS.map(({value, label}) => (
          <button key={value} onClick={() => setRange(value)}
            className={`px-4 py-2 text-sm rounded-xl font-medium transition ${range===value ? 'bg-brand-600 text-white' : 'bg-[--surface-muted] text-[--text-secondary]'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* On-site section — always visible at top */}
      {onSite.length > 0 && (
        <div className="mb-5">
          <h2 className="text-sm font-semibold text-[--green] uppercase tracking-wide mb-2">
            🟢 Currently on site ({onSite.length})
          </h2>
          <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)",padding:"1.25rem"}}>
            <Table columns={cols} data={onSite} emptyMsg="" />
        </div>
        </div>
      )}

      {/* All visitors for period */}
      <div>
        <h2 className="text-sm font-semibold text-[--text-secondary] uppercase tracking-wide mb-2">
          All visitors — {RANGE_OPTS.find(r=>r.value===range)?.label}
        </h2>
        <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)",padding:"1.25rem"}}>
          <Table columns={cols} data={allVisitors} loading={isLoading} emptyMsg="No visitors for this period" />
        </div>
      </div>

      {/* Check-in modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="Check in visitor">
        <div className="p-5 flex flex-col gap-3">
          {user?.property_id && (
            <div className="alert-info text-xs">📍 Property auto-filled from your assignment.</div>
          )}
          {!user?.property_id && (
            <Select label="Property *" value={form.property_id}
              onChange={v => setForm(p => ({...p, property_id: v, unit_id: ''}))}
              options={propOpts} placeholder="Select property..." />
          )}
          <Select label="Visiting unit (optional)" value={form.unit_id}
            onChange={v => setForm(p => ({...p, unit_id: v}))}
            options={unitOpts} placeholder="Select unit..." />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Visitor name *" value={form.name}    onChange={set('name')}    placeholder="Full name" />
            <Input label="Phone"          value={form.phone}   onChange={set('phone')}   placeholder="07XX XXX XXX" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="ID number"     value={form.id_number}    onChange={set('id_number')} placeholder="National ID / Passport" />
            <Input label="Vehicle plate" value={form.vehicle_plate} onChange={set('vehicle_plate')} placeholder="KXX 000A" />
          </div>
          <Input label="Purpose" value={form.purpose} onChange={set('purpose')} placeholder="e.g. Social visit, Delivery" />
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={checkIn} disabled={busy}>{busy ? 'Checking in...' : 'Check in'}</button>
        </div>
      </Modal>
    </AppLayout>
  );
}
