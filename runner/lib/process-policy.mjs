/**
 * Child processes receive only operating-system/runtime plumbing. Runner
 * pairing tokens, API keys, arbitrary ambient variables, and interpreter
 * injection hooks are deliberately absent.
 */
const SAFE_ENV_KEYS = new Set([
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'TEMP',
  'TMP',
  'TMPDIR',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMDATA',
  'USERNAME',
  'USER',
  'LOGNAME',
  'LANG',
  'LANGUAGE',
  'TERM',
  'COLORTERM',
  'NO_COLOR',
  'FORCE_COLOR',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
  'REQUESTS_CA_BUNDLE',
  'CURL_CA_BUNDLE',
]);

export function buildChildEnv(source = process.env) {
  const childEnv = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    if (typeof value !== 'string') continue;
    const normalized = key.toUpperCase();
    if (SAFE_ENV_KEYS.has(normalized) || normalized.startsWith('LC_')) childEnv[key] = value;
  }
  return childEnv;
}

/** Python is reserved for the fixed scraper/worker.py capability. */
export function isPythonExecutable(executable) {
  if (typeof executable !== 'string') return false;
  const name = executable.split(/[\\/]/).pop()?.toLowerCase() ?? '';
  return /^(?:pythonw?(?:\d+(?:\.\d+)*)?|py)(?:\.exe)?$/.test(name);
}
