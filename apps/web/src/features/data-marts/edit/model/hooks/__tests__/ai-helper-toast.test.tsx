import { describe, expect, it, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import {
  humanizeAiHelperError,
  showAiHelperCancelledToast,
  showAiHelperErrorToast,
} from '../ai-helper-toast';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const BIGQUERY_ACCESS_DENIED =
  'Access Denied: Project prj-data-hub-dv-a9d8: User does not have bigquery.datasets.create permission in project prj-data-hub-dv-a9d8.';

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
  });

  it('shows a persistent, dismissible error keyed by data mart', () => {
    showAiHelperErrorToast('dm-1', 'Something failed');

    expect(toast.error).toHaveBeenCalledWith(
      'Something failed',
      expect.objectContaining({
        id: 'ai-helper-error-dm-1',
        duration: Infinity,
        closeButton: true,
        description: undefined,
      })
    );
  });

  it('attaches the raw error as an expandable description for rewritten messages', () => {
    showAiHelperErrorToast('dm-1', BIGQUERY_ACCESS_DENIED);

    const [message, options] = vi.mocked(toast.error).mock.calls[0] as [
      string,
      { description?: unknown },
    ];
    expect(message).not.toBe(BIGQUERY_ACCESS_DENIED);
    expect(options.description).toBeDefined();
  });
});

describe('showAiHelperCancelledToast', () => {
  it('shows a persistent, dismissible notice keyed by data mart', () => {
    showAiHelperCancelledToast('dm-2');

    expect(toast.info).toHaveBeenCalledWith(
      expect.stringContaining('cancelled'),
      expect.objectContaining({
        id: 'ai-helper-cancelled-dm-2',
        duration: Infinity,
        closeButton: true,
      })
    );
  });
});
