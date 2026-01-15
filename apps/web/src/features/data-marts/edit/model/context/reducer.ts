import type { DataMartState, DataMartAction } from './types';
import { DATA_MART_RUNS_PAGE_SIZE } from '../../constants';
import { updateDataMartWithValidationHelper } from '../helpers';
import { isDataMartRunFinalStatus } from '../../../shared/utils/status.utils';
import type { DataMartRunItem } from '../types';

// Initial state
export const initialState: DataMartState = {
  dataMart: null,
  isLoading: false,
  isLoadingMoreRuns: false,
  error: null,
  runs: [],
  isManualRunTriggered: false,
  hasMoreRunsToLoad: true,
  hasActiveRuns: false,
};

// Reducer function
export function reducer(state: DataMartState, action: DataMartAction): DataMartState {
  switch (action.type) {
    case 'FETCH_DATA_MART_START':
    case 'CREATE_DATA_MART_START':
    case 'UPDATE_DATA_MART_START':
    case 'UPDATE_DATA_MART_TITLE_START':
    case 'UPDATE_DATA_MART_DESCRIPTION_START':
    case 'UPDATE_DATA_MART_DEFINITION_START':
    case 'DELETE_DATA_MART_START':
    case 'PUBLISH_DATA_MART_START':
    case 'RUN_DATA_MART_START':
    case 'ACTUALIZE_DATA_MART_SCHEMA_START':
    case 'UPDATE_DATA_MART_SCHEMA_START':
    case 'FETCH_DATA_MART_RUNS_START': {
      const isManualRun = action.type === 'RUN_DATA_MART_START';
      return {
        ...state,
        isLoading: true,
        error: null,
        isManualRunTriggered: isManualRun ? true : state.isManualRunTriggered,
        hasActiveRuns: isManualRun ? true : state.hasActiveRuns,
      };
    }

    case 'LOAD_MORE_DATA_MART_RUNS_START': {
      return {
        ...state,
        isLoadingMoreRuns: true,
        error: null,
      };
    }

    case 'CREATE_DATA_MART_SUCCESS':
      return { ...state, isLoading: false, error: null };
    case 'FETCH_DATA_MART_SUCCESS':
    case 'UPDATE_DATA_MART_SUCCESS':
    case 'PUBLISH_DATA_MART_SUCCESS':
    case 'ACTUALIZE_DATA_MART_SCHEMA_SUCCESS':
    case 'UPDATE_DATA_MART_SCHEMA_SUCCESS':
      return {
        ...state,
        isLoading: false,
        error: null,
        dataMart: updateDataMartWithValidationHelper(action.payload),
      };

    case 'UPDATE_DATA_MART_TITLE_SUCCESS':
      return state.dataMart
        ? {
            ...state,
            isLoading: false,
            error: null,
            dataMart: updateDataMartWithValidationHelper({
              ...state.dataMart,
              title: action.payload,
              modifiedAt: new Date(),
            }),
          }
        : state;

    case 'UPDATE_DATA_MART_DESCRIPTION_SUCCESS':
      return state.dataMart
        ? {
            ...state,
            isLoading: false,
            error: null,
            dataMart: updateDataMartWithValidationHelper({
              ...state.dataMart,
              description: action.payload,
              modifiedAt: new Date(),
            }),
          }
        : state;

    case 'UPDATE_DATA_MART_STORAGE':
      return state.dataMart
        ? {
            ...state,
            dataMart: updateDataMartWithValidationHelper({
              ...state.dataMart,
              storage: action.payload,
              modifiedAt: new Date(),
            }),
          }
        : state;

    case 'UPDATE_DATA_MART_DEFINITION_SUCCESS':
      return state.dataMart
        ? {
            ...state,
            isLoading: false,
            error: null,
            dataMart: updateDataMartWithValidationHelper({
              ...state.dataMart,
              definitionType: action.payload.definitionType,
              definition: action.payload.definition,
              modifiedAt: new Date(),
            }),
          }
        : state;

    case 'DELETE_DATA_MART_SUCCESS':
      return { ...state, isLoading: false, error: null, dataMart: null };

    case 'RUN_DATA_MART_SUCCESS':
      return { ...state, isLoading: false, error: null };

    case 'FETCH_DATA_MART_RUNS_SUCCESS': {
      // Smart merge: start with fresh data from payload (newest runs first)
      // then add old runs from state that are not in payload (loaded via Load More)
      const payloadRunsMap = new Map(action.payload.map(run => [run.id, run]));

      // Add old runs from state that are not in the fresh payload
      state.runs.forEach(run => {
        if (!payloadRunsMap.has(run.id)) {
          payloadRunsMap.set(run.id, run);
        }
      });

      const mergedRuns = Array.from(payloadRunsMap.values());

      // If initial fetch returned less than page size, no more runs to load
      // Otherwise, keep the current hasMoreRunsToLoad state (might have been set by Load More)
      const hasMoreRunsToLoad =
        state.runs.length === 0
          ? action.payload.length >= DATA_MART_RUNS_PAGE_SIZE
          : state.hasMoreRunsToLoad;

      // Check if there are any active (non-final) runs
      const hasActiveRuns = calculateHasActiveRuns(state.isManualRunTriggered, mergedRuns);

      return {
        ...state,
        isLoading: false,
        isLoadingMoreRuns: false,
        error: null,
        runs: mergedRuns,
        hasMoreRunsToLoad,
        hasActiveRuns,
      };
    }

    case 'FETCH_DATA_MART_ERROR':
    case 'CREATE_DATA_MART_ERROR':
    case 'UPDATE_DATA_MART_ERROR':
    case 'UPDATE_DATA_MART_TITLE_ERROR':
    case 'UPDATE_DATA_MART_DESCRIPTION_ERROR':
    case 'UPDATE_DATA_MART_DEFINITION_ERROR':
    case 'DELETE_DATA_MART_ERROR':
    case 'PUBLISH_DATA_MART_ERROR':
    case 'RUN_DATA_MART_ERROR':
    case 'ACTUALIZE_DATA_MART_SCHEMA_ERROR':
    case 'UPDATE_DATA_MART_SCHEMA_ERROR':
    case 'FETCH_DATA_MART_RUNS_ERROR':
      return { ...state, isLoading: false, error: action.payload };

    case 'LOAD_MORE_DATA_MART_RUNS_SUCCESS': {
      // Deduplicate: add only runs that don't exist yet
      const existingIds = new Set(state.runs.map(run => run.id));
      const newRuns = action.payload.filter(run => !existingIds.has(run.id));

      // Add new Runs to the end, because they are older in time
      const allRuns = [...state.runs, ...newRuns];

      // If received less than page size, we've reached the end
      const hasMoreRunsToLoad = action.payload.length >= DATA_MART_RUNS_PAGE_SIZE;

      // Check if there are any active (non-final) runs
      const hasActiveRuns = calculateHasActiveRuns(state.isManualRunTriggered, allRuns);

      return {
        ...state,
        isLoading: false,
        isLoadingMoreRuns: false,
        error: null,
        runs: allRuns,
        hasMoreRunsToLoad,
        hasActiveRuns,
      };
    }

    case 'LOAD_MORE_DATA_MART_RUNS_ERROR':
      return { ...state, isLoadingMoreRuns: false, error: action.payload };

    case 'RESET_MANUAL_RUN_TRIGGERED': {
      // Recalculate hasActiveRuns after resetting manual trigger
      const hasActiveRuns = calculateHasActiveRuns(false, state.runs);
      return { ...state, isManualRunTriggered: false, hasActiveRuns };
    }

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

/**
 * Calculate if there are any active (non-final) runs
 * @param isManualRunTriggered - Whether a manual run was triggered
 * @param runs - Array of data mart runs
 * @returns true if there are active runs or manual run was triggered
 */
function calculateHasActiveRuns(isManualRunTriggered: boolean, runs: DataMartRunItem[]): boolean {
  return isManualRunTriggered || runs.some(run => !isDataMartRunFinalStatus(run.status));
}
