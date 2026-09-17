import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout   from '../../components/layout/AppLayout';
import Modal       from '../../components/ui/Modal';
import Input       from '../../components/ui/Input';
import Select      from '../../components/ui/Select';
import Textarea    from '../../components/ui/Textarea';
import { Table }   from '../../components/ui/Table';
import { useAuth } from '../../context/AuthContext';
import api from '../../api';
import { fmtDateTime } from '../../utils/helpers';


// Inline spinner — avoids extra import
const Spinner = () => (
  <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'200px' }}>
    <div style={{ width:36, height:36, border:'3px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);
export default function SecurityLogbook() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab]   = useState('incidents');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  const { isLoading, data: incidents } = useQuery({ queryKey:['logbook-incidents'], queryFn: () => api.get('/logbook/incidents').then(r=>r.data.incidents) });
  const { data: patrols }   = useQuery({ queryKey:['logbook-patrols'],   queryFn: () => api.get('/logbook/patrols').then(r=>r.data.patrols) });
  const { data: equipment } = useQuery({ queryKey:['logbook-equipment'], queryFn: () => api.get('/logbook/equipment').then(r=>r.data.equipment) });

  const openModal = () => {
    if (!user?.property_id) {
      toast.error('Your account has no property assigned. Contact your administrator.');
      return;
    }
    setForm({ property_id: user?.property_id||'' }); setModal(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      if (tab === 'incidents') await api.post('/logbook/incidents', form);
      else if (tab === 'patrols') await api.post('/logbook/patrols', form);
      else await api.post('/logbook/equipment', form);
      toast.success('Logged successfully!');
      qc.invalidateQueries([`logbook-${tab}`]);
      setModal(false);
    } catch(e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const setE = k => e => setForm(f=>({...f,[k]:e.target.value}));

  const tabs = [
    { key:'incidents', label:'Incidents' },
    { key:'patrols',   label:'Patrols'   },
    { key:'equipment', label:'Equipment Checks' },
  ];

  const incidentCols = [
    { label:'Time',     render: r => fmtDateTime(r.created_at) },
    { label:'Type',     render: r => r.incident_type||'General' },
    { label:'Property', render: r => r.property_name },
    { label:'Severity', render: r => <span className={`badge ${r.severity==='critical'?'badge-red':r.severity==='major'?'badge-amber':'badge-gray'}`}>{r.severity}</span> },
    { label:'Description',render:r => <span className="text-xs text-[--text-muted]">{r.description?.slice(0,60)}</span> },
    { label:'Status',   render: r => <span className={`badge ${r.status==='resolved'?'badge-green':'badge-blue'}`}>{r.status}</span> },
    { label:'By',       render: r => r.logged_by_name },
  ];

  const patrolCols = [
    { label:'Time',     render: r => fmtDateTime(r.created_at) },
    { label:'Officer',  render: r => r.officer_name },
    { label:'Property', render: r => r.property_name },
    { label:'Route',    render: r => r.route||'General patrol' },
    { label:'Status',   render: r => <span className={`badge ${r.status==='completed'?'badge-green':r.status==='issue_found'?'badge-red':'badge-amber'}`}>{r.status.replace('_',' ')}</span> },
  ];

  const equipCols = [
    { label:'Time',      render: r => fmtDateTime(r.checked_at) },
    { label:'Equipment', render: r => r.equipment },
    { label:'Property',  render: r => r.property_name },
    { label:'Status',    render: r => <span className={`badge ${r.status==='ok'?'badge-green':r.status==='faulty'?'badge-red':'badge-amber'}`}>{r.status.replace('_',' ')}</span> },
    { label:'Notes',     render: r => <span className="text-xs text-[--text-muted]">{r.notes||'—'}</span> },
    { label:'Checked by',render: r => r.checked_by_name },
  ];

  const currentData = tab==='incidents'?incidents:tab==='patrols'?patrols:equipment;
  const currentCols = tab==='incidents'?incidentCols:tab==='patrols'?patrolCols:equipCols;

  if (isLoading) return <Spinner />;
  return (
    <AppLayout title="Security Logbook" actions={
      <button className="btn-primary btn-sm" onClick={openModal}>+ Log entry</button>
    }>
      {/* Dark header */}
      <div className="bg-slate-800 rounded-2xl p-6 mb-5 text-white">
        <p className="text-xs text-[--text-muted] uppercase tracking-widest mb-1">Operations</p>
        <h2 className="text-2xl font-bold">Security Logbook</h2>
        <p className="text-[--text-muted] text-sm mt-1">Incidents, patrol rounds, and equipment checks</p>
        <div className="flex gap-2 mt-4">
          {tabs.map(t => (
            <button key={t.key} onClick={()=>setTab(t.key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab===t.key?'bg-[--surface] text-[--text-primary]':'bg-slate-700 text-[--text-muted] hover:bg-slate-600'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)",padding:"1.25rem"}}>
        <Table columns={currentCols} data={currentData} emptyMsg={`No ${tab} logged yet`} />
        </div>

      {/* Log entry modal */}
      <Modal open={modal} onClose={()=>setModal(false)} title={`Log ${tab.replace('_',' ')}`}>
        <div className="p-5 flex flex-col gap-3">
          {tab === 'incidents' && <>
            <Input label="Incident type" value={form.incident_type||''} onChange={setE('incident_type')} placeholder="e.g. Trespassing, Theft, Noise" />
            <Textarea label="Description *" value={form.description||''} onChange={setE('description')} rows={4} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Location" value={form.location||''} onChange={setE('location')} placeholder="e.g. Gate 1, Parking lot" />
              <Select label="Severity" value={form.severity||'minor'} onChange={v=>setForm(f=>({...f,severity:v}))} options={['minor','moderate','major','critical'].map(v=>({value:v,label:v}))} />
            </div>
            <Input label="Time of incident" type="datetime-local" value={form.occurred_at||''} onChange={setE('occurred_at')} />
          </>}

          {tab === 'patrols' && <>
            <Input label="Patrol route" value={form.route||''} onChange={setE('route')} placeholder="e.g. Perimeter, Block A-D, Parking" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Start time" type="datetime-local" value={form.patrol_start||''} onChange={setE('patrol_start')} />
              <Input label="End time"   type="datetime-local" value={form.patrol_end||''}   onChange={setE('patrol_end')} />
            </div>
            <Select label="Status" value={form.status||'completed'} onChange={v=>setForm(f=>({...f,status:v}))}
              options={[{value:'completed',label:'Completed'},{value:'incomplete',label:'Incomplete'},{value:'issue_found',label:'Issue found'}]} />
            <Textarea label="Notes" value={form.notes||''} onChange={setE('notes')} rows={3} />
          </>}

          {tab === 'equipment' && <>
            <Input label="Equipment name *" value={form.equipment||''} onChange={setE('equipment')} placeholder="e.g. CCTV Camera 1, Main Gate Motor" />
            <Select label="Status" value={form.status||'ok'} onChange={v=>setForm(f=>({...f,status:v}))}
              options={[{value:'ok',label:'OK - Working fine'},{value:'needs_repair',label:'Needs repair'},{value:'faulty',label:'Faulty'},{value:'replaced',label:'Replaced'}]} />
            <Textarea label="Notes" value={form.notes||''} onChange={setE('notes')} rows={3} />
          </>}
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy?'Saving...':'Log entry'}</button>
        </div>
      </Modal>
    </AppLayout>
  );
}
