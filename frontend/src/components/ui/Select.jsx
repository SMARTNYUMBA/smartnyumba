export default function Select({ label, value, onChange, options = [], placeholder, required, hint, error }) {
  return (
    <div className="form-group">
      {label && (
        <label className="label">
          {label}
          {required && <span style={{ color: 'var(--red)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      <select
        className={`input ${error ? 'input-error' : ''}`}
        value={value}
        onChange={e => onChange(e.target.value)}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && !error && <p className="hint">{hint}</p>}
      {error && <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{error}</p>}
    </div>
  );
}
