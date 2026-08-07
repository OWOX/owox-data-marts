import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useAiHelper } from '../use-ai-helper';
import { showAiHelperCancelledToast } from '../ai-helper-toast';
import { dataMartService } from '../../../../shared';

vi.mock('../ai-helper-toast', () => ({
  showAiHelperErrorToast: vi.fn(),
  showAiHelperCancelledToast: vi.fn(),
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
