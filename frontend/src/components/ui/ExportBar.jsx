const DownloadIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 13, height: 13 }}>
    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/>
  </svg>
);
const PrintIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 13, height: 13 }}>
    <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a1 1 0 001 1h6a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9h8v2H6v-2zm9-4a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd"/>
  </svg>
);

export default function ExportBar({ onPrint, onCsv, onExcel }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {onCsv && (
        <button onClick={onCsv} className="btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <DownloadIcon /> CSV
        </button>
      )}
      {onExcel && (
        <button onClick={onExcel} className="btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <DownloadIcon /> Excel
        </button>
      )}
      {onPrint && (
        <button onClick={onPrint} className="btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <PrintIcon /> Print
        </button>
      )}
    </div>
  );
}

export function exportToCsv(data, filename) {
  if (!data?.length) return;
  const keys = Object.keys(data[0]);
  const csv = [keys.join(','), ...data.map(row =>
    keys.map(k => `"${String(row[k] ?? '').replace(/"/g, '""')}"`).join(',')
  )].join('\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: `${filename}.csv`,
  });
  a.click(); URL.revokeObjectURL(a.href);
}

export function exportToExcel(data, filename) {
  if (!data?.length) return;
  const keys = Object.keys(data[0]);
  const tsv = [keys.join('\t'), ...data.map(row =>
    keys.map(k => String(row[k] ?? '').replace(/\t/g, ' ')).join('\t')
  )].join('\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([tsv], { type: 'application/vnd.ms-excel;charset=utf-8' })),
    download: `${filename}.xls`,
  });
  a.click(); URL.revokeObjectURL(a.href);
}

export function printSection(elementId, title) {
  const content = document.getElementById(elementId)?.innerHTML;
  if (!content) return window.print();
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>${title || 'Report'}</title>
    <style>body{font-family:Outfit,sans-serif;font-size:13px;padding:24px}
    table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border:1px solid #e8e6e0;text-align:left}
    th{background:#fafaf8;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.06em}
    @media print{button{display:none}}</style>
    </head><body><h2 style="font-family:Georgia,serif;font-style:italic">${title || ''}</h2>${content}</body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); w.close(); }, 300);
}
