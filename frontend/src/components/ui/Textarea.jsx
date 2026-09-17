export default function Textarea({ label, required, rows = 3, ...props }) {
  return (
    <div className="form-group">
      {label && <label className="label">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>}
      <textarea className="input resize-none" rows={rows} {...props} />
    </div>
  );
}
