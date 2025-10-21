import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, beforeEach, expect } from 'vitest';
import { TaskStatus } from '../../../../../shared/types/task-status.enum.ts';

// Mock the dataMartService used inside the hook
vi.mock('../../services/data-mart.service', () => {
  return {
    dataMartService: {
      createSqlDryRunTrigger: vi.fn(),
      getSqlDryRunTriggerStatus: vi.fn(),
      getSqlDryRunTriggerResponse: vi.fn(),
      abortSqlDryRunTrigger: vi.fn(),
    },
  };
});

import { dataMartService } from '../../services/data-mart.service';
import { useSqlDryRunTrigger } from '../useSqlDryRunTrigger';

describe('useSqlDryRunTrigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure abort returns a thenable to support `.catch` used in cleanup
    (dataMartService.abortSqlDryRunTrigger as any).mockResolvedValue(undefined);
  });

  it('performs a successful validation flow and sets result', async () => {
    (dataMartService.createSqlDryRunTrigger as any).mockResolvedValue({ triggerId: 't1' });
    // Status: SUCCESS immediately (no polling delay)
    const statusMock = dataMartService.getSqlDryRunTriggerStatus as any;
    statusMock.mockResolvedValueOnce(TaskStatus.SUCCESS);

    (dataMartService.getSqlDryRunTriggerResponse as any).mockResolvedValue({
      isValid: true,
      error: null,
      bytes: 123,
    });

    const { result: hook } = renderHook(() => useSqlDryRunTrigger('dm-1'));

    await act(async () => {
      // Do not await here; let the async polling proceed with fake timers
      hook.current.validateSql('SELECT 1');
    });

    await waitFor(() => {
      expect(hook.current.isLoading).toBe(false);
      expect(hook.current.result).toEqual({ isValid: true, error: undefined, bytes: 123 });
    });

    expect(dataMartService.createSqlDryRunTrigger).toHaveBeenCalledWith('dm-1', 'SELECT 1');
    expect(dataMartService.getSqlDryRunTriggerStatus).toHaveBeenCalledTimes(1);
    expect(dataMartService.getSqlDryRunTriggerStatus).toHaveBeenCalledWith('dm-1', 't1');
    expect(dataMartService.getSqlDryRunTriggerResponse).toHaveBeenCalledWith('dm-1', 't1');
  });

  it('handles error during polling and sets error result', async () => {
    (dataMartService.createSqlDryRunTrigger as any).mockResolvedValue({ triggerId: 't2' });
    const err = new Error('Network failed');
    const statusMock = dataMartService.getSqlDryRunTriggerStatus as any;
    statusMock.mockRejectedValueOnce(err);

    const { result: hook } = renderHook(() => useSqlDryRunTrigger('dm-2'));

    await act(async () => {
      hook.current.validateSql('SELECT 2');
    });

    await waitFor(() => {
      expect(hook.current.isLoading).toBe(false);
      expect(hook.current.result?.isValid).toBe(false);
      expect(hook.current.result?.error).toBe('Network failed');
    });
  });

  it('cancels an ongoing validation and calls abort on the service', async () => {
    (dataMartService.createSqlDryRunTrigger as any).mockResolvedValue({ triggerId: 't3' });
    // Keep returning PROCESSING so it continues polling until cancellation
    (dataMartService.getSqlDryRunTriggerStatus as any).mockResolvedValue(TaskStatus.PROCESSING);

    const { result: hook } = renderHook(() => useSqlDryRunTrigger('dm-3'));

    await act(async () => {
      hook.current.validateSql('SELECT 3');
    });

    expect(hook.current.isLoading).toBe(true);

    await act(async () => {
      await hook.current.cancel();
    });

    expect(dataMartService.abortSqlDryRunTrigger).toHaveBeenCalledWith('dm-3', 't3');
    expect(hook.current.isLoading).toBe(false);

    // After cancel no result should be set by polling
    expect(hook.current.result).toBeNull();
  });

  it('aborts on unmount if a trigger is in progress', async () => {
    (dataMartService.createSqlDryRunTrigger as any).mockResolvedValue({ triggerId: 't4' });
    (dataMartService.getSqlDryRunTriggerStatus as any).mockResolvedValue(TaskStatus.PROCESSING);

    const { result: hook, unmount } = renderHook(() => useSqlDryRunTrigger('dm-4'));

    await act(async () => {
      hook.current.validateSql('SELECT 4');
    });

    await act(async () => {
      unmount();
    });

    expect(dataMartService.abortSqlDryRunTrigger).toHaveBeenCalledWith('dm-4', 't4');
  });
});
