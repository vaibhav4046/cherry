import { useEffect, useRef } from 'react';
import { PrivyProvider, useLoginWithEmail, usePrivy } from '@privy-io/react-auth';
import { ok, toFailure } from '../core/result.ts';
import type { Result } from '../core/result.ts';
import type { AuthState } from './auth-provider.ts';

/**
 * Privy adapter. This module statically imports the Privy SDK, so it must only
 * ever be reached via dynamic import() from the AuthBoundary — that keeps the
 * SDK out of the guest-mode entry bundle. Client-side code needs the public
 * app id (and optional client id) only — the server-side Privy secret has no
 * place in a browser bundle and is never read here.
 */
export interface PrivyControls {
  state: AuthState;
  sendCode(email: string): Promise<Result<void>>;
  loginWithCode(email: string, code: string): Promise<Result<void>>;
  logout(): Promise<void>;
}

interface BridgeProps {
  appId: string;
  clientId?: string;
  onChange: (controls: PrivyControls) => void;
}

interface PrivyActions {
  sendCode: (input: { email: string }) => Promise<void>;
  loginWithCode: (input: { code: string }) => Promise<void>;
  logout: () => Promise<void>;
}

function StateReporter({ onChange }: { onChange: (controls: PrivyControls) => void }) {
  const { ready, authenticated, user, logout } = usePrivy();
  const { sendCode, loginWithCode } = useLoginWithEmail();

  // Latest SDK functions live in a ref so the reported action wrappers stay
  // stable and never force a re-render loop through onChange.
  const fnsRef = useRef<PrivyActions>({ sendCode, loginWithCode, logout });
  useEffect(() => {
    fnsRef.current = { sendCode, loginWithCode, logout };
  });

  const email = user?.email?.address ?? null;
  const userId = user?.id ?? null;

  useEffect(() => {
    const state: AuthState = !ready
      ? { status: 'authenticating', user: null, providerName: 'Privy' }
      : authenticated && userId !== null
        ? { status: 'authenticated', user: { id: userId, email, provider: 'privy' }, providerName: 'Privy' }
        : { status: 'guest', user: null, providerName: 'Privy' };
    onChange({
      state,
      sendCode: async (address: string) => {
        try {
          await fnsRef.current.sendCode({ email: address });
          return ok(undefined);
        } catch (error: unknown) {
          return { ok: false, error: toFailure(error, 'temporary') };
        }
      },
      loginWithCode: async (_address: string, code: string) => {
        try {
          await fnsRef.current.loginWithCode({ code });
          return ok(undefined);
        } catch (error: unknown) {
          return { ok: false, error: toFailure(error, 'validation') };
        }
      },
      logout: async () => {
        await fnsRef.current.logout();
      },
    });
  }, [ready, authenticated, userId, email, onChange]);

  return null;
}

/**
 * Mounted as a sibling of the app tree (never wrapping it), so a Privy failure
 * can only take down this bridge — the AuthBoundary's error boundary catches it
 * and downgrades to 'setup_required' while the app keeps rendering.
 */
export default function PrivyAuthBridge({ appId, clientId, onChange }: BridgeProps) {
  return (
    <PrivyProvider appId={appId} clientId={clientId} config={{ loginMethods: ['email'], appearance: { walletList: [] } }}>
      <StateReporter onChange={onChange} />
    </PrivyProvider>
  );
}
