import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout   from '../../components/layout/AppLayout';
import Modal       from '../../components/ui/Modal';
import Input       from '../../components/ui/Input';
import Select      from '../../components/ui/Select';
import { Table }   from '../../components/ui/Table';
import Avatar      from '../../components/ui/Avatar';
import Badge       from '../../components/ui/Badge';
import ExportBar, { exportToCsv, exportToExcel } from '../../components/ui/ExportBar';
import api, { getTenants, createTenant, getProperties } from '../../api';
import { fmt, fmtDate } from '../../utils/helpers';
import { can } from '../../utils/roleGuard';
import { useAuth } from '../../context/AuthContext';

export default function Tenants() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [propertyId, setPropertyId] = useState('');
  const [search, setSearch]         = useState('');
  const [modal, setModal]           = useState(false);
  const [form, setForm]             = useState({ full_name:'',email:'',phone:'',id_number:'',passport_number:'',vehicle_plate:'' });
  const [generatedPw, setGeneratedPw] = useState('');
  const [editTarget, setEditTarget]   = useState(null);
  const [editForm, setEditForm]       = useState({});
  const [busy, setBusy]               = useState(false);
  const setE = k => e => setForm(f=>({...f,[k]:e.target.value}));
  const setEE = k => e => setEditForm(f=>({...f,[k]:e.target.value}));

  const openEdit = async (row) => {
    try {
      const { data } = await api.get('/tenants/' + row.id);
      setEditForm({
        full_name: data.tenant?.full_name || row.full_name || '',
        email:     data.tenant?.email     || row.email     || '',
        phone:     data.tenant?.phone     || row.phone     || '',
        id_number: data.tenant?.id_number || row.id_number || '',
        passport_number: data.tenant?.passport_number || row.passport_number || '',
        vehicle_plate:   data.tenant?.vehicle_plate   || row.vehicle_plate   || '',
        emergency_contact: data.tenant?.emergency_contact || '',
        emergency_phone:   data.tenant?.emergency_phone   || '',
      });
      setEditTarget(row);
    } catch { toast.error('Could not load tenant details'); }
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      await api.put('/tenants/' + editTarget.id, editForm);
      toast.success('Tenant updated!');
      qc.invalidateQueries(['tenants']);
      setEditTarget(null);
    } catch(e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const { data, isLoading } = useQuery({
    queryKey:['tenants', propertyId, search],
    queryFn: () => getTenants({ property_id: propertyId||undefined, q: search||undefined }).then(r=>r.data.tenants)
  });
  const { data: props } = useQuery({ queryKey:['properties'], queryFn: () => getProperties().then(r=>r.data.properties) });

  const save = async () => {
    if (!form.full_name||!form.phone) return toast.error('Name and phone required');
    if (!form.email) return toast.error('Email is required to send login credentials');
    setBusy(true);
    try {
      const res = await createTenant(form);
      const pw = res.data?.auto_password;
      if (pw) {
        setGeneratedPw(pw);
        toast.success('Tenant created! Auto-password generated — copy it now.');
      } else {
        toast.success('Tenant created!');
        setModal(false);
      }
      qc.invalidateQueries(['tenants']);
    } catch(e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const exportData = () => exportToCsv(
    (data||[]).map(t=>({ Name:t.full_name, Email:t.email, Phone:t.phone, 'ID No':t.id_number||'', Passport:t.passport_number||'', Unit:t.unit_number||'', Property:t.property_name||'', Rent:t.rent_amount||'', Balance:t.balance||0, Lease:t.tenancy_status||'' })),
    'tenants'
  );

  const cols = [
    { label:'Tenant',    render: r => (
      <div className="flex items-center gap-3">
        <Avatar name={r.full_name} size="sm" src={r.profile_photo} />
        <div><p className="font-medium">{r.full_name}</p><p className="text-xs text-[--text-muted]">{r.email}</p></div>
      </div>
    )},
    { label:'Phone',     render: r => r.phone },
    { label:'ID No.',    render: r => r.id_number || r.passport_number || '—' },
    { label:'Unit',      render: r => r.unit_number ? <span className="font-medium">{r.unit_number}</span> : <span className="text-[--text-muted]">No unit</span> },
    { label:'Property',  render: r => <span className="text-xs text-[--text-muted]">{r.property_name||'—'}</span> },
    { label:'Rent',      render: r => r.rent_amount ? fmt(r.rent_amount) : '—' },
    { label:'Balance',   render: r => r.balance > 0 ? <span className="text-[--red] font-bold">{fmt(r.balance)}</span> : <span className="text-[--green] text-xs">Clear</span> },
    { label:'Lease',     render: r => r.tenancy_status ? <Badge status={r.tenancy_status} label={r.tenancy_status} /> : <span className="badge badge-gray">None</span> },
    { label:'',          render: r => can(user, 'edit_tenant') ? <button className="btn-ghost btn-sm" style={{color:'var(--brand)'}} onClick={e=>{e.stopPropagation();openEdit(r);}}>Edit</button> : null },
  ];

  return (
    <AppLayout title="Tenants" actions={
      <div className="flex gap-2">
        <ExportBar onCsv={exportData} onExcel={() => exportToExcel(exportData(), "tenants")} />
        {can(user, 'create_tenant') && (
          <button className="btn-primary btn-sm" onClick={()=>setModal(true)}>+ Add tenant</button>
        )}
      </div>
    }>
      <div className="flex flex-wrap gap-3 mb-4">
        <input className="input w-64 text-sm" placeholder="Search by name, phone or email..." value={search} onChange={e=>setSearch(e.target.value)} />
        <select className="input w-48 text-sm" value={propertyId} onChange={e=>setPropertyId(e.target.value)}>
          <option value="">All properties</option>
          {(props||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)",padding:"1.25rem"}}><Table columns={cols} data={data} loading={isLoading} emptyMsg="No tenants found" /></div>

      <Modal open={modal} onClose={()=>{ setModal(false); setGeneratedPw(''); setForm({ full_name:'',email:'',phone:'',id_number:'',passport_number:'',vehicle_plate:'' }); }} title="Add new tenant">
        {generatedPw ? (
          <div className="p-5 flex flex-col gap-4">
            <div className="p-4 bg-[--green-bg] border border-[--green-bg] rounded-xl">
              <p className="text-sm font-semibold text-green-800 mb-2">✅ Tenant created successfully!</p>
              <p className="text-xs text-green-700 mb-3">A welcome email was sent. Copy the temporary password below and share it securely if needed:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-[--surface] border border-green-300 px-3 py-2 rounded-lg text-sm font-mono font-bold text-[--text-primary]">{generatedPw}</code>
                <button className="btn-secondary btn-sm" onClick={() => { navigator.clipboard.writeText(generatedPw); toast.success('Copied!'); }}>Copy</button>
              </div>
              <p className="text-xs text-[--text-muted] mt-2">⚠️ This password will not be shown again.</p>
            </div>
          </div>
        ) : (
          <div className="p-5 grid grid-cols-2 gap-x-4">
            <div className="col-span-2"><Input label="Full name *" value={form.full_name} onChange={setE('full_name')} /></div>
            <Input label="Email *" type="email" value={form.email||''} onChange={setE('email')} placeholder="Used for login & welcome email" />
            <Input label="Phone *" value={form.phone} onChange={setE('phone')} placeholder="07XX XXX XXX" />
            <Input label="ID Number" value={form.id_number||''} onChange={setE('id_number')} />
            <Input label="Passport Number" value={form.passport_number||''} onChange={setE('passport_number')} />
            <div className="col-span-2"><Input label="Vehicle plate" value={form.vehicle_plate||''} onChange={setE('vehicle_plate')} placeholder="KXX 000A" /></div>
            <p className="col-span-2 text-xs text-[--text-muted] mt-1">🔐 A secure temporary password will be auto-generated and emailed to the tenant.</p>
          </div>
        )}
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          {generatedPw ? (
            <button className="btn-primary" onClick={() => { setModal(false); setGeneratedPw(''); setForm({ full_name:'',email:'',phone:'',id_number:'',passport_number:'',vehicle_plate:'' }); }}>Done</button>
          ) : (
            <>
              <button className="btn-secondary" onClick={()=>setModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={save} disabled={busy}>{busy?'Creating...':'Create tenant'}</button>
            </>
          )}
        </div>
      </Modal>
      {/* Edit Tenant Modal */}
      <Modal open={!!editTarget} onClose={()=>setEditTarget(null)} title="Edit tenant">
        <div className="p-5 grid grid-cols-2 gap-x-4">
          <div className="col-span-2"><Input label="Full name *" value={editForm.full_name||''} onChange={setEE('full_name')} /></div>
          <Input label="Email" type="email" value={editForm.email||''} onChange={setEE('email')} />
          <Input label="Phone *" value={editForm.phone||''} onChange={setEE('phone')} />
          <Input label="ID Number" value={editForm.id_number||''} onChange={setEE('id_number')} />
          <Input label="Passport" value={editForm.passport_number||''} onChange={setEE('passport_number')} />
          <Input label="Vehicle plate" value={editForm.vehicle_plate||''} onChange={setEE('vehicle_plate')} />
          <Input label="Emergency contact" value={editForm.emergency_contact||''} onChange={setEE('emergency_contact')} />
          <Input label="Emergency phone" value={editForm.emergency_phone||''} onChange={setEE('emergency_phone')} />
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={()=>setEditTarget(null)}>Cancel</button>
          <button className="btn-primary" onClick={saveEdit} disabled={busy}>{busy?'Saving...':'Save changes'}</button>
        </div>
      </Modal>
    </AppLayout>
  );
}
