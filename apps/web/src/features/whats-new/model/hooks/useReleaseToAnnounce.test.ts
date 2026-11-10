// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestStatus } from '../../../../shared/types/request-status';
import type { AnnouncedRelease } from '../types';

vi.mock('../../../../app/store/hooks/useFlags', () => ({ useFlags: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQuery: vi.fn() }));

const { useFlags } = await import('../../../../app/store/hooks/useFlags');
const { useQuery } = await import('@tanstack/react-query');
const { useReleaseToAnnounce } = await import('./useReleaseToAnnounce');

const release = (version: string): AnnouncedRelease => ({
  version,
  releasedAt: '2026-11-02T14:23:04.000Z',
  videoUrl: `https://customer-x.cloudflarestream.com/${version.replace(/\./g, '')}/iframe`,
  chapters: [],
  changes: [],
});
const FEED = [release('0.43.0'), release('0.41.0')];

function setup(callState: RequestStatus, flags: Record<string, unknown> | null) {
  vi.mocked(useFlags).mockReturnValue({ flags, callState });
  vi.mocked(useQuery).mockReturnValue({ data: FEED } as ReturnType<typeof useQuery>);
}

describe('useReleaseToAnnounce', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('picks the newest release the running version contains', () => {
    setup(RequestStatus.LOADED, { APP_OWOX_VERSION: '0.42.1' });
    const { result } = renderHook(() => useReleaseToAnnounce());

    expect(result.current).toEqual({ release: FEED[1], isReady: true });
  });

  it('is not ready while the flags load', () => {
    setup(RequestStatus.LOADING, null);
    const { result } = renderHook(() => useReleaseToAnnounce());

    expect(result.current).toEqual({ release: null, isReady: false });
  });

  it('announces nothing when the flags failed, so no newer release slips through', () => {
    setup(RequestStatus.ERROR, null);
    const { result } = renderHook(() => useReleaseToAnnounce());

    expect(result.current).toEqual({ release: null, isReady: false });
  });
});
