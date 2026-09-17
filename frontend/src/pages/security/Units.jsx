import { useQuery } from '@tanstack/react-query';
import { useAuth }  from '../../context/AuthContext';
import AppLayout    from '../../components/layout/AppLayout';
import Badge        from '../../components/ui/Badge';
import { Table }    from '../../components/ui/Table';
import { getUnits } from '../../api';
import { fmt }      from '../../utils/helpers';

export default function SecurityUnits() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey:['units-security'],
    queryFn: () => getUnits({ property_id: user?.property_id }).then(r=>r.data.units)
  });

  const cols = [
    { label:'Unit',     render: r => <span className="font-semibold">{r.unit_number}</span> },
    { label:'Property', render: r => r.property_name },
    { label:'Floor',    render: r => `Floor ${r.floor}` },
    { label:'Type',     render: r => r.type?.replace(/_/g,' ') },
    { label:'Status',   render: r => <Badge status={r.status} /> },
    { label:'Tenant',   render: r => r.tenant_name ? (
      <div><p className="font-medium">{r.tenant_name}</p><p className="text-xs text-[--text-muted]">{r.tenant_phone}</p></div>
    ) : <span className="text-[--text-muted]">Vacant</span> },
    { label:'Rent',     render: r => r.tenancy_rent ? fmt(r.tenancy_rent) : '-' },
  ];

  return (
    <AppLayout title="Units - View Only">
      {user?.property_id && (
        <div className="alert-info text-xs mb-4">
          📍 Showing units for your assigned property only. Contact admin to make changes.
        </div>
      )}
      <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)",padding:"1.25rem"}}>
        <Table columns={cols} data={data} loading={isLoading} emptyMsg="No units found" />
        </div>
    </AppLayout>
  );
}
