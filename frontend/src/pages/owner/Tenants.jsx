import { useQuery } from '@tanstack/react-query';
import AppLayout from '../../components/layout/AppLayout';
import api from '../../api';
import { fmtDate, fmt } from '../../utils/helpers';

export default function OwnerTenants() {
  const { data, isLoading } = useQuery({
    queryKey: ['owner-tenants'],
    queryFn:  () => api.get('/owner/tenants').then(r =>
      r.data.tenants || []
    ),
  });

  const tenants = data || [];

  return (
    <AppLayout title="My Tenants">
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-[--text-muted]">Loading…</div>
        ) : tenants.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-3xl mb-3">👥</p>
            <p className="font-semibold text-[--text-primary]">No active tenants</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Unit</th>
                  <th>Property</th>
                  <th>Monthly Rent</th>
                  <th>Lease Start</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map(u => (
                  <tr key={u.id}>
                    <td>
                      <p className="font-medium text-[--text-primary]">{u.tenant_name || '—'}</p>
                      <p className="text-xs text-[--text-muted]">{u.tenant_phone || ''}</p>
                    </td>
                    <td className="font-mono text-sm">{u.unit_number}</td>
                    <td className="text-[--text-secondary]">{u.property_name}</td>
                    <td className="font-semibold text-[--green]">
                      KES {Number(u.tenancy_rent || u.rent_amount || 0).toLocaleString()}
                    </td>
                    <td className="text-[--text-muted] text-sm">
                      {u.start_date ? fmtDate(u.start_date) : '—'}
                    </td>
                    <td>
                      {u.balance > 0
                        ? <span className="font-bold text-[--red]">{fmt(u.balance)}</span>
                        : <span className="text-[--green] text-xs font-medium">Clear ✓</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
