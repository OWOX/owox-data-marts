import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFlags } from '../../../../app/store/hooks/useFlags';
import { RequestStatus } from '../../../../shared/types/request-status';
import { fetchReleaseFeed } from '../../api/release-feed';
import { pickReleaseToAnnounce } from '../announcement';
import type { AnnouncedRelease } from '../types';

export const releaseFeedQueryKey = ['whats-new', 'release-feed'] as const;

const RUNNING_VERSION_FLAG = 'APP_OWOX_VERSION';

/**
 * The newest announced release that this app already runs, once both the release feed and the
 * app flags have loaded. `isReady` stays false while either is loading or when the feed is
 * unreachable, for example on a self-hosted install without internet access. A feed that loaded
 * once stays in use if a later refetch fails, so an open card keeps its content.
 */
export function useReleaseToAnnounce(): { release: AnnouncedRelease | null; isReady: boolean } {
  const { flags, callState } = useFlags();
  const flagsSettled = callState === RequestStatus.LOADED || callState === RequestStatus.ERROR;

  const { data: releases } = useQuery({
    queryKey: releaseFeedQueryKey,
    queryFn: fetchReleaseFeed,
    staleTime: 30 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const runningVersion = flags?.[RUNNING_VERSION_FLAG];

  return useMemo(() => {
    if (!releases || !flagsSettled) return { release: null, isReady: false };
    return {
      release: pickReleaseToAnnounce(
        releases,
        typeof runningVersion === 'string' ? runningVersion : null
      ),
      isReady: true,
    };
  }, [releases, flagsSettled, runningVersion]);
}
