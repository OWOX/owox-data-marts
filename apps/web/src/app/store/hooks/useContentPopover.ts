import { useContentPopovers } from './useContentPopovers';

export function useContentPopover(popoverId: string) {
  const { activePopoverId, isOpen, open, close, toggle } = useContentPopovers();

  return {
    isOpen: activePopoverId === popoverId && isOpen,
    open: () => {
      open(popoverId);
    },
    close: () => {
      close();
    },
    toggle: () => {
      toggle(popoverId);
    },
  };
}
