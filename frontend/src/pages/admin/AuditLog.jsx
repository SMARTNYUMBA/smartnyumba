import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api';
import AppLayout from '../../components/layout/AppLayout';

export default function AuditLog() {
  const [filters, setFilters] = useState({ actor_id:'', action:'', from:'', to:'', page:1 });
  const set = k => e => setFilters(p=>({...p,[k]:e.target.value,page:1}));

  const { data, isLoading } = useQuery({
    queryKey: ['audit-log', filters],
    queryFn: () => api.get('/organisations/audit', { params: filters }).then(r=>r.data),
    staleTime: 30000,
    keepPreviousData: true,
  });

  const rows  = data?.data  || [];
  const meta  = data?.meta  || {};

  const actionColour = (action) => {
    if (action.includes('delete') || action.includes('remove')) return 'text-[--red] bg-[--red-bg]';
    if (action.includes('create') || action.includes('add'))   return 'text-[--green] bg-[--green-bg]';
    if (action.includes('update') || action.includes('edit'))  return 'text-blue-500 bg-blue-50';
    return 'text-[--text-muted] bg-[--surface-muted]';
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-[--text-primary]">Audit Log</h1>
          <p className="text-[--text-muted] text-sm mt-0.5">All actions taken by staff in your organisation</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <input className="input text-sm" placeholder="Action (e.g. payment.create)" value={filters.action} onChange={set('action')}/>
          <input className="input text-sm" type="date" value={filters.from} onChange={set('from')}/>
          <input className="input text-sm" type="date" value={filters.to} onChange={set('to')}/>
          <button className="btn-secondary text-sm" onClick={()=>setFilters({actor_id:'',action:'',from:'',to:'',page:1})}>Clear</button>
        </div>

        {/* Table */}
        {isLoading ? (
          <p className="text-[--text-muted] text-sm">Loading...</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[--border]">
            <div className="table-wrap">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-[--surface-muted]">
                <tr>{['Time','Actor','Action','Resource','IP'].map(h=>(
                  <th key={h} className="px-4 py-3 text-left text-[--text-muted] font-medium text-xs uppercase tracking-wide">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-[--border]">
                {rows.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-[--text-muted]">No audit events found</td></tr>
                ) : rows.map(r=>(
                  <tr key={r.id} className="bg-[--surface] hover:bg-[--surface-muted]">
                    <td className="px-4 py-3 text-[--text-muted] whitespace-nowrap font-mono text-xs">
                      {new Date(r.created_at).toLocaleString('en-KE')}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[--text-primary]">{r.actor_role||'—'}</p>
                      <p className="text-xs text-[--text-muted]">{r.actor_email||r.actor_id||'—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${actionColour(r.action)}`}>
                        {r.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[--text-muted] font-mono text-xs">
                      {r.resource}{r.resource_id ? ` #${r.resource_id}` : ''}
                    </td>
                    <td className="px-4 py-3 text-[--text-muted] font-mono text-xs">{r.ip||'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {/* Pagination */}
        {meta.pages > 1 && (
          <div className="flex items-center justify-between text-sm text-[--text-muted]">
            <span>Page {meta.page} of {meta.pages} ({meta.total} events)</span>
            <div className="flex gap-2">
              <button className="btn-secondary btn-sm" disabled={meta.page<=1}
                onClick={()=>setFilters(p=>({...p,page:p.page-1}))}>← Prev</button>
              <button className="btn-secondary btn-sm" disabled={meta.page>=meta.pages}
                onClick={()=>setFilters(p=>({...p,page:p.page+1}))}>Next →</button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
