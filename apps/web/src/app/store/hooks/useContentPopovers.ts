import { useAppDispatch, useAppSelector } from '../core/store-hooks';
import { openPopover, closePopover, togglePopover } from '../reducers/content-popovers.reducer';

export function useContentPopovers() {
  const dispatch = useAppDispatch();
  const state = useAppSelector(s => s.contentPopovers);

  return {
    activePopoverId: state.activePopoverId,
    isOpen: state.isOpen,

    open: (id: string) => {
      dispatch(openPopover(id));
    },
    close: () => {
      if (state.activePopoverId) {
        dispatch(closePopover(state.activePopoverId));
      }
    },
    toggle: (id: string) => {
      dispatch(togglePopover(id));
    },
  };
}
