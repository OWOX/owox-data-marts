import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import toast from 'react-hot-toast';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  dismissAiHelperToasts,
  humanizeAiHelperError,
  showAiHelperCancelledToast,
  showAiHelperErrorToast,
} from '../ai-helper-toast';

vi.mock('react-hot-toast', () => {
  const mock = Object.assign(vi.fn(), {
    error: vi.fn(),
    dismiss: vi.fn(),
  });
  return { default: mock };
});

const BIGQUERY_ACCESS_DENIED =
  'Access Denied: Project prj-data-hub-dv-a9d8: User does not have bigquery.datasets.create permission in project prj-data-hub-dv-a9d8.';

type ToastContent = (t: { id: string }) => ReactNode;

function renderLastErrorToast(): void {
  const calls = vi.mocked(toast.error).mock.calls;
  const [content] = calls[calls.length - 1] as unknown as [ToastContent];
  render(<>{content({ id: 'toast-1' })}</>);
}

describe('humanizeAiHelperError', () => {
  it('rewrites a BigQuery missing-permission error with the project id and permission name', () => {
    const result = humanizeAiHelperError(BIGQUERY_ACCESS_DENIED);

    expect(result.message).toContain('"prj-data-hub-dv-a9d8"');
    expect(result.message).toContain('bigquery.datasets.create');
    expect(result.message).toContain('Ask a BigQuery admin');
    expect(result.details).toBe(BIGQUERY_ACCESS_DENIED);
  });

  it('rewrites a generic BigQuery access-denied error with the project id', () => {
    const raw = 'Access Denied: Project my-project: something else entirely';

    const result = humanizeAiHelperError(raw);

    expect(result.message).toContain('"my-project"');
    expect(result.details).toBe(raw);
  });

  it('passes unrecognized errors through unchanged, with no details section', () => {
    const raw = 'AI returned no field aliases. Try again or fill them in manually.';

    expect(humanizeAiHelperError(raw)).toEqual({ message: raw });
  });
});

describe('showAiHelperErrorToast', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.dismiss).mockClear();
  });

  it('shows a persistent react-hot-toast error keyed by data mart', () => {
    showAiHelperErrorToast('dm-1', 'Something failed');

    expect(toast.error).toHaveBeenCalledWith(expect.any(Function), {
      duration: Infinity,
      id: 'ai-helper-error-dm-1',
    });
  });

  it('renders the humanized message with a dismiss button', () => {
    showAiHelperErrorToast('dm-1', BIGQUERY_ACCESS_DENIED);
    renderLastErrorToast();

    expect(screen.getByText(/can't access BigQuery project/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss error' }));
    expect(toast.dismiss).toHaveBeenCalledWith('toast-1');
  });

  it('expands the raw error by re-issuing the toast under the same id', () => {
    showAiHelperErrorToast('dm-1', BIGQUERY_ACCESS_DENIED);
    renderLastErrorToast();

    expect(screen.queryByText(BIGQUERY_ACCESS_DENIED)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show technical details' }));

    // The click re-issues the toast (same id) so react-hot-toast re-renders and re-measures.
    expect(toast.error).toHaveBeenCalledTimes(2);
    renderLastErrorToast();
    expect(screen.getByText(BIGQUERY_ACCESS_DENIED)).toBeInTheDocument();
  });

  it('offers no details toggle for messages shown as-is', () => {
    showAiHelperErrorToast('dm-1', 'AI returned no field aliases.');
    renderLastErrorToast();

    expect(
      screen.queryByRole('button', { name: 'Show technical details' })
    ).not.toBeInTheDocument();
  });
});

describe('showAiHelperCancelledToast', () => {
  it('shows a persistent, dismissible notice keyed by data mart', () => {
    showAiHelperCancelledToast('dm-2');

    expect(toast).toHaveBeenCalledWith(expect.any(Function), {
      duration: Infinity,
      id: 'ai-helper-cancelled-dm-2',
    });
  });
});

describe('dismissAiHelperToasts', () => {
  it('dismisses both persistent toasts of the data mart', () => {
    vi.mocked(toast.dismiss).mockClear();

    dismissAiHelperToasts('dm-3');

    expect(toast.dismiss).toHaveBeenCalledWith('ai-helper-error-dm-3');
    expect(toast.dismiss).toHaveBeenCalledWith('ai-helper-cancelled-dm-3');
  });
});
