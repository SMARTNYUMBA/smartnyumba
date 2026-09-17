/**
 * Manager Staff Management — /manager/staff
 * Managers can view, invite, and manage caretakers & security staff
 * assigned to their properties.
 */
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AppLayout  from '../../components/layout/AppLayout';
import Modal      from '../../components/ui/Modal';
import Avatar     from '../../components/ui/Avatar';
import Input      from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import api         from '../../api';
import { fmtDate, roleName } from '../../utils/helpers';

const STAFF_ROLES = ['caretaker','security','property_manager'];

const roleColor = (role) => ({
  property_manager: 'badge-blue',
  caretaker:        'badge-amber',
  security:         'badge-purple',
}[role] || 'badge-gray');

export default function ManagerStaff() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [modal,       setModal]       = useState(null); // 'invite' | 'edit' | 'reset'
  const [target,      setTarget]      = useState(null);
  const [inviteForm,  setInviteForm]  = useState({ email:'', role:'caretaker', property_id:'', full_name:'' });
  const [editForm,    setEditForm]    = useState({});
  const [newPw,       setNewPw]       = useState('');
  const [busy,        setBusy]        = useState(false);
  const setI = k => e => setInviteForm(f => ({ ...f, [k]: e.target.value }));
  const setE = k => e => setEditForm(f => ({ ...f, [k]: e.target.value }));

  // Load staff (caretakers + security + sub-managers)
  const { data, isLoading } = useQuery({
    queryKey: ['manager-staff'],
    queryFn:  () => api.get('/users', { params: { role: '' } }).then(r =>
      (r.data.users || []).filter(u => STAFF_ROLES.includes(u.role))
    ),
  });

  // Load manager's properties for the invite form
  const { data: props } = useQuery({
    queryKey: ['my-properties'],
    queryFn:  () => api.get('/properties').then(r => r.data.properties || []),
  });

  const staff = data || [];

  const invite = async () => {
    if (!inviteForm.email) return toast.error('Email required');
    if (!inviteForm.role)  return toast.error('Role required');
    setBusy(true);
    try {
      const res = await api.post('/users/invite', {
        email:       inviteForm.email.trim(),
        role:        inviteForm.role,
        property_id: inviteForm.property_id || undefined,
        full_name:   inviteForm.full_name.trim() || undefined,
      });
      toast.success(`Invited! Temp password: ${res.data.temp_password}`);
      setModal(null);
      setInviteForm({ email:'', role:'caretaker', property_id:'', full_name:'' });
      qc.invalidateQueries(['manager-staff']);
    } catch(e) { toast.error(e.response?.data?.error || 'Failed to invite'); }
    finally { setBusy(false); }
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      await api.put(`/users/${target.id}`, editForm);
      toast.success('Staff member updated!');
      setModal(null);
      qc.invalidateQueries(['manager-staff']);
    } catch(e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const resetPw = async () => {
    if (!newPw || newPw.length < 8) return toast.error('Min 8 characters');
    setBusy(true);
    try {
      await api.put(`/users/${target.id}/password`, { password: newPw });
      toast.success('Password reset!');
      setModal(null); setNewPw('');
    } catch(e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const suspend = async (u) => {
    try {
      await api.put(`/users/${u.id}/${u.is_suspended ? 'unsuspend' : 'suspend'}`,
        u.is_suspended ? {} : { reason: 'Suspended by property manager' });
      toast.success(u.is_suspended ? 'Staff reinstated' : 'Staff suspended');
      qc.invalidateQueries(['manager-staff']);
    } catch(e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  return (
    <AppLayout
      title="Staff Management"
      actions={
        <button className="btn-primary btn-sm" onClick={() => setModal('invite')}>
          + Invite staff
        </button>
      }>
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label:'Caretakers', count: staff.filter(s=>s.role==='caretaker').length, color:'bg-amber-100 text-amber-700' },
            { label:'Security',   count: staff.filter(s=>s.role==='security').length,   color:'bg-purple-100 text-purple-700' },
            { label:'Managers',   count: staff.filter(s=>s.role==='property_manager').length, color:'bg-blue-100 text-blue-700' },
          ].map(({ label, count, color }) => (
            <div key={label} className="card card-body flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg ${color}`}>
                {count}
              </div>
              <p className="text-sm font-medium text-[--text-primary]">{label}</p>
            </div>
          ))}
        </div>

        {/* Staff table */}
        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-[--text-muted]">Loading staff…</div>
          ) : staff.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-3xl mb-3">👥</p>
              <p className="font-semibold text-[--text-primary]">No staff yet</p>
              <p className="text-sm text-[--text-muted] mt-1">Invite caretakers and security staff to manage your properties</p>
              <button className="btn-primary btn-sm mt-4" onClick={() => setModal('invite')}>+ Invite staff</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Staff member</th>
                    <th>Role</th>
                    <th>Property</th>
                    <th>Last login</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map(s => (
                    <tr key={s.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={s.full_name} size="sm" src={s.profile_photo} />
                          <div>
                            <p className="font-medium text-[--text-primary]">{s.full_name}</p>
                            <p className="text-xs text-[--text-muted]">{s.email}</p>
                          </div>
                        </div>
                      </td>
                      <td><span className={roleColor(s.role)}>{roleName(s.role)}</span></td>
                      <td className="text-[--text-secondary] text-sm">{s.property_name || '—'}</td>
                      <td className="text-[--text-muted] text-sm">{s.last_login ? fmtDate(s.last_login) : 'Never'}</td>
                      <td>
                        <span className={`badge ${s.is_suspended ? 'badge-red' : s.is_active ? 'badge-green' : 'badge-gray'}`}>
                          {s.is_suspended ? 'Suspended' : s.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1 justify-end">
                          <button className="btn-ghost btn-sm text-[--brand]"
                            onClick={() => { setTarget(s); setEditForm({ full_name: s.full_name, phone: s.phone||'', property_id: s.property_id||'' }); setModal('edit'); }}>
                            Edit
                          </button>
                          <button className="btn-ghost btn-sm text-[--amber]"
                            onClick={() => { setTarget(s); setNewPw(''); setModal('reset'); }}>
                            Reset pw
                          </button>
                          <button className={`btn-ghost btn-sm ${s.is_suspended ? 'text-[--green]' : 'text-orange-500'}`}
                            onClick={() => suspend(s)}>
                            {s.is_suspended ? 'Reinstate' : 'Suspend'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Invite Modal */}
      <Modal open={modal==='invite'} onClose={() => setModal(null)} title="Invite staff member" size="sm"
        footer={<><button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={invite} disabled={busy}>{busy ? 'Sending…' : '📨 Send invite'}</button></>}>
        <div className="p-5 flex flex-col gap-3">
          <div className="alert-info text-xs">
            📧 An email with login credentials will be sent. The user should change their password on first login.
          </div>
          <Input label="Full name" value={inviteForm.full_name} onChange={setI('full_name')} placeholder="e.g. John Doe" />
          <Input label="Email address *" type="email" value={inviteForm.email} onChange={setI('email')} placeholder="staff@example.com" />
          <div className="form-group">
            <label className="label">Role *</label>
            <select className="input" value={inviteForm.role} onChange={setI('role')}>
              <option value="caretaker">Caretaker</option>
              <option value="security">Security</option>
            </select>
          </div>
          <div className="form-group">
            <label className="label">Assign to property</label>
            <select className="input" value={inviteForm.property_id} onChange={setI('property_id')}>
              <option value="">— Select property —</option>
              {(props||[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={modal==='edit'} onClose={() => setModal(null)} title={`Edit — ${target?.full_name}`} size="sm"
        footer={<><button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={saveEdit} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></>}>
        <div className="p-5 flex flex-col gap-3">
          <Input label="Full name" value={editForm.full_name||''} onChange={setE('full_name')} />
          <Input label="Phone" type="tel" value={editForm.phone||''} onChange={setE('phone')} />
          <div className="form-group">
            <label className="label">Property</label>
            <select className="input" value={editForm.property_id||''} onChange={setE('property_id')}>
              <option value="">— No property —</option>
              {(props||[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
      </Modal>

      {/* Reset password Modal */}
      <Modal open={modal==='reset'} onClose={() => setModal(null)} title={`Reset password — ${target?.full_name}`} size="sm"
        footer={<><button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={resetPw} disabled={busy}>{busy ? 'Resetting…' : 'Reset password'}</button></>}>
        <div className="p-5">
          <Input label="New password (min 8 chars)" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="••••••••" />
        </div>
      </Modal>
    </AppLayout>
  );
}
