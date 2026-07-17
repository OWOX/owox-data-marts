import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import toast from 'react-hot-toast';
import { showApiErrorToast } from './showApiErrorToast';

vi.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: vi.fn(), dismiss: vi.fn() },
}));

const mockedToastError = vi.mocked(toast.error);
const mockedToastDismiss = vi.mocked(toast.dismiss);

/** Builds an axios-like error carrying the given response body. */
function axiosError(data: unknown) {
  return { response: { data } };
}

interface DismissButtonProps {
  'aria-label': string;
  onClick: () => void;
}
interface ToastBodyProps {
  children: [ReactNode, ReactElement<DismissButtonProps>];
}

/** Renders the persistent-toast function renderer and returns the root element. */
function renderPersistentToast(toastId = 'toast-1'): ReactElement<ToastBodyProps> {
  const renderer = mockedToastError.mock.calls[0][0] as (t: {
    id: string;
  }) => ReactElement<ToastBodyProps>;
  return renderer({ id: toastId });
}

describe('showApiErrorToast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the server message when present', () => {
    showApiErrorToast(axiosError({ message: 'Server says no' }));
    expect(mockedToastError).toHaveBeenCalledWith('Server says no');
  });

  it('falls back when the error has no response body', () => {
    expect(() => {
      showApiErrorToast({});
    }).not.toThrow();
    expect(mockedToastError).toHaveBeenCalledWith('Something went wrong');
  });

  it('falls back when the server message is empty or whitespace', () => {
    showApiErrorToast(axiosError({ message: '   ' }), 'Custom fallback');
    expect(mockedToastError).toHaveBeenCalledWith('Custom fallback');
  });

  it('appends error details when present', () => {
    showApiErrorToast(axiosError({ message: 'Denied', errorDetails: { error: 'extra info' } }));
    expect(mockedToastError).toHaveBeenCalledWith('Denied. extra info');
  });

  describe('persistent option', () => {
    it('creates a never-expiring toast deduped by message', () => {
      showApiErrorToast(axiosError({ message: 'Denied' }), undefined, { persistent: true });
      expect(mockedToastError).toHaveBeenCalledWith(expect.any(Function), {
        duration: Infinity,
        id: 'persistent-error:Denied',
      });
    });

    it('renders selectable message text alongside a dismiss button', () => {
      showApiErrorToast(axiosError({ message: 'Denied' }), undefined, { persistent: true });

      const root = renderPersistentToast();
      const [text, closeButton] = root.props.children;

      expect(root.type).toBe('span');
      expect(text).toBe('Denied');
      expect(closeButton.type).toBe('button');
      expect(closeButton.props['aria-label']).toBe('Dismiss error');
    });

    it('dismisses the toast when the close button is clicked', () => {
      showApiErrorToast(axiosError({ message: 'Denied' }), undefined, { persistent: true });

      const root = renderPersistentToast('toast-42');
      const [, closeButton] = root.props.children;
      closeButton.props.onClick();

      expect(mockedToastDismiss).toHaveBeenCalledWith('toast-42');
    });
  });
});
