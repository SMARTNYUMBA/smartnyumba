import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api';
import toast from 'react-hot-toast';
import AppLayout from '../../components/layout/AppLayout';

export default function ApiKeys() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate]   = useState(false);
  const [newKey, setNewKey]           = useState(null);
  const [form, setForm]               = useState({ name:'', role:'api_reader', expires_days:'' });
  const set = (k) => (e) => setForm(p=>({...p,[k]:e.target.value}));

  const { data, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api.get('/api-keys').then(r=>r.data),
    staleTime: 60000,
  });

  const create = useMutation({
    mutationFn: (body) => api.post('/api-keys', body).then(r=>r.data),
    onSuccess: (data) => {
      setNewKey(data.key);
      setShowCreate(false);
      setForm({ name:'', role:'api_reader', expires_days:'' });
      qc.invalidateQueries(['api-keys']);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const revoke = useMutation({
    mutationFn: (id) => api.delete(`/api-keys/${id}`),
    onSuccess: () => { toast.success('Key revoked'); qc.invalidateQueries(['api-keys']); },
    onError: () => toast.error('Failed to revoke'),
  });

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[--text-primary]">API Keys</h1>
            <p className="text-[--text-muted] text-sm mt-0.5">Programmatic access for integrations and automations</p>
          </div>
          <button className="btn-primary text-sm" onClick={()=>setShowCreate(true)}>+ New Key</button>
        </div>

        {/* Shown-once key banner */}
        {newKey && (
          <div className="bg-[--green-bg] border border-green-300 rounded-xl p-4">
            <p className="font-semibold text-green-800 mb-1">✓ API key created — copy it now</p>
            <p className="text-xs text-[--green] mb-2">This key will not be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-[--surface] border border-green-300 rounded-lg px-3 py-2 text-sm font-mono break-all">{newKey}</code>
              <button className="btn-sm btn-secondary" onClick={()=>{ navigator.clipboard.writeText(newKey); toast.success('Copied'); }}>Copy</button>
            </div>
            <button className="text-xs text-[--green] mt-2 hover:underline" onClick={()=>setNewKey(null)}>Dismiss</button>
          </div>
        )}

        {/* Keys table */}
        {isLoading ? (
          <p className="text-[--text-muted] text-sm">Loading...</p>
        ) : (data?.keys||[]).length === 0 ? (
          <div className="bg-[--surface] rounded-xl border border-[--border] p-8 text-center">
            <p className="text-[--text-muted]">No API keys yet.</p>
            <p className="text-[--text-muted] text-sm mt-1">Create a key to integrate with accounting software, ERP systems, or custom dashboards.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[--border]">
            <div className="table-wrap">
            <table className="w-full text-sm">
              <thead className="bg-[--surface-muted]">
                <tr>{['Name','Prefix','Role','Last used','Expires',''].map(h=>(
                  <th key={h} className="px-4 py-3 text-left text-[--text-muted] font-medium text-xs uppercase tracking-wide">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-[--border]">
                {(data?.keys||[]).map(k=>(
                  <tr key={k.id} className={`bg-[--surface] ${!k.is_active?'opacity-50':''}`}>
                    <td className="px-4 py-3 font-medium text-[--text-primary]">{k.name}</td>
                    <td className="px-4 py-3"><code className="text-xs bg-[--surface-muted] px-2 py-0.5 rounded">{k.key_prefix}…</code></td>
                    <td className="px-4 py-3 text-[--text-muted]">{k.role}</td>
                    <td className="px-4 py-3 text-[--text-muted]">{k.last_used ? new Date(k.last_used).toLocaleDateString() : 'Never'}</td>
                    <td className="px-4 py-3 text-[--text-muted]">{k.expires_at ? new Date(k.expires_at).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3">
                      {k.is_active && (
                        <button className="text-[--red] hover:text-red-700 text-xs font-medium"
                          onClick={()=>{ if(confirm('Revoke this key?')) revoke.mutate(k.id); }}>
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        <div className="bg-[--surface-muted] rounded-xl p-4 text-sm text-[--text-muted]">
          <p className="font-medium text-[--text-primary] mb-1">Usage</p>
          <code className="text-xs">Authorization: Bearer snp_live_xxxxxxxxxxxx</code>
          <p className="mt-1">Keys prefixed <code>snp_live_</code> are for production. Keep them secret.</p>
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[--surface] rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold text-[--text-primary] mb-4">Create API Key</h3>
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div>
                <label className="label">Name <span className="text-red-400">*</span></label>
                <input className="input w-full" placeholder="e.g. QuickBooks Integration" value={form.name} onChange={set('name')}/>
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input w-full" value={form.role} onChange={set('role')}>
                  <option value="api_reader">Read only</option>
                  <option value="api_writer">Read + Write</option>
                  <option value="property_manager">Property Manager</option>
                </select>
              </div>
              <div>
                <label className="label">Expires in (days, optional)</label>
                <input className="input w-full" type="number" placeholder="Leave blank for no expiry" value={form.expires_days} onChange={set('expires_days')}/>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button className="btn-secondary flex-1" onClick={()=>setShowCreate(false)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={()=>create.mutate(form)} disabled={create.isPending}>
                {create.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
