import { useState } from 'react';
import { storageService } from '../../../services';

const STORAGE_KEY = 'setup_checklist_show';

export interface SetupChecklistVisibility {
  isVisible: boolean;
  show: () => void;
  hide: () => void;
}

export function useSetupChecklistVisibility(): SetupChecklistVisibility {
  const [isVisible, setIsVisible] = useState<boolean>(() => {
    return storageService.get(STORAGE_KEY, 'boolean') ?? true;
  });

  const show = () => {
    storageService.set(STORAGE_KEY, true);
    setIsVisible(true);
  };

  const hide = () => {
    storageService.set(STORAGE_KEY, false);
    setIsVisible(false);
  };

  return { isVisible, show, hide };
}
