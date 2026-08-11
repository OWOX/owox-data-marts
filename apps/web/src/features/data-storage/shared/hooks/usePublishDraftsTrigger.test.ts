import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import toast from 'react-hot-toast';
import { TaskStatus } from '../../../../shared/types/task-status.enum.ts';
import { dataStorageApiService } from '../api';
import { usePublishDraftsTrigger } from './usePublishDraftsTrigger.ts';

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('../api', () => ({
  dataStorageApiService: {
    createPublishDraftsTrigger: vi.fn(),
    getPublishDraftsTriggerStatus: vi.fn(),
    getPublishDraftsTriggerResponse: vi.fn(),
    abortPublishDraftsTrigger: vi.fn(),
  },
}));

const SAFE_TRIGGER_ERROR =
  'Could not determine your project permissions. No Data Mart drafts were published.';

/** Shape of the AxiosError produced when the backend returns the trigger as HTTP 400. */
function axios400(body: Record<string, unknown>): Error {
  return Object.assign(new Error('Request failed with status code 400'), {
    response: { data: body },
  });
}

describe('usePublishDraftsTrigger — terminal ERROR trigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dataStorageApiService.createPublishDraftsTrigger).mockResolvedValue({
      triggerId: 't1',
    });
    vi.mocked(dataStorageApiService.getPublishDraftsTriggerStatus).mockResolvedValue(
      TaskStatus.ERROR
    );
  });

  // The backend deletes an ERROR trigger on read and returns it as HTTP 400,
  // so the allowlisted reason in the body is the only chance to inform the user.
  it('shows the backend-reported reason instead of the raw Axios message', async () => {
    vi.mocked(dataStorageApiService.getPublishDraftsTriggerResponse).mockRejectedValue(
      axios400({
        successCount: 0,
        failedCount: 0,
        error: SAFE_TRIGGER_ERROR,
        statusCode: 400,
        message: 'Bad Request Exception',
      })
    );

    const { result } = renderHook(() => usePublishDraftsTrigger());
    await act(async () => {
      await result.current.run('storage-1');
    });

    expect(toast.error).toHaveBeenCalledWith(SAFE_TRIGGER_ERROR, expect.objectContaining({}));
    expect(result.current.error).toBe(SAFE_TRIGGER_ERROR);
  });

  it('falls back to the Axios message when the 400 body carries no error field', async () => {
    vi.mocked(dataStorageApiService.getPublishDraftsTriggerResponse).mockRejectedValue(
      axios400({ statusCode: 400, message: 'Request was cancelled by user' })
    );

    const { result } = renderHook(() => usePublishDraftsTrigger());
    await act(async () => {
      await result.current.run('storage-1');
    });

    expect(result.current.error).toBe('Request failed with status code 400');
  });

  // The common path today: the runner overwrites ERROR with SUCCESS, so the
  // reason arrives on a 200 response via uiResponse.error.
  it('still shows the reason when it arrives on a successful response', async () => {
    vi.mocked(dataStorageApiService.getPublishDraftsTriggerStatus).mockResolvedValue(
      TaskStatus.SUCCESS
    );
    vi.mocked(dataStorageApiService.getPublishDraftsTriggerResponse).mockResolvedValue({
      successCount: 0,
      failedCount: 0,
      error: SAFE_TRIGGER_ERROR,
    });

    const { result } = renderHook(() => usePublishDraftsTrigger());
    await act(async () => {
      await result.current.run('storage-1');
    });

    expect(toast.error).toHaveBeenCalledWith(
      SAFE_TRIGGER_ERROR,
      expect.objectContaining({ id: 't1-error' })
    );
    expect(result.current.error).toBe(SAFE_TRIGGER_ERROR);
  });
});
