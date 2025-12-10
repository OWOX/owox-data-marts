import { useMemo } from 'react';
import { useFlags } from '../../../app/store/hooks';
import { checkVisible } from '../../../utils/check-visible';
import type { HelpMenuItem } from './types';

export function useHelpMenu(items: HelpMenuItem[]) {
  const { flags } = useFlags();

  const visibleItems = useMemo(() => {
    return items.filter(item => {
      if (item.type === 'separator' || item.type === 'submenu') {
        return true;
      }

      if (typeof item.visible === 'boolean') {
        return item.visible;
      }

      return checkVisible(item.visible.flagKey, item.visible.expectedValue, flags);
    });
  }, [items, flags]);

  return { visibleItems };
}
