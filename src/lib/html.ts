/** Escape text for use inside HTML built as a string (labels, cursor cards, map pins). */
export const escapeHtml = (t: string) => t.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
