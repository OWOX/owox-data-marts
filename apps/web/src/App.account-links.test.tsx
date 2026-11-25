import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const mounts = vi.hoisted(() => ({
  auth: vi.fn(),
  bootstrap: vi.fn(),
  analytics: vi.fn(),
  intercom: vi.fn(),
}));
vi.mock('./routes', () => ({ default: [{ path: '*', element: <h1>Route content</h1> }] }));
vi.mock('./features/idp', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => {
    mounts.auth();
    return children;
  },
}));
vi.mock('./app/store', () => ({
  AppStoreProvider: ({ children }: { children: ReactNode }) => children,
  AppBootstrap: ({ children }: { children: ReactNode }) => {
    mounts.bootstrap();
    return children;
  },
}));
vi.mock('./features/project-settings/management/CloudProjectCreationProvider', () => ({
  CloudProjectCreationProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./app/gtm/GoogleTagManager.tsx', () => ({
  GoogleTagManager: () => {
    mounts.analytics();
    return null;
  },
}));
vi.mock('./app/intercom/IntercomChat', () => ({
  IntercomChat: () => {
    mounts.intercom();
    return null;
  },
}));
vi.mock('./components/ContentPopovers', () => ({ ContentPopovers: () => null }));

afterEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
});

describe('Public account link bootstrap', () => {
  it.each([
    '/subscriptions',
    '/subscriptions/',
    '/Subscriptions',
    '/subscriptions//',
    '/%73ubscriptions',
    '/download-account-data',
    '/download-account-data/',
    '/DOWNLOAD-ACCOUNT-DATA//',
    '/ui/p/subscriptions',
    '/ui/p/download-account-data',
    '/UI/P/Subscriptions//',
    '/ui/p/%73ubscriptions',
  ])('opens %s without session bootstrap or telemetry', path => {
    window.history.replaceState({}, '', `${path}?email=anna%40example.test&hash=private-proof`);
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Route content' })).toBeVisible();
    expect(mounts.auth).not.toHaveBeenCalled();
    expect(mounts.bootstrap).not.toHaveBeenCalled();
    expect(mounts.analytics).not.toHaveBeenCalled();
    expect(mounts.intercom).not.toHaveBeenCalled();
  });

  it.each(['/subscriptions-extra', '/ui/project-a/subscriptions', '/ui/me/profile'])(
    'keeps the normal session bootstrap for %s',
    path => {
      window.history.replaceState({}, '', path);
      render(<App />);
      expect(mounts.auth).toHaveBeenCalledOnce();
      expect(mounts.bootstrap).toHaveBeenCalledOnce();
      expect(mounts.analytics).toHaveBeenCalledOnce();
    }
  );
});
