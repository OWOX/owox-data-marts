import type { DataMartState, DataMartAction } from './types.ts';
import { updateDataMartWithValidationHelper } from '../helpers';

// Initial state
export const initialState: DataMartState = {
  dataMart: null,
  isLoading: false,
  error: null,
  runs: [],
  isManualRunTriggered: false,
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
    case 'FETCH_DATA_MART_RUNS_START':
    case 'LOAD_MORE_DATA_MART_RUNS_START': {
      const isManualRun = action.type === 'RUN_DATA_MART_START';
      return {
        ...state,
        isLoading: true,
        error: null,
        isManualRunTriggered: isManualRun ? true : state.isManualRunTriggered,
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

    case 'FETCH_DATA_MART_RUNS_SUCCESS':
      return { ...state, isLoading: false, error: null, runs: action.payload };

    case 'LOAD_MORE_DATA_MART_RUNS_SUCCESS':
      return { ...state, isLoading: false, error: null, runs: [...state.runs, ...action.payload] };

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
    case 'LOAD_MORE_DATA_MART_RUNS_ERROR':
      return { ...state, isLoading: false, error: action.payload };

    case 'RESET_MANUAL_RUN_TRIGGERED':
      return { ...state, isManualRunTriggered: false };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}
