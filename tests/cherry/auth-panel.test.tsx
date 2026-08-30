import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthBoundary, useAuth } from '../../src/cherry/auth/auth-boundary.tsx';
import { AuthContext } from '../../src/cherry/auth/auth-context.ts';
import type { AuthContextValue } from '../../src/cherry/auth/auth-context.ts';
import { AccountPanel } from '../../src/components/AccountPanel.tsx';
import { ok } from '../../src/cherry/core/result.ts';

// No VITE_PRIVY_APP_ID is set in CI, so the boundary must stay in guest mode
// and never touch the Privy SDK (which is only ever loaded via dynamic import).

afterEach(() => {
  cleanup();
});

function Probe() {
  const { state, configured, authScopeKey } = useAuth();
  return (
    <p>
      probe:{state.status}:{configured ? 'configured' : 'unconfigured'}:{authScopeKey()}
    </p>
  );
}

function configuredValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    state: { status: 'guest', user: null, providerName: 'Privy' },
    configured: true,
    sendCode: vi.fn(async () => ok(undefined)),
    loginWithCode: vi.fn(async () => ok(undefined)),
    logout: vi.fn(async () => {}),
    authScopeKey: () => 'guest',
    ...overrides,
  };
}

describe('AuthBoundary without VITE_PRIVY_APP_ID', () => {
  it('renders children immediately in guest state', () => {
    render(
      <AuthBoundary>
        <Probe />
      </AuthBoundary>,
    );
    expect(screen.getByText('probe:guest:unconfigured:guest')).toBeTruthy();
  });
});

describe('AccountPanel unconfigured', () => {
  it('renders the guest copy and setup pointer, with no sign-in form', () => {
    render(
      <AuthBoundary>
        <AccountPanel />
      </AuthBoundary>,
    );
    expect(
      screen.getByText("Guest mode — local only. Your work lives in this browser's IndexedDB."),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'docs/PRIVY_SETUP.md' })).toBeTruthy();
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.queryByText(/Signed in/)).toBeNull();
  });
});

describe('AccountPanel with a configured provider', () => {
  it('walks email -> code form and never claims signed-in while guest', async () => {
    const user = userEvent.setup();
    const value = configuredValue();
    render(
      <AuthContext.Provider value={value}>
        <AccountPanel />
      </AuthContext.Provider>,
    );

    expect(screen.queryByText(/Signed in/)).toBeNull();
    const emailInput = screen.getByLabelText('Email');
    await user.type(emailInput, 'user@example.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    expect(value.sendCode).toHaveBeenCalledWith('user@example.com');
    expect(screen.getByLabelText('6-digit code')).toBeTruthy();

    await user.type(screen.getByLabelText('6-digit code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(value.loginWithCode).toHaveBeenCalledWith('user@example.com', '123456');
  });

  it('shows a signed-in view with email, provider, honest scoping note, and sign out', async () => {
    const user = userEvent.setup();
    const value = configuredValue({
      state: {
        status: 'authenticated',
        user: { id: 'did:privy:1', email: 'user@example.com', provider: 'privy' },
        providerName: 'Privy',
      },
      authScopeKey: () => 'privy:did:privy:1',
    });
    render(
      <AuthContext.Provider value={value}>
        <AccountPanel />
      </AuthContext.Provider>,
    );

    expect(screen.getByText('Signed in · Privy')).toBeTruthy();
    expect(screen.getByText('user@example.com')).toBeTruthy();
    expect(
      screen.getByText(/applies to newly created workspaces; existing guest work/),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(value.logout).toHaveBeenCalledTimes(1);
  });

  it('surfaces setup_required with the error message instead of crashing', () => {
    const value = configuredValue({
      state: { status: 'setup_required', user: null, providerName: 'Privy', error: 'chunk failed to load' },
    });
    render(
      <AuthContext.Provider value={value}>
        <AccountPanel />
      </AuthContext.Provider>,
    );
    expect(screen.getByText('chunk failed to load')).toBeTruthy();
    expect(screen.queryByText(/Signed in/)).toBeNull();
  });
});
