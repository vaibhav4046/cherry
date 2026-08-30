import { fail } from '../core/result.ts';
import type { Result } from '../core/result.ts';
import type { AuthProvider, AuthState } from './auth-provider.ts';

const GUEST_STATE: AuthState = Object.freeze({
  status: 'guest',
  user: null,
  providerName: 'Guest (local-only)',
});

const NOT_CONFIGURED = 'Privy is not configured. Guest mode is local-only.';

/** Default provider: zero async, zero network, never changes state. */
export class GuestAuthProvider implements AuthProvider {
  getState(): AuthState {
    return GUEST_STATE;
  }

  subscribe(): () => void {
    // Guest state never changes; nothing to notify.
    return () => {};
  }

  sendCode(): Promise<Result<void>> {
    return Promise.resolve(fail('unsupported', NOT_CONFIGURED));
  }

  loginWithCode(): Promise<Result<void>> {
    return Promise.resolve(fail('unsupported', NOT_CONFIGURED));
  }

  logout(): Promise<void> {
    return Promise.resolve();
  }
}
