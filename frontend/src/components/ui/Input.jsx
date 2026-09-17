export default function Input({ label, required, error, hint, className = '', ...props }) {
  return (
    <div className="form-group">
      {label && (
        <label className="label">
          {label}
          {required && <span style={{ color: 'var(--red)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      <input
        className={`input ${error ? 'input-error' : ''} ${className}`}
        {...props}
      />
      {hint && !error && <p className="hint">{hint}</p>}
      {error && <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{error}</p>}
    </div>
  );
}
