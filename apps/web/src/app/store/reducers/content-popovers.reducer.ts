import type { AnyAction } from '../types';

export interface ContentPopoversState {
  activePopoverId: string | null;
  isOpen: boolean;
}

export const contentPopoversInitialState: ContentPopoversState = {
  activePopoverId: null,
  isOpen: false,
};

export const OPEN_POPOVER = 'contentPopovers/OPEN_POPOVER';
export const CLOSE_POPOVER = 'contentPopovers/CLOSE_POPOVER';
export const TOGGLE_POPOVER = 'contentPopovers/TOGGLE_POPOVER';

export function openPopover(id: string) {
  return { type: OPEN_POPOVER, payload: id } satisfies AnyAction;
}

export function closePopover(id: string) {
  return { type: CLOSE_POPOVER, payload: id } satisfies AnyAction;
}

export function togglePopover(id: string) {
  return { type: TOGGLE_POPOVER, payload: id } satisfies AnyAction;
}

export function contentPopoversReducer(
  state: ContentPopoversState = contentPopoversInitialState,
  action: AnyAction
): ContentPopoversState {
  switch (action.type) {
    case OPEN_POPOVER: {
      const id = action.payload as string;
      return {
        activePopoverId: id,
        isOpen: true,
      };
    }

    case CLOSE_POPOVER: {
      const id = action.payload as string;
      if (state.activePopoverId !== id) return state;

      return {
        activePopoverId: null,
        isOpen: false,
      };
    }

    case TOGGLE_POPOVER: {
      const id = action.payload as string;

      if (state.activePopoverId !== id) {
        return {
          activePopoverId: id,
          isOpen: true,
        };
      }

      return {
        activePopoverId: id,
        isOpen: !state.isOpen,
      };
    }

    default:
      return state;
  }
}
