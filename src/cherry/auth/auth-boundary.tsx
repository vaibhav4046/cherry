import { Component, useContext, useEffect, useMemo, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { fail } from '../core/result.ts';
import { authScopeKey } from './auth-provider.ts';
import type { AuthState } from './auth-provider.ts';
import { AuthContext, GUEST_CONTEXT_VALUE } from './auth-context.ts';
import type { AuthContextValue } from './auth-context.ts';
import type { PrivyControls } from './privy-provider.tsx';

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

function readEnv(name: 'VITE_PRIVY_APP_ID' | 'VITE_PRIVY_CLIENT_ID'): string {
  const raw: unknown = import.meta.env[name];
  return typeof raw === 'string' ? raw.trim() : '';
}

interface BridgeProps {
  appId: string;
  clientId?: string;
  onChange: (controls: PrivyControls) => void;
}

/** Catches render-time failures inside the Privy bridge so the app never dies with it. */
class BridgeErrorBoundary extends Component<{ onError: (message: string) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    this.props.onError(error.message || 'Privy crashed while initialising.');
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Identity boundary for the whole app.
 * - No VITE_PRIVY_APP_ID: children render synchronously in guest mode; the
 *   Privy SDK chunk is never requested.
 * - App id present: children still render immediately (status 'authenticating')
 *   while the SDK loads in a lazy chunk; any load or init failure downgrades to
 *   'setup_required' instead of blocking or crashing the app.
 */
export function AuthBoundary({ children }: { children: ReactNode }) {
  const appId = readEnv('VITE_PRIVY_APP_ID');
  const clientId = readEnv('VITE_PRIVY_CLIENT_ID');

  const [Bridge, setBridge] = useState<ComponentType<BridgeProps> | null>(null);
  const [controls, setControls] = useState<PrivyControls | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!appId) return;
    let cancelled = false;
    import('./privy-provider.tsx')
      .then((mod) => {
        if (!cancelled) setBridge(() => mod.default);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [appId]);

  const value = useMemo<AuthContextValue>(() => {
    if (!appId) return GUEST_CONTEXT_VALUE;
    if (loadError !== null) {
      const state: AuthState = { status: 'setup_required', user: null, providerName: 'Privy', error: loadError };
      const refuse = () => Promise.resolve(fail<void>('unsupported', `Privy failed to load: ${loadError}`));
      return {
        state,
        configured: true,
        sendCode: refuse,
        loginWithCode: refuse,
        logout: () => Promise.resolve(),
        authScopeKey: () => authScopeKey(null),
      };
    }
    const state: AuthState = controls?.state ?? { status: 'authenticating', user: null, providerName: 'Privy' };
    const stillLoading = () => Promise.resolve(fail<void>('temporary', 'Privy is still loading. Try again in a moment.'));
    return {
      state,
      configured: true,
      sendCode: controls ? (email) => controls.sendCode(email) : stillLoading,
      loginWithCode: controls ? (email, code) => controls.loginWithCode(email, code) : stillLoading,
      logout: controls ? () => controls.logout() : () => Promise.resolve(),
      authScopeKey: () => authScopeKey(state.user),
    };
  }, [appId, loadError, controls]);

  return (
    <>
      {appId && Bridge !== null && loadError === null ? (
        <BridgeErrorBoundary onError={setLoadError}>
          <Bridge appId={appId} clientId={clientId || undefined} onChange={setControls} />
        </BridgeErrorBoundary>
      ) : null}
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    </>
  );
}
