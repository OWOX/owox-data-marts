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

vi.mock('../../../../data-storage/shared/services/data-storage-health-status.service', () => ({
  invalidateDataStorageHealthStatus: vi.fn(),
}));

import toast from 'react-hot-toast';
import { dataMartService } from '../../services/data-mart.service';
import { invalidateDataStorageHealthStatus } from '../../../../data-storage/shared/services/data-storage-health-status.service';
import { useSchemaActualizeTrigger } from '../useSchemaActualizeTrigger';
import { DataMartSchemaFieldStatus } from '../../types/data-mart-schema.types';

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

  it('invalidates storage health when trigger response returns OAuth refresh code', async () => {
    (dataMartService.createSchemaActualizeTrigger as any).mockResolvedValue({ triggerId: 's6' });
    (dataMartService.getSchemaActualizeTriggerStatus as any).mockResolvedValueOnce(
      TaskStatus.ERROR
    );
    (dataMartService.getSchemaActualizeTriggerResponse as any).mockRejectedValueOnce({
      response: {
        data: {
          code: 'CREDENTIALS_EXPIRED',
          error:
            'Google authorization could not be refreshed. Reconnect this Storage to restore access.',
        },
      },
    });

    const { result: hook } = renderHook(() =>
      useSchemaActualizeTrigger('dm-6', undefined, 'storage-1')
    );

    await act(async () => {
      await hook.current.run();
    });

    await waitFor(() => {
      expect(hook.current.isLoading).toBe(false);
      expect(hook.current.error).toBe(
        'Google authorization could not be refreshed. Reconnect this Storage to restore access.'
      );
    });

    expect(invalidateDataStorageHealthStatus).toHaveBeenCalledWith('storage-1');
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

  // The Input Source flow reaches the user through this hook, so the schema summary has to be
  // emitted here — not only where the schema is fetched.
  it('reports the refreshed schema in the success toast when onSuccess returns the Data Mart', async () => {
    (dataMartService.createSchemaActualizeTrigger as any).mockResolvedValue({ triggerId: 's-sum' });
    (dataMartService.getSchemaActualizeTriggerStatus as any).mockResolvedValueOnce(
      TaskStatus.SUCCESS
    );
    (dataMartService.getSchemaActualizeTriggerResponse as any).mockResolvedValue({ success: true });

    const onSuccess = vi.fn().mockResolvedValue({
      schema: {
        type: 'bigquery-data-mart-schema',
        fields: [
          { name: 'a', status: DataMartSchemaFieldStatus.CONNECTED },
          { name: 'b', status: DataMartSchemaFieldStatus.CONNECTED },
          { name: 'c', status: DataMartSchemaFieldStatus.DISCONNECTED },
        ],
      },
    });

    const { result: hook } = renderHook(() => useSchemaActualizeTrigger('dm-1', onSuccess));

    await act(async () => {
      hook.current.run();
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Output schema actualized: 3 fields, 1 disconnected',
        expect.anything()
      );
    });
  });

  it('falls back to the plain message when onSuccess returns nothing', async () => {
    (dataMartService.createSchemaActualizeTrigger as any).mockResolvedValue({ triggerId: 's-pln' });
    (dataMartService.getSchemaActualizeTriggerStatus as any).mockResolvedValueOnce(
      TaskStatus.SUCCESS
    );
    (dataMartService.getSchemaActualizeTriggerResponse as any).mockResolvedValue({ success: true });

    const { result: hook } = renderHook(() => useSchemaActualizeTrigger('dm-1', vi.fn()));

    await act(async () => {
      hook.current.run();
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Output schema actualized', expect.anything());
    });
  });
});
