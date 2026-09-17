// frontend/src/utils/downloadPdf.js
// Use this everywhere instead of inline blob handling.
// Usage: await downloadPdf('/pdf/receipt/42', 'Receipt-RCP-2026-00042.pdf')

import api from '../api';

export async function downloadPdf(endpoint, filename = 'document.pdf') {
  const response = await api.get(endpoint, { responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
  const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);   // always revoke — prevents memory leaks
}