import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useAiHelper } from '../use-ai-helper';
import {
  dismissAiHelperToasts,
  showAiHelperCancelledToast,
  showAiHelperErrorToast,
} from '../ai-helper-toast';
import { dataMartService } from '../../../../shared';
import { TaskStatus } from '../../../../../../shared/types/task-status.enum';

vi.mock('../ai-helper-toast', () => ({
  showAiHelperErrorToast: vi.fn(),
  showAiHelperCancelledToast: vi.fn(),
  dismissAiHelperToasts: vi.fn(),
}));

vi.mock('../../../../../../utils', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('../../../../shared', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../shared')>();
  return {
    ...actual,
    dataMartService: {
      createAiHelperTrigger: vi.fn(),
      getAiHelperTriggerStatus: vi.fn(),
      getAiHelperTriggerResponse: vi.fn(),
      abortAiHelperTrigger: vi.fn(),
    },
  };
});

const mockedService = vi.mocked(dataMartService);

describe('useAiHelper — unmount with a run in flight', () => {
  beforeEach(() => {
    vi.mocked(showAiHelperCancelledToast).mockClear();
    mockedService.createAiHelperTrigger.mockResolvedValue({ triggerId: 'trigger-1' });
    // Keep the run "in flight": the first status poll never resolves.
    mockedService.getAiHelperTriggerStatus.mockReturnValue(new Promise(() => undefined));
    mockedService.abortAiHelperTrigger.mockResolvedValue(undefined);
  });

  it('shows the persistent cancellation notice', async () => {
    const { result, unmount } = renderHook(() => useAiHelper());

    await act(async () => {
      void result.current.generateAllFieldMetadata('dm-1');
      // Let createAiHelperTrigger resolve so the run registers as active.
      await Promise.resolve();
      await Promise.resolve();
    });

    unmount();

    expect(showAiHelperCancelledToast).toHaveBeenCalledWith('dm-1');
    expect(mockedService.abortAiHelperTrigger).toHaveBeenCalledWith('dm-1', 'trigger-1');
  });

  it('stays silent when nothing was running', () => {
    const { unmount } = renderHook(() => useAiHelper());

    unmount();

    expect(showAiHelperCancelledToast).not.toHaveBeenCalled();
  });
});

describe('useAiHelper — generation failed', () => {
  const ACCESS_DENIED =
    'Access Denied: Project owox-test: User does not have bigquery.datasets.create permission in project owox-test.';

  beforeEach(() => {
    vi.mocked(showAiHelperErrorToast).mockClear();
    mockedService.createAiHelperTrigger.mockResolvedValue({ triggerId: 'trigger-err' });
  });

  it('shows the persistent error toast for SUCCESS status with an { error } body — the real backend contract', async () => {
    // The trigger handler swallows generation errors into uiResponse and the scheduler
    // runner then flips the trigger to SUCCESS, so a failed run arrives as status
    // SUCCESS + HTTP 200 with { error }. This exact path was silent in production.
    mockedService.getAiHelperTriggerStatus.mockResolvedValue(TaskStatus.SUCCESS);
    mockedService.getAiHelperTriggerResponse.mockResolvedValue({ error: ACCESS_DENIED });

    const { result } = renderHook(() => useAiHelper());

    await act(async () => {
      await result.current.generateAllFieldMetadata('dm-1');
    });

    expect(showAiHelperErrorToast).toHaveBeenCalledWith('dm-1', ACCESS_DENIED);
  });

  it('dismisses stale persistent toasts when a new run starts', async () => {
    mockedService.getAiHelperTriggerStatus.mockResolvedValue(TaskStatus.SUCCESS);
    mockedService.getAiHelperTriggerResponse.mockResolvedValue({
      result: { fields: [{ name: 'id', alias: 'ID' }] },
    });

    const { result } = renderHook(() => useAiHelper());

    await act(async () => {
      await result.current.generateAllFieldAliases('dm-1');
    });

    expect(dismissAiHelperToasts).toHaveBeenCalledWith('dm-1');
  });

  it('shows the persistent error toast for ERROR status with an HTTP 400 { error } response', async () => {
    mockedService.getAiHelperTriggerStatus.mockResolvedValue(TaskStatus.ERROR);
    mockedService.getAiHelperTriggerResponse.mockRejectedValue({
      response: { status: 400, data: { error: ACCESS_DENIED } },
    });

    const { result } = renderHook(() => useAiHelper());

    await act(async () => {
      await result.current.generateAllFieldMetadata('dm-1');
    });

    expect(showAiHelperErrorToast).toHaveBeenCalledWith('dm-1', ACCESS_DENIED);
  });
});
