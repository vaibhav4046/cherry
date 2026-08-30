/** Secret-shaped strings are redacted from any captured output. */
export function redact(text) {
  return String(text)
    .replace(/(sk|pk|rk|ghp|gho|xoxb|xoxp)-[A-Za-z0-9_-]{10,}/g, '[redacted]')
    .replace(/(bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, '$1[redacted]')
    .replace(/(api[_-]?key["'\s:=]+)[A-Za-z0-9_-]{12,}/gi, '$1[redacted]');
}
