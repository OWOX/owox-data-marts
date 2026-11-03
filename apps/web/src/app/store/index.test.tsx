import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppBootstrap, AppStoreProvider } from './index';
import { AuthContext } from '../../features/idp/context/AuthContext.types';
import { AuthStatus } from '../../features/idp/types';

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('AppBootstrap auth errors', () => {
  it('keeps the existing loader outside connect routes', () => {
    window.history.replaceState({}, '', '/ui/project-a/data-marts');
    render(
      <AuthContext.Provider
        value={{
          status: AuthStatus.ERROR,
          user: null,
          session: null,
          error: 'The session failed',
          signIn: vi.fn(),
          signOut: vi.fn(),
          refreshToken: vi.fn(),
          clearError: vi.fn(),
        }}
      >
        <AppStoreProvider>
          <AppBootstrap>
            <div>Protected content</div>
          </AppBootstrap>
        </AppStoreProvider>
      </AuthContext.Provider>
    );

    expect(screen.getByText('Loading application...')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });
});
