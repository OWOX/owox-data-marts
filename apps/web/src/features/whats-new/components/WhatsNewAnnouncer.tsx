import { useEffect, useRef } from 'react';
import { useContentPopovers } from '../../../app/store/hooks/useContentPopovers';
import { useSetupProgress } from '../../../components/AppSidebar/SetupChecklist/useSetupProgress';
import { ProgressKey } from '../../../components/AppSidebar/SetupChecklist/types';
import { useUser } from '../../idp/hooks/useAuthState';
import { isViewOnlySession } from '../../idp/services/auth.service';
import { decideAnnouncement } from '../model/announcement';
import { WHATS_NEW_POPOVER_ID } from '../model/constants';
import { useReleaseToAnnounce } from '../model/hooks/useReleaseToAnnounce';
import { lastSeenRelease } from '../model/last-seen-release';
import { trackWhatsNewEvent } from '../model/whats-new.analytics';

/**
 * Opens the What's new popover once per release, on the first app load after the release video
 * is published. It stays closed in view-only sessions and never replaces a popover that is
 * already open; that load is skipped and the next one tries again.
 */
export function WhatsNewAnnouncer() {
  const user = useUser();
  const { release, isReady } = useReleaseToAnnounce();
  const { progress, isLoading: isSetupProgressLoading } = useSetupProgress();
  const { isOpen: isAnotherPopoverOpen, open } = useContentPopovers();
  const handled = useRef(false);

  const hasUsedProduct =
    progress[ProgressKey.HAS_DRAFT_DATA_MART].done ||
    progress[ProgressKey.HAS_PUBLISHED_DATA_MART].done;

  useEffect(() => {
    if (handled.current || !user || isViewOnlySession(user)) return;
    if (!isReady || isSetupProgressLoading) return;
    handled.current = true;
    if (!release || isAnotherPopoverOpen) return;

    const decision = decideAnnouncement({
      releaseVersion: release.version,
      lastSeenVersion: lastSeenRelease.get(user.id),
      hasUsedProduct,
    });
    if (decision === 'none') return;

    lastSeenRelease.set(user.id, release.version);
    if (decision === 'show') {
      open(WHATS_NEW_POPOVER_ID);
      trackWhatsNewEvent('whats_new_shown', release.version);
    }
  }, [user, release, isReady, isSetupProgressLoading, isAnotherPopoverOpen, hasUsedProduct, open]);

  return null;
}
