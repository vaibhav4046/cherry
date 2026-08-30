import { describe, expect, it } from 'vitest';
import { authScopeKey } from '../../src/cherry/auth/auth-provider.ts';
import type { AuthProvider, AuthState } from '../../src/cherry/auth/auth-provider.ts';
import { GuestAuthProvider } from '../../src/cherry/auth/guest-provider.ts';
import { fail, ok } from '../../src/cherry/core/result.ts';
import type { Result } from '../../src/cherry/core/result.ts';

/** In-memory provider exercising the full AuthProvider contract without any SDK. */
class MockAuthProvider implements AuthProvider {
  private state: AuthState = { status: 'guest', user: null, providerName: 'Mock' };
  private pendingEmail: string | null = null;
  private listeners = new Set<(state: AuthState) => void>();

  getState(): AuthState {
    return this.state;
  }

  subscribe(cb: (state: AuthState) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private setState(state: AuthState): void {
    this.state = state;
    for (const cb of this.listeners) cb(state);
  }

  sendCode(email: string): Promise<Result<void>> {
    this.pendingEmail = email;
    return Promise.resolve(ok(undefined));
  }

  loginWithCode(email: string, code: string): Promise<Result<void>> {
    if (this.pendingEmail !== email) return Promise.resolve(fail('validation', 'No code was sent to that email.'));
    if (code !== '123456') return Promise.resolve(fail('validation', 'Wrong code.'));
    this.setState({
      status: 'authenticated',
      user: { id: 'did:privy:mock-1', email, provider: 'privy' },
      providerName: 'Mock',
    });
    return Promise.resolve(ok(undefined));
  }

  logout(): Promise<void> {
    this.pendingEmail = null;
    this.setState({ status: 'guest', user: null, providerName: 'Mock' });
    return Promise.resolve();
  }
}

describe('GuestAuthProvider', () => {
  it('defaults to guest state with no user', () => {
    const provider = new GuestAuthProvider();
    const state = provider.getState();
    expect(state.status).toBe('guest');
    expect(state.user).toBeNull();
  });

  it('refuses login attempts with the not-configured message', async () => {
    const provider = new GuestAuthProvider();
    const sent = await provider.sendCode();
    const logged = await provider.loginWithCode();
    for (const result of [sent, logged]) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('Privy is not configured. Guest mode is local-only.');
      }
    }
  });

  it('logout is a no-op and state stays guest', async () => {
    const provider = new GuestAuthProvider();
    await provider.logout();
    expect(provider.getState().status).toBe('guest');
  });
});

describe('MockAuthProvider walk-through', () => {
  it('sendCode then loginWithCode authenticates, logout returns to guest', async () => {
    const provider = new MockAuthProvider();
    const seen: AuthState[] = [];
    const unsubscribe = provider.subscribe((state) => seen.push(state));

    expect(provider.getState().status).toBe('guest');

    const sent = await provider.sendCode('user@example.com');
    expect(sent.ok).toBe(true);

    const wrong = await provider.loginWithCode('user@example.com', '000000');
    expect(wrong.ok).toBe(false);
    expect(provider.getState().status).toBe('guest');

    const right = await provider.loginWithCode('user@example.com', '123456');
    expect(right.ok).toBe(true);
    const authed = provider.getState();
    expect(authed.status).toBe('authenticated');
    expect(authed.user).toEqual({ id: 'did:privy:mock-1', email: 'user@example.com', provider: 'privy' });
    expect(authScopeKey(authed.user)).toBe('privy:did:privy:mock-1');

    await provider.logout();
    expect(provider.getState().status).toBe('guest');
    expect(provider.getState().user).toBeNull();
    expect(authScopeKey(provider.getState().user)).toBe('guest');

    expect(seen.map((state) => state.status)).toEqual(['authenticated', 'guest']);
    unsubscribe();
  });
});

describe('authScopeKey', () => {
  it('is guest for null and guest users, privy:<id> for privy users', () => {
    expect(authScopeKey(null)).toBe('guest');
    expect(authScopeKey({ id: 'x', email: null, provider: 'guest' })).toBe('guest');
    expect(authScopeKey({ id: 'abc', email: 'a@b.c', provider: 'privy' })).toBe('privy:abc');
  });
});
