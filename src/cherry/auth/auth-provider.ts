import type { Result } from '../core/result.ts';

/**
 * Provider-neutral auth boundary. The rest of Cherry only ever sees these
 * shapes — never a vendor SDK type. Guest mode is the default and is fully
 * functional with zero configuration.
 */
export interface AuthUser {
  id: string;
  email: string | null;
  provider: 'guest' | 'privy';
}

export interface AuthState {
  status: 'guest' | 'authenticating' | 'authenticated' | 'setup_required';
  user: AuthUser | null;
  providerName: string;
  /** Present only when status is 'setup_required': why the provider is unusable. */
  error?: string;
}

export interface AuthProvider {
  getState(): AuthState;
  subscribe(cb: (state: AuthState) => void): () => void;
  sendCode(email: string): Promise<Result<void>>;
  loginWithCode(email: string, code: string): Promise<Result<void>>;
  logout(): Promise<void>;
}

/**
 * Workspace scope key for the current identity. Newly created workspaces can
 * be keyed by this; existing guest data stays local (no migration here).
 */
export function authScopeKey(user: AuthUser | null): string {
  return user && user.provider === 'privy' ? `privy:${user.id}` : 'guest';
}
