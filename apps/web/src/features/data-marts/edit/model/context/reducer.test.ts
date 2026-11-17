import { describe, expect, it } from 'vitest';
import { DataMartRunStatus, DataMartRunType } from '../../../shared';
import type { ApiError } from '../../../../../app/api';
import { DATA_MART_RUNS_PAGE_SIZE } from '../../constants';
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

  it('starts the list again when the newest page shares no run with the loaded list', () => {
    const page = (prefix: string) =>
      Array.from({ length: DATA_MART_RUNS_PAGE_SIZE }, (_, index) => ({
        ...run(DataMartRunType.CONNECTOR, DataMartRunStatus.SUCCESS),
        id: `${prefix}-${index}`,
      }));
    const loaded = reducer(initialState, {
      type: 'FETCH_DATA_MART_RUNS_SUCCESS',
      payload: page('old'),
    });
    const refreshed = reducer(
      { ...loaded, hasMoreRunsToLoad: false },
      { type: 'FETCH_DATA_MART_RUNS_SUCCESS', payload: page('new') }
    );

    expect(refreshed.runs.map(item => item.id)).toEqual(page('new').map(item => item.id));
    expect(refreshed.hasMoreRunsToLoad).toBe(true);
  });

  it('keeps the loaded runs when the newest page overlaps them', () => {
    const older = { ...run(DataMartRunType.CONNECTOR, DataMartRunStatus.SUCCESS), id: 'older' };
    const latest = { ...run(DataMartRunType.CONNECTOR, DataMartRunStatus.SUCCESS), id: 'latest' };
    const fresh = { ...run(DataMartRunType.CONNECTOR, DataMartRunStatus.SUCCESS), id: 'fresh' };
    const loaded = reducer(initialState, {
      type: 'FETCH_DATA_MART_RUNS_SUCCESS',
      payload: [latest, older],
    });
    const merged = reducer(loaded, {
      type: 'FETCH_DATA_MART_RUNS_SUCCESS',
      payload: [fresh, latest],
    });

    expect(merged.runs.map(item => item.id)).toEqual(['fresh', 'latest', 'older']);
  });
});

describe('schema save error state', () => {
  // `state.error` is shared with DataMartDetails, which renders <NoAccess/> the instant
  // `error?.statusCode === 403` — before its own `!dataMart` guard. A view-only session gets a
  // 403 on every mutating request, so populating this shared field from a rejected schema save
  // would swap out an already-loaded, fully rendered Data Mart page (and the analyst's unsaved
  // edits with it) out from under them. DataMartSchemaSettings tells a failed save apart WITHOUT
  // this channel — see useOperationState.failSaveOperation.
  it('does NOT set error on a rejected schema save, unlike FETCH/CREATE errors', () => {
    const apiError = { message: 'Calculated field validation failed' } as ApiError;
    const started = reducer(initialState, { type: 'UPDATE_DATA_MART_SCHEMA_START' });
    const state = reducer(started, { type: 'UPDATE_DATA_MART_SCHEMA_ERROR', payload: apiError });

    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });
});
