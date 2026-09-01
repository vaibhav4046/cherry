import { createContext } from 'react';
import type { Result } from '../core/result.ts';
import { authScopeKey } from './auth-provider.ts';
import type { AuthState } from './auth-provider.ts';
import { GuestAuthProvider } from './guest-provider.ts';

export interface AuthContextValue {
  state: AuthState;
  /** True only when VITE_PRIVY_APP_ID is set at build time. */
  configured: boolean;
  /**
   * Loads the auth SDK on demand. Guests never pay for auth: the SDK chunk is
   * requested only when a screen that offers sign-in calls this (or when a
   * stored session means the user is already signed in). No-op in guest builds.
   */
  activate?(): void;
  sendCode(email: string): Promise<Result<void>>;
  loginWithCode(email: string, code: string): Promise<Result<void>>;
  logout(): Promise<void>;
  authScopeKey(): string;
}

const guest = new GuestAuthProvider();

/**
 * Default value doubles as the guest-mode value: components read a coherent
 * guest state even outside an AuthBoundary, matching Cherry's local-first
 * default.
 */
export const GUEST_CONTEXT_VALUE: AuthContextValue = {
  state: guest.getState(),
  configured: false,
  sendCode: () => guest.sendCode(),
  loginWithCode: () => guest.loginWithCode(),
  logout: () => guest.logout(),
  authScopeKey: () => authScopeKey(null),
};

export const AuthContext = createContext<AuthContextValue>(GUEST_CONTEXT_VALUE);
