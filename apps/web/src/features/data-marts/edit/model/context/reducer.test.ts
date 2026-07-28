import { describe, expect, it } from 'vitest';
import { DataMartRunStatus, DataMartRunType } from '../../../shared';
import type { DataMartRunItem } from '../types';
import { initialState, reducer } from './reducer';

function run(type: DataMartRunType, status: DataMartRunStatus): DataMartRunItem {
  return { id: `${type}-${status}`, type, status } as DataMartRunItem;
}

describe('data mart run state', () => {
  it('keeps the exact manual connector run id returned by the API', () => {
    const started = reducer(initialState, { type: 'RUN_DATA_MART_START' });
    const state = reducer(started, {
      type: 'RUN_DATA_MART_SUCCESS',
      payload: 'manual-run-1',
    });

    expect(state.isManualRunTriggered).toBe(true);
    expect(state.manualRunId).toBe('manual-run-1');
  });

  it('does not present an active Data Quality run as a data update', () => {
    const state = reducer(initialState, {
      type: 'FETCH_DATA_MART_RUNS_SUCCESS',
      payload: [run(DataMartRunType.DATA_QUALITY, DataMartRunStatus.RUNNING)],
    });

    expect(state.hasActiveRuns).toBe(false);
  });
});
