// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestStatus } from '../../shared/types/request-status';
import { GoogleTagManager } from './GoogleTagManager';

vi.mock('../store/hooks', () => ({
  useFlags: vi.fn(),
}));

vi.mock('../../features/idp', () => ({
  useAuth: vi.fn(),
  isViewOnlySession: (user: { viewOnly?: boolean } | null | undefined) => user?.viewOnly === true,
}));

const { useFlags } = await import('../store/hooks');
const { useAuth } = await import('../../features/idp');

describe('GoogleTagManager', () => {
  beforeEach(() => {
    cleanup();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('does nothing when flags are not loaded', () => {
    vi.mocked(useFlags).mockReturnValue({ flags: null, callState: RequestStatus.LOADING } as never);
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u', projectId: 'p' } } as never);

    render(<GoogleTagManager />);

    expect(document.getElementById('gtm-script')).toBeNull();
    expect(document.getElementById('gtm-noscript')).toBeNull();
  });

  it('does not install GTM for view-only sessions', () => {
    vi.mocked(useFlags).mockReturnValue({
      flags: { GOOGLE_TAG_MANAGER_CONTAINER_ID: 'GTM-TEST123' },
      callState: RequestStatus.LOADED,
    } as never);
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u', projectId: 'p', viewOnly: true },
    } as never);

    render(<GoogleTagManager />);

    expect(document.getElementById('gtm-script')).toBeNull();
    expect(document.getElementById('gtm-noscript')).toBeNull();
  });

  it('installs GTM when container id is set and session is not view-only', () => {
    vi.mocked(useFlags).mockReturnValue({
      flags: { GOOGLE_TAG_MANAGER_CONTAINER_ID: 'GTM-TEST123' },
      callState: RequestStatus.LOADED,
    } as never);
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u', projectId: 'p' },
    } as never);

    render(<GoogleTagManager />);

    expect(document.getElementById('gtm-script')).not.toBeNull();
    expect(document.getElementById('gtm-noscript')).not.toBeNull();
    expect(document.getElementById('gtm-script')?.innerHTML).toContain('GTM-TEST123');
  });

  it('does nothing when container id flag is empty', () => {
    vi.mocked(useFlags).mockReturnValue({
      flags: { GOOGLE_TAG_MANAGER_CONTAINER_ID: '  ' },
      callState: RequestStatus.LOADED,
    } as never);
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u', projectId: 'p' },
    } as never);

    render(<GoogleTagManager />);

    expect(document.getElementById('gtm-script')).toBeNull();
  });
});
