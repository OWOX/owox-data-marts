import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, beforeEach, expect } from 'vitest';
import { TaskStatus } from '../../../../../shared/types/task-status.enum.ts';

vi.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('../../services/data-mart.service', () => {
  return {
    dataMartService: {
      createSchemaActualizeTrigger: vi.fn(),
      getSchemaActualizeTriggerStatus: vi.fn(),
      getSchemaActualizeTriggerResponse: vi.fn(),
      abortSchemaActualizeTrigger: vi.fn(),
    },
  };
});

import { dataMartService } from '../../services/data-mart.service';
import { useSchemaActualizeTrigger } from '../useSchemaActualizeTrigger';

describe('useSchemaActualizeTrigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (dataMartService.abortSchemaActualizeTrigger as any).mockResolvedValue(undefined);
  });

  it('runs successfully and calls onSuccess, clears error', async () => {
    (dataMartService.createSchemaActualizeTrigger as any).mockResolvedValue({ triggerId: 's1' });
    (dataMartService.getSchemaActualizeTriggerStatus as any).mockResolvedValueOnce(
      TaskStatus.SUCCESS
    );
    (dataMartService.getSchemaActualizeTriggerResponse as any).mockResolvedValue({ success: true });

    const onSuccess = vi.fn();
    const { result: hook } = renderHook(() => useSchemaActualizeTrigger('dm-1', onSuccess));

    await act(async () => {
      hook.current.run();
    });

    await waitFor(() => {
      expect(hook.current.isLoading).toBe(false);
      expect(hook.current.error).toBeNull();
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(dataMartService.createSchemaActualizeTrigger).toHaveBeenCalledWith('dm-1');
    expect(dataMartService.getSchemaActualizeTriggerStatus).toHaveBeenCalledWith('dm-1', 's1');
    expect(dataMartService.getSchemaActualizeTriggerResponse).toHaveBeenCalledWith('dm-1', 's1');
  });

  it('sets error when trigger response has success=false', async () => {
    (dataMartService.createSchemaActualizeTrigger as any).mockResolvedValue({ triggerId: 's2' });
    (dataMartService.getSchemaActualizeTriggerStatus as any).mockResolvedValueOnce(
      TaskStatus.SUCCESS
    );
    (dataMartService.getSchemaActualizeTriggerResponse as any).mockResolvedValue({
      success: false,
      error: 'Schema mismatch',
    });

    const { result: hook } = renderHook(() => useSchemaActualizeTrigger('dm-2'));

    await act(async () => {
      hook.current.run();
    });

    await waitFor(() => {
      expect(hook.current.isLoading).toBe(false);
      expect(hook.current.error).toBe('Schema mismatch');
    });
  });

  it('handles error during polling and sets error', async () => {
    (dataMartService.createSchemaActualizeTrigger as any).mockResolvedValue({ triggerId: 's3' });
    const err = new Error('Network failed');
    (dataMartService.getSchemaActualizeTriggerStatus as any).mockRejectedValueOnce(err);

    const { result: hook } = renderHook(() => useSchemaActualizeTrigger('dm-3'));

    await act(async () => {
      hook.current.run();
    });

    await waitFor(() => {
      expect(hook.current.isLoading).toBe(false);
      expect(hook.current.error).toBe('Network failed');
    });
  });

  it('cancels an ongoing run and calls abort on the service', async () => {
    (dataMartService.createSchemaActualizeTrigger as any).mockResolvedValue({ triggerId: 's4' });
    // Keep returning PROCESSING so polling continues until cancellation
    (dataMartService.getSchemaActualizeTriggerStatus as any).mockResolvedValue(
      TaskStatus.PROCESSING
    );

    const { result: hook } = renderHook(() => useSchemaActualizeTrigger('dm-4'));

    await act(async () => {
      hook.current.run();
    });

    expect(hook.current.isLoading).toBe(true);

    await act(async () => {
      await hook.current.cancel();
    });

    expect(dataMartService.abortSchemaActualizeTrigger).toHaveBeenCalledWith('dm-4', 's4');
    expect(hook.current.isLoading).toBe(false);
    expect(hook.current.error).toBeNull();
  });

  it('aborts on unmount if a trigger is in progress', async () => {
    (dataMartService.createSchemaActualizeTrigger as any).mockResolvedValue({ triggerId: 's5' });
    (dataMartService.getSchemaActualizeTriggerStatus as any).mockResolvedValue(
      TaskStatus.PROCESSING
    );

    const { result: hook, unmount } = renderHook(() => useSchemaActualizeTrigger('dm-5'));

    await act(async () => {
      hook.current.run();
    });

    await act(async () => {
      unmount();
    });

    expect(dataMartService.abortSchemaActualizeTrigger).toHaveBeenCalledWith('dm-5', 's5');
  });
});
