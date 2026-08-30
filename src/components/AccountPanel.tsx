import { useState, type FormEvent } from 'react';
import { useAuth } from '../cherry/auth/auth-boundary.tsx';

const SETUP_DOC_URL = 'https://github.com/vaibhav4046/cherry/blob/main/docs/PRIVY_SETUP.md';

/**
 * Account card for the Connections page. Guest mode is the default and stays
 * fully functional; the sign-in form only appears when Privy is configured,
 * and "signed in" is only ever shown for a truly authenticated session.
 */
export function AccountPanel() {
  const { state, configured, sendCode, loginWithCode, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const result = await sendCode(email.trim());
    setBusy(false);
    if (result.ok) {
      setCodeSent(true);
      setCode('');
    } else {
      setError(result.error.message);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const result = await loginWithCode(email.trim(), code.trim());
    setBusy(false);
    if (!result.ok) setError(result.error.message);
  }

  async function handleLogout() {
    setError(null);
    setCodeSent(false);
    setEmail('');
    setCode('');
    await logout();
  }

  return (
    <section className="card stack" aria-labelledby="account-heading">
      <h2 id="account-heading" className="subhead">Account</h2>
      {error !== null ? <p className="field-error" role="alert">{error}</p> : null}

      {!configured ? (
        <>
          <p className="sticker sticker-wait">Guest mode — local only</p>
          <p style={{ fontSize: 14 }}>
            Guest mode — local only. Your work lives in this browser's IndexedDB.
          </p>
          <p style={{ fontSize: 14 }}>
            Optional sign-in via Privy: create an app at dashboard.privy.io, allow this origin, and set{' '}
            <code className="mono">VITE_PRIVY_APP_ID</code> at build time. Full steps:{' '}
            <a href={SETUP_DOC_URL} target="_blank" rel="noopener noreferrer">docs/PRIVY_SETUP.md</a>.
          </p>
        </>
      ) : state.status === 'setup_required' ? (
        <>
          <p className="sticker sticker-wait">Privy unavailable — guest mode active</p>
          <p className="field-error">{state.error ?? 'Privy failed to load.'}</p>
          <p style={{ fontSize: 14 }}>
            Everything keeps working locally. Check the configuration against{' '}
            <a href={SETUP_DOC_URL} target="_blank" rel="noopener noreferrer">docs/PRIVY_SETUP.md</a>.
          </p>
        </>
      ) : state.status === 'authenticating' ? (
        <p className="sticker sticker-wait">Connecting to Privy…</p>
      ) : state.status === 'authenticated' && state.user !== null ? (
        <>
          <p className="sticker sticker-pass">Signed in · {state.providerName}</p>
          <p className="mono">{state.user.email ?? state.user.id}</p>
          <p style={{ fontSize: 14 }}>
            Workspace scoping to your account applies to newly created workspaces; existing guest work
            stays local until you export/import it.
          </p>
          <button type="button" className="btn btn-sm" onClick={() => void handleLogout()}>
            Sign out
          </button>
        </>
      ) : !codeSent ? (
        <form onSubmit={handleSendCode} className="stack">
          <p style={{ fontSize: 14, margin: 0 }}>
            Sign in with your email. Your local work is untouched either way.
          </p>
          <label className="label" htmlFor="account-email">Email</label>
          <input
            id="account-email"
            className="input"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button type="submit" className="btn" disabled={busy} style={{ alignSelf: 'flex-start' }}>
            {busy ? 'Sending…' : 'Send code'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleLogin} className="stack">
          <p style={{ fontSize: 14, margin: 0 }}>
            Enter the 6-digit code sent to <span className="mono">{email.trim()}</span>.
          </p>
          <label className="label" htmlFor="account-code">6-digit code</label>
          <input
            id="account-code"
            className="input"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <div className="row">
            <button type="submit" className="btn" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => { setCodeSent(false); setError(null); }}>
              Use a different email
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
