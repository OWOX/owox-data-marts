import { useRef, useEffect } from 'react';
import { storageService } from '../../services/localstorage.service';
import { useContentPopovers } from '../../app/store/hooks/useContentPopovers';

interface UseOnboardingVideoParams {
  storageKey: string;
  popoverId: string;
  shouldShow: boolean;
}

export function useOnboardingVideo({
  storageKey,
  popoverId,
  shouldShow,
}: UseOnboardingVideoParams) {
  const { open, isOpen } = useContentPopovers();
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (!shouldShow || hasTriggeredRef.current) return;
    // Another popover, such as What's new, stays until it is closed; the video opens after it.
    if (isOpen) return;

    const wasShown = storageService.get(storageKey, 'boolean');

    if (!wasShown) {
      hasTriggeredRef.current = true;
      open(popoverId);
      storageService.set(storageKey, true);
    }
  }, [shouldShow, storageKey, popoverId, open, isOpen]);
}
