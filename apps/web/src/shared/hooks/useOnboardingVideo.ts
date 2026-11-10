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
  const { open } = useContentPopovers();
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (!shouldShow || hasTriggeredRef.current) return;

    const wasShown = storageService.get(storageKey, 'boolean');

    if (!wasShown) {
      hasTriggeredRef.current = true;
      open(popoverId);
      storageService.set(storageKey, true);
    }
  }, [shouldShow, storageKey, popoverId, open]);
}
