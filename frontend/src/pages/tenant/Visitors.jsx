import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout from '../../components/layout/AppLayout';
import Modal     from '../../components/ui/Modal';
import Input     from '../../components/ui/Input';
import Badge     from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import api from '../../api';
import { fmtTime, fmtDate, fmtDateTime } from '../../utils/helpers';


// Inline spinner — avoids extra import
const Spinner = () => (
  <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'200px' }}>
    <div style={{ width:36, height:36, border:'3px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);
export default function TenantVisitors() {
  const { user } = useAuth();
  const p  = user?.profile || {};
  const qc = useQueryClient();

  const [tab,    setTab]    = useState('today');
  const [modal,  setModal]  = useState(null); // 'checkin' | 'preregister'
  const [form,   setForm]   = useState({ name:'', phone:'', id_number:'', vehicle_plate:'', purpose:'' });
  const [preForm, setPreForm] = useState({ name:'', phone:'', id_number:'', vehicle_plate:'', purpose:'', expected_date: new Date().toISOString().split('T')[0] });
  const [busy,   setBusy]   = useState(false);
  const set    = k => e => setForm(f => ({...f, [k]: k==='vehicle_plate' ? e.target.value.toUpperCase() : e.target.value}));
  const setPre = k => e => setPreForm(f => ({...f, [k]: k==='vehicle_plate' ? e.target.value.toUpperCase() : e.target.value}));

  const today = new Date().toISOString().split('T')[0];

  const { isLoading, data: todayData } = useQuery({
    queryKey: ['my-visitors-today'],
    queryFn: () => api.get('/visitors', { params: { date: today, unit_id: p.unit_id } }).then(r => r.data),
    enabled: !!p.unit_id,
  });

  const { data: preData } = useQuery({
    queryKey: ['my-preregistered'],
    queryFn: () => api.get('/visitors/pre-registered', { params: { unit_id: p.unit_id } }).then(r => r.data.visitors || []).catch(() => []),
    enabled: !!p.unit_id,
  });

  const checkIn = async () => {
    if (!form.name) return toast.error('Visitor name required');
    if (!p.property_id) return toast.error('No active tenancy found');
    setBusy(true);
    try {
      await api.post('/visitors', { ...form, property_id: p.property_id, unit_id: p.unit_id, tenancy_id: p.tenancy_id });
      toast.success(form.name + ' checked in!');
      qc.invalidateQueries(['my-visitors-today']);
      setModal(null);
      setForm({ name:'', phone:'', id_number:'', vehicle_plate:'', purpose:'' });
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const preRegister = async () => {
    if (!preForm.name) return toast.error('Visitor name required');
    if (!p.property_id) return toast.error('No active tenancy found');
    setBusy(true);
    try {
      await api.post('/visitors/pre-register', { ...preForm, property_id: p.property_id, unit_id: p.unit_id });
      toast.success(preForm.name + ' pre-registered! Security will have their name on the list.');
      qc.invalidateQueries(['my-preregistered']);
      setModal(null);
      setPreForm({ name:'', phone:'', id_number:'', vehicle_plate:'', purpose:'', expected_date: today });
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const visitors = todayData?.visitors || [];
  const onSite   = visitors.filter(v => v.status === 'checked_in');

  const cols_today = [
    { label: 'Visitor',  render: r => <div><p className="font-medium">{r.name}</p><p className="text-xs text-[--text-muted]">{r.phone||'—'}</p></div> },
    { label: 'Purpose',  render: r => <span className="text-sm text-[--text-muted]">{r.purpose||'—'}</span> },
    { label: 'In',       render: r => <span className="text-xs font-mono">{fmtTime(r.check_in)}</span> },
    { label: 'Out',      render: r => r.check_out ? <span className="text-xs font-mono">{fmtTime(r.check_out)}</span> : <span className="text-[--green] text-xs">On site</span> },
    { label: 'Status',   render: r => <Badge status={r.status} label={r.status === 'checked_in' ? 'On site' : 'Left'} /> },
  ];

  if (isLoading) return <Spinner />;
  return (
    <AppLayout title="My Visitors" actions={
      <div className="flex gap-2">
        <button className="btn-secondary btn-sm" onClick={() => setModal('preregister')}>📋 Pre-register</button>
        <button className="btn-primary btn-sm" onClick={() => setModal('checkin')}>+ Check in now</button>
      </div>
    }>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="card card-body text-center">
          <p className="text-3xl font-bold text-[--green]">{onSite.length}</p>
          <p className="text-xs text-[--text-muted] mt-1">Currently on site</p>
        </div>
        <div className="card card-body text-center">
          <p className="text-3xl font-bold text-[--brand]">{visitors.length}</p>
          <p className="text-xs text-[--text-muted] mt-1">Total today</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[--surface-muted] p-1 rounded-xl mb-4 w-fit">
        {[{id:'today',label:'Today'},{id:'pre',label:'Pre-registered'}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${tab===t.id?'bg-[--surface] shadow':'text-[--text-muted]'}`}>
            {t.label} {t.id==='pre' && (preData||[]).length > 0 && <span className="ml-1 bg-[--brand] text-white text-xs px-1.5 rounded-full">{(preData||[]).length}</span>}
          </button>
        ))}
      </div>

      {tab === 'today' && (
        <div className="card card-body">
          {!visitors.length ? (
            <div className="text-center py-10 text-[--text-muted]">
              <p className="text-3xl mb-2">👋</p>
              <p>No visitors today</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="table-wrap">
              <table className="table w-full">
                <thead><tr>{cols_today.map(c=><th key={c.label}>{c.label}</th>)}</tr></thead>
                <tbody>{visitors.map((r,i)=><tr key={i}>{cols_today.map((c,j)=><td key={j}>{c.render(r)}</td>)}</tr>)}</tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'pre' && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {!(preData||[]).length ? (
            <div className="card card-body text-center py-10 text-[--text-muted]">
              <p className="text-3xl mb-2">📋</p>
              <p>No pre-registered visitors</p>
              <p className="text-sm mt-1">Pre-register expected guests so security can let them in.</p>
            </div>
          ) : (preData||[]).map((v,i) => (
            <div key={i} className="card card-body flex items-center gap-4">
              <div className="flex-1">
                <p className="font-medium">{v.name}</p>
                <p className="text-xs text-[--text-muted]">{v.phone||'—'} · {v.purpose||'—'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[--text-muted]">Expected</p>
                <p className="text-sm font-medium">{fmtDate(v.expected_date||v.created_at)}</p>
              </div>
              <Badge status={v.status||'pending'} label={v.status||'pending'} />
            </div>
          ))}
        </div>
      )}

      {/* Check-in modal */}
      <Modal open={modal==='checkin'} onClose={() => setModal(null)} title="Check in visitor now">
        <div className="p-5 flex flex-col gap-3">
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
          <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={checkIn} disabled={busy}>{busy?'Checking in...':'Check in'}</button>
        </div>
      </Modal>

      {/* Pre-register modal */}
      <Modal open={modal==='preregister'} onClose={() => setModal(null)} title="Pre-register a visitor">
        <div className="p-5 flex flex-col gap-3">
          <div className="alert-info text-xs">Security will have this visitor on the expected list. They'll be let in without delay.</div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Visitor name *" value={preForm.name}  onChange={setPre('name')}  placeholder="Full name" />
            <Input label="Phone"          value={preForm.phone} onChange={setPre('phone')} placeholder="07XX XXX XXX" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="ID number"      value={preForm.id_number}    onChange={setPre('id_number')} placeholder="National ID / Passport" />
            <Input label="Vehicle plate"  value={preForm.vehicle_plate} onChange={setPre('vehicle_plate')} placeholder="KXX 000A" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Expected date *" type="date" value={preForm.expected_date} onChange={setPre('expected_date')} />
            <Input label="Purpose"         value={preForm.purpose} onChange={setPre('purpose')} placeholder="e.g. Delivery" />
          </div>
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={preRegister} disabled={busy}>{busy?'Registering...':'Pre-register'}</button>
        </div>
      </Modal>
    </AppLayout>
  );
}
