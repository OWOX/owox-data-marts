import { describe, expect, it } from 'vitest';
import { DataMartRunStatus, DataMartRunType } from '../../../shared';
import type { DataMartRunItem } from '../types';
import { initialState, reducer } from './reducer';

function createRun(
  type: DataMartRunType,
  status: DataMartRunStatus,
  id = `${type}-${status}`
): DataMartRunItem {
  return {
    id,
    type,
    status,
  } as DataMartRunItem;
}

describe('data mart run activity', () => {
  it.each([DataMartRunStatus.PENDING, DataMartRunStatus.RUNNING])(
    'does not treat an active Data Quality run in %s as a data update',
    status => {
      const state = reducer(initialState, {
        type: 'FETCH_DATA_MART_RUNS_SUCCESS',
        payload: [createRun(DataMartRunType.DATA_QUALITY, status)],
      });

      expect(state.hasActiveRuns).toBe(false);
    }
  );

  it('continues to treat an active connector run as a data update', () => {
    const state = reducer(initialState, {
      type: 'FETCH_DATA_MART_RUNS_SUCCESS',
      payload: [createRun(DataMartRunType.CONNECTOR, DataMartRunStatus.RUNNING)],
    });

    expect(state.hasActiveRuns).toBe(true);
  });
});

describe('manual connector run tracking', () => {
  it('clears a stale tracked id when a new manual request starts', () => {
    const state = reducer(
      {
        ...initialState,
        manualRunId: 'stale-run',
      },
      { type: 'RUN_DATA_MART_START' }
    );

    expect(state.isManualRunTriggered).toBe(true);
    expect(state.manualRunId).toBeNull();
    expect(state.hasActiveRuns).toBe(true);
  });

  it('stores the exact run id returned by a successful manual request', () => {
    const started = reducer(initialState, { type: 'RUN_DATA_MART_START' });
    const state = reducer(started, {
      type: 'RUN_DATA_MART_SUCCESS',
      payload: 'manual-run-1',
    });

    expect(state.isManualRunTriggered).toBe(true);
    expect(state.manualRunId).toBe('manual-run-1');
    expect(state.hasActiveRuns).toBe(true);
  });

  it('clears manual tracking when creating the run fails', () => {
    const state = reducer(
      {
        ...initialState,
        isManualRunTriggered: true,
        manualRunId: 'manual-run-1',
        hasActiveRuns: true,
      },
      {
        type: 'RUN_DATA_MART_ERROR',
        payload: {
          message: 'run failed',
          path: '/api/data-marts/dm-1/manual-run',
          statusCode: 500,
          timestamp: '2026-07-16T12:00:00.000Z',
        },
      }
    );

    expect(state.isManualRunTriggered).toBe(false);
    expect(state.manualRunId).toBeNull();
    expect(state.hasActiveRuns).toBe(false);
  });

  it('clears both the flag and exact id after the tracked run is processed', () => {
    const state = reducer(
      {
        ...initialState,
        isManualRunTriggered: true,
        manualRunId: 'manual-run-1',
        hasActiveRuns: true,
      },
      { type: 'RESET_MANUAL_RUN_TRIGGERED' }
    );

    expect(state.isManualRunTriggered).toBe(false);
    expect(state.manualRunId).toBeNull();
    expect(state.hasActiveRuns).toBe(false);
  });

  it('replaces a stale running item with the exact terminal run before recalculating activity', () => {
    const staleRun = createRun(
      DataMartRunType.CONNECTOR,
      DataMartRunStatus.RUNNING,
      'manual-run-1'
    );
    const completedRun = { ...staleRun, status: DataMartRunStatus.SUCCESS };

    const state = reducer(
      {
        ...initialState,
        runs: [staleRun],
        isManualRunTriggered: true,
        manualRunId: staleRun.id,
        hasActiveRuns: true,
      },
      { type: 'RESET_MANUAL_RUN_TRIGGERED', payload: completedRun }
    );

    expect(state.runs).toEqual([completedRun]);
    expect(state.runs.filter(run => run.id === completedRun.id)).toHaveLength(1);
    expect(state.isManualRunTriggered).toBe(false);
    expect(state.manualRunId).toBeNull();
    expect(state.hasActiveRuns).toBe(false);
  });

  it('does not inject a missing exact terminal run into the paginated history', () => {
    const existingRun = createRun(
      DataMartRunType.CONNECTOR,
      DataMartRunStatus.SUCCESS,
      'older-run'
    );
    const completedRun = createRun(
      DataMartRunType.CONNECTOR,
      DataMartRunStatus.SUCCESS,
      'manual-run-1'
    );
    const state = reducer(
      {
        ...initialState,
        runs: [existingRun],
        isManualRunTriggered: true,
        manualRunId: completedRun.id,
        hasActiveRuns: true,
      },
      { type: 'RESET_MANUAL_RUN_TRIGGERED', payload: completedRun }
    );

    expect(state.runs).toEqual([existingRun]);
    expect(state.isManualRunTriggered).toBe(false);
    expect(state.manualRunId).toBeNull();
    expect(state.hasActiveRuns).toBe(false);
  });
});
