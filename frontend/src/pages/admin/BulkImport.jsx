import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../../api';

const TYPES = [
  { id: 'tenants',  label: 'Tenants & Tenancies', icon: '👥', desc: 'Import existing tenants with their unit assignments and rent amounts.' },
];

export default function BulkImport() {
  const [type,     setType]     = useState('tenants');
  const [file,     setFile]     = useState(null);
  const [preview,  setPreview]  = useState(null);
  const [busy,     setBusy]     = useState(false);
  const [phase,    setPhase]    = useState('upload'); // upload | preview | done
  const [result,   setResult]   = useState(null);
  const inputRef = useRef();

  const downloadTemplate = async () => {
    try {
      const r = await api.get(`/import/template?type=${type}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a   = document.createElement('a');
      a.href = url; a.download = `snp_${type}_template.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Could not download template'); }
  };

  const handleFile = async (f) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx'].includes(ext)) return toast.error('Only .csv and .xlsx files are supported');
    if (f.size > 5 * 1024 * 1024)       return toast.error('File must be under 5MB');
    setFile(f);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('type', type);
      const r = await api.post('/import/validate', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPreview(r.data);
      setPhase('preview');
    } catch (e) {
      toast.error(e.response?.data?.error || 'File validation failed');
    } finally { setBusy(false); }
  };

  const commit = async () => {
    if (!preview?.can_commit) return;
    const validRows = preview.rows.filter(r => r.valid);
    setBusy(true);
    try {
      const r = await api.post('/import/commit', { type, rows: validRows });
      setResult(r.data);
      setPhase('done');
      toast.success(r.data.message);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Import failed');
    } finally { setBusy(false); }
  };

  const reset = () => { setFile(null); setPreview(null); setResult(null); setPhase('upload'); };

  return (
    <div style={s.page}>
      <h1 style={s.title}>Bulk Import</h1>
      <p style={s.sub}>Import existing tenants, units, or payment records from a spreadsheet.</p>

      {phase === 'upload' && (
        <>
          {/* Type selector */}
          <div style={s.typeGrid}>
            {TYPES.map(t => (
              <div key={t.id} style={{ ...s.typeCard, ...(type === t.id ? s.typeActive : {}) }} onClick={() => setType(t.id)}>
                <div style={s.typeIcon}>{t.icon}</div>
                <div style={s.typeName}>{t.label}</div>
                <div style={s.typeDesc}>{t.desc}</div>
              </div>
            ))}
          </div>

          {/* Template download */}
          <div style={s.templateRow}>
            <div>
              <div style={s.templateTitle}>Step 1 — Download the template</div>
              <div style={s.templateSub}>Fill in the template and upload it below. Do not rename the column headers.</div>
            </div>
            <button style={s.templateBtn} onClick={downloadTemplate}>⬇ Download Template</button>
          </div>

          {/* Drop zone */}
          <div
            style={{ ...s.dropzone, ...(busy ? s.dropzoneLoading : {}) }}
            onDragOver={e => { e.preventDefault(); }}
            onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
            onClick={() => !busy && inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" accept=".csv,.xlsx" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
            {busy
              ? <><div style={s.spinner} /><p style={s.dropText}>Validating your file…</p></>
              : <>
                  <div style={s.dropIcon}>📂</div>
                  <p style={s.dropTitle}>Drop your .xlsx or .csv file here</p>
                  <p style={s.dropText}>or click to browse · max 500 rows · 5MB</p>
                </>
            }
          </div>
        </>
      )}

      {phase === 'preview' && preview && (
        <>
          {/* Summary bar */}
          <div style={s.summaryBar}>
            <div style={s.sumItem}><span style={s.sumN}>{preview.total}</span><span style={s.sumL}>Total rows</span></div>
            <div style={s.sumItem}><span style={{ ...s.sumN, color: '#34d399' }}>{preview.valid}</span><span style={s.sumL}>Valid</span></div>
            <div style={s.sumItem}><span style={{ ...s.sumN, color: '#f87171' }}>{preview.invalid}</span><span style={s.sumL}>Errors</span></div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
              <button style={s.outlineBtn} onClick={reset}>← Choose different file</button>
              <button style={{ ...s.commitBtn, opacity: (!preview.can_commit || busy) ? 0.6 : 1 }} disabled={!preview.can_commit || busy} onClick={commit}>
                {busy ? 'Importing…' : `Import ${preview.valid} valid row${preview.valid !== 1 ? 's' : ''} →`}
              </button>
            </div>
          </div>

          {/* Row preview table */}
          <div style={s.table}>
            <div style={s.tableHead}>
              <span>Row</span><span>Name</span><span>Phone</span><span>Unit</span><span>Rent</span><span>Status</span>
            </div>
            <div style={s.tableBody}>
              {preview.rows.slice(0, 100).map(row => (
                <div key={row.row} style={{ ...s.tableRow, ...(row.valid ? {} : s.rowError) }}>
                  <span style={s.cell}>{row.row}</span>
                  <span style={s.cell}>{row.data?.full_name || '—'}</span>
                  <span style={s.cell}>{row.data?.phone    || '—'}</span>
                  <span style={s.cell}>{row.data?.unit_number} · {row.data?.property_name}</span>
                  <span style={s.cell}>{row.data?.monthly_rent ? `KES ${Number(row.data.monthly_rent).toLocaleString()}` : '—'}</span>
                  <span style={s.cell}>
                    {row.valid
                      ? row.warnings?.length ? <span style={s.warn}>{row.warnings[0]}</span> : <span style={s.ok}>✓ OK</span>
                      : <span style={s.errText}>{row.errors[0]}</span>}
                  </span>
                </div>
              ))}
              {preview.rows.length > 100 && (
                <div style={{ padding: '10px 16px', fontSize: 12, color: '#6b7280' }}>
                  Showing first 100 rows. All {preview.rows.length} will be imported.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {phase === 'done' && result && (
        <div style={s.doneCard}>
          <div style={s.doneIcon}>🎉</div>
          <h2 style={s.doneTitle}>Import Complete!</h2>
          <div style={s.doneStats}>
            <div style={s.doneStat}><span style={{ color: '#34d399', fontSize: 28, fontWeight: 700 }}>{result.created}</span><br />Tenants created</div>
            <div style={s.doneStat}><span style={{ color: '#6c63ff', fontSize: 28, fontWeight: 700 }}>{result.updated}</span><br />Tenants updated</div>
          </div>
          <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: '1.5rem' }}>
            All tenants have been added with a default password of their last 4 phone digits. They should change it on first login.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button style={s.outlineBtn} onClick={reset}>Import another file</button>
            <button style={s.commitBtn} onClick={() => window.location.href = '/tenants'}>View Tenants →</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type=file] { display: none; }
      `}</style>
    </div>
  );
}

const s = {
  page:          { padding: '1.5rem', maxWidth: 960, margin: '0 auto' },
  title:         { fontSize: 22, fontWeight: 700, color: '#e8eaf0', marginBottom: 4 },
  sub:           { fontSize: 13, color: '#7c8498', marginBottom: '1.5rem' },
  typeGrid:      { display: 'flex', gap: 12, marginBottom: '1.5rem', flexWrap: 'wrap' },
  typeCard:      { border: '1.5px solid #2a2d3a', borderRadius: 10, padding: '1rem 1.25rem', cursor: 'pointer', flex: '1 1 200px', transition: 'all .2s' },
  typeActive:    { borderColor: '#6c63ff', background: '#6c63ff18' },
  typeIcon:      { fontSize: 24, marginBottom: 6 },
  typeName:      { fontSize: 14, fontWeight: 600, color: '#e8eaf0', marginBottom: 4 },
  typeDesc:      { fontSize: 12, color: '#7c8498' },
  templateRow:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1rem', flexWrap: 'wrap', gap: 12 },
  templateTitle: { fontSize: 14, fontWeight: 600, color: '#e8eaf0', marginBottom: 2 },
  templateSub:   { fontSize: 12, color: '#7c8498' },
  templateBtn:   { background: '#20232f', border: '1px solid #2a2d3a', borderRadius: 8, padding: '8px 16px', color: '#6c63ff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  dropzone:      { border: '2px dashed #2a2d3a', borderRadius: 12, padding: '3rem 2rem', textAlign: 'center', cursor: 'pointer', transition: 'all .2s', marginBottom: '1.5rem' },
  dropzoneLoading:{ borderColor: '#6c63ff' },
  dropIcon:      { fontSize: 40, marginBottom: 12 },
  dropTitle:     { fontSize: 15, fontWeight: 600, color: '#e8eaf0', marginBottom: 4 },
  dropText:      { fontSize: 13, color: '#7c8498' },
  spinner:       { width: 32, height: 32, borderRadius: '50%', border: '3px solid #2a2d3a', borderTopColor: '#6c63ff', animation: 'spin .8s linear infinite', margin: '0 auto 12px' },
  summaryBar:    { display: 'flex', alignItems: 'center', gap: '2rem', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1rem', flexWrap: 'wrap' },
  sumItem:       { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 60 },
  sumN:          { fontSize: 22, fontWeight: 700, color: '#e8eaf0' },
  sumL:          { fontSize: 11, color: '#6b7280', marginTop: 2 },
  outlineBtn:    { background: 'none', border: '1px solid #2a2d3a', borderRadius: 8, padding: '8px 16px', color: '#9ca3af', fontSize: 13, cursor: 'pointer' },
  commitBtn:     { background: '#6c63ff', border: 'none', borderRadius: 8, padding: '8px 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  table:         { background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12, overflow: 'hidden' },
  tableHead:     { display: 'grid', gridTemplateColumns: '50px 160px 130px 1fr 120px 1fr', padding: '10px 16px', background: '#20232f', fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', gap: 8 },
  tableBody:     { maxHeight: 480, overflowY: 'auto' },
  tableRow:      { display: 'grid', gridTemplateColumns: '50px 160px 130px 1fr 120px 1fr', padding: '9px 16px', borderTop: '1px solid #2a2d3a', gap: 8, alignItems: 'center' },
  rowError:      { background: '#1f1515' },
  cell:          { fontSize: 12, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  ok:            { color: '#34d399', fontSize: 12, fontWeight: 600 },
  warn:          { color: '#fbbf24', fontSize: 12 },
  errText:       { color: '#f87171', fontSize: 12 },
  doneCard:      { background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 16, padding: '3rem 2rem', textAlign: 'center' },
  doneIcon:      { fontSize: 48, marginBottom: '0.75rem' },
  doneTitle:     { fontSize: 22, fontWeight: 700, color: '#e8eaf0', marginBottom: '1.5rem' },
  doneStats:     { display: 'flex', justifyContent: 'center', gap: '3rem', marginBottom: '1.5rem' },
  doneStat:      { fontSize: 13, color: '#9ca3af', lineHeight: 1.6 },
};
