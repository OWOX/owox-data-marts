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

  it('appends the validator message from details.errors', () => {
    showApiErrorToast(
      axiosError({
        message: 'Output controls validation failed',
        details: {
          errors: [
            {
              code: 'HAVING_ON_BLENDED_SLEEVE_METRIC_NOT_SUPPORTED',
              column: 'orders__amount',
              function: 'SUM',
              message: 'Filter on a main-side column or a different metric instead.',
            },
          ],
        },
      })
    );
    expect(mockedToastError).toHaveBeenCalledWith(
      'Output controls validation failed. Filter on a main-side column or a different metric instead.'
    );
  });

  it('names the column and rule when an error carries no message', () => {
    showApiErrorToast(
      axiosError({
        message: 'Output controls validation failed',
        details: {
          errors: [
            { code: 'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_FIELD', column: 'name', function: 'P50' },
          ],
        },
      })
    );
    // The raw enum used to be shown verbatim. It is the code's own words, so a generic
    // de-screaming transform reads as a sentence for every code — including ones added later,
    // which a lookup table would silently render raw again.
    expect(mockedToastError).toHaveBeenCalledWith(
      'Output controls validation failed. Aggregation function not allowed for field: P50(name).'
    );
  });

  // The validator reports EVERY problem in one array, and a persistent toast stays until
  // dismissed — an unbounded list turns it into a wall of text.
  it('lists the first few problems and counts the rest', () => {
    showApiErrorToast(
      axiosError({
        message: 'Rejected',
        details: {
          errors: [
            { code: 'A_RULE', column: 'one' },
            { code: 'B_RULE', column: 'two' },
            { code: 'C_RULE', column: 'three' },
            { code: 'D_RULE', column: 'four' },
            { code: 'E_RULE', column: 'five' },
          ],
        },
      })
    );

    const shown = mockedToastError.mock.calls[0][0] as string;
    expect(shown).toContain('A rule: one.');
    expect(shown).toContain('C rule: three.');
    expect(shown).not.toContain('four');
    expect(shown).toContain('(+2 more)');
  });

  it('de-duplicates repeated validator messages', () => {
    showApiErrorToast(
      axiosError({
        message: 'Rejected',
        details: {
          errors: [
            { code: 'X', column: 'a', message: 'same reason' },
            { code: 'X', column: 'b', message: 'same reason' },
          ],
        },
      })
    );
    expect(mockedToastError).toHaveBeenCalledWith('Rejected. same reason');
  });

  it('reuses the given toast id so repeated failures do not stack', () => {
    showApiErrorToast(axiosError({ message: 'Server exploded' }), undefined, {
      id: 'server-error:500',
    });
    expect(mockedToastError).toHaveBeenCalledWith('Server exploded', { id: 'server-error:500' });
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
