import { useQuery } from '@tanstack/react-query';
import AppLayout from '../../components/layout/AppLayout';
import api, { getOwnerRemittances } from '../../api';
import { fmt, fmtDate } from '../../utils/helpers';

export default function OwnerRemittances() {
  const { data, isLoading } = useQuery({
    queryKey: ['owner-remittances'],
    queryFn: () => getOwnerRemittances().then(r => r.data.remittances)
  });

  return (
    <AppLayout title="Remittance Statements">
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin"/>
        </div>
      ) : (
        <div className="space-y-5 animate-fade-in">
          {!data?.length ? (
            <div className="card card-body text-center py-16">
              <p className="text-4xl mb-3">📊</p>
              <p className="font-medium text-[--text-secondary]">No remittances yet</p>
              <p className="text-sm text-[--text-muted] mt-1">Remittances will appear here once your property manager processes them</p>
            </div>
          ) : (
            <div className="card card-body">
              <h2 className="text-sm font-semibold mb-4">All remittance statements</h2>
              <div className="overflow-x-auto">
                <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Property</th>
                      <th>Gross Revenue</th>
                      <th>Expenses</th>
                      <th>Mgmt Fee</th>
                      <th>Net Remittance</th>
                      <th>Status</th>
                      <th>Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((r, i) => (
                      <tr key={i}>
                        <td className="font-mono font-medium">{r.period}</td>
                        <td>{r.property_name}</td>
                        <td className="text-[--green]">{fmt(r.gross_revenue)}</td>
                        <td className="text-[--red]">{fmt(r.expenses)}</td>
                        <td className="text-[--amber]">{fmt(r.management_fee)}</td>
                        <td className="font-bold text-[--green] text-base">{fmt(r.net_remittance)}</td>
                        <td>
                          <span className={`badge ${r.status === 'paid' ? 'badge-green' : r.status === 'sent' ? 'badge-blue' : 'badge-gray'}`}>
                            {r.status}
                          </span>
                        </td>
                        <td>
                          <button className="text-[--brand] text-xs hover:underline"
                          onClick={() => api.get(`/pdf/remittance/${r.id}`, { responseType:'blob' }).then(res => {
                            const url = URL.createObjectURL(res.data);
                            const a = document.createElement('a');
                            a.href = url; a.download = `Remittance-${r.id}.pdf`; a.click();
                            URL.revokeObjectURL(url);
                          })}>📄 Download</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
}
