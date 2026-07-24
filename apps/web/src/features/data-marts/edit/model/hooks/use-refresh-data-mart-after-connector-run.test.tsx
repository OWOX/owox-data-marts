// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataMartRunStatus, DataMartRunType } from '../../../shared';
import type { DataMartRunItem } from '../types';
import { useRefreshDataMartAfterConnectorRun } from './use-refresh-data-mart-after-connector-run';

const run = (id: string, status: DataMartRunStatus): DataMartRunItem =>
  ({ id, status, type: DataMartRunType.CONNECTOR }) as DataMartRunItem;

describe('useRefreshDataMartAfterConnectorRun', () => {
  it('refreshes after a newly observed connector run succeeds', async () => {
    const refreshDataMart = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ runs }: { runs: DataMartRunItem[] }) => {
        useRefreshDataMartAfterConnectorRun({
          dataMartId: 'dm-1',
          isGoogleSheetsConnector: true,
          isManualRunTriggered: false,
          runs,
          refreshDataMart,
        });
      },
      { initialProps: { runs: [run('old-run', DataMartRunStatus.SUCCESS)] } }
    );

    rerender({ runs: [run('new-run', DataMartRunStatus.RUNNING)] });
    rerender({ runs: [run('new-run', DataMartRunStatus.SUCCESS)] });

    await waitFor(() => {
      expect(refreshDataMart).toHaveBeenCalledWith('dm-1');
    });
    expect(refreshDataMart).toHaveBeenCalledTimes(1);
  });

  it('refreshes when a fast manual run is first observed as successful', async () => {
    const refreshDataMart = vi.fn().mockResolvedValue(undefined);

    renderHook(() => {
      useRefreshDataMartAfterConnectorRun({
        dataMartId: 'dm-1',
        isGoogleSheetsConnector: true,
        isManualRunTriggered: true,
        runs: [run('new-run', DataMartRunStatus.SUCCESS)],
        refreshDataMart,
      });
    });

    await waitFor(() => {
      expect(refreshDataMart).toHaveBeenCalledWith('dm-1');
    });
  });

  it('does not change the refresh behavior of other connectors', () => {
    const refreshDataMart = vi.fn().mockResolvedValue(undefined);

    renderHook(() => {
      useRefreshDataMartAfterConnectorRun({
        dataMartId: 'dm-1',
        isGoogleSheetsConnector: false,
        isManualRunTriggered: true,
        runs: [run('new-run', DataMartRunStatus.SUCCESS)],
        refreshDataMart,
      });
    });

    expect(refreshDataMart).not.toHaveBeenCalled();
  });
});
