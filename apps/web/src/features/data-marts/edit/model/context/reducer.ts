import type { DataMartState, DataMartAction } from './types.ts';

// Initial state
export const initialState: DataMartState = {
  dataMart: null,
  isLoading: false,
  error: null,
};

// Reducer function
export function reducer(state: DataMartState, action: DataMartAction): DataMartState {
  switch (action.type) {
    case 'FETCH_DATA_MART_START':
    case 'CREATE_DATA_MART_START':
    case 'UPDATE_DATA_MART_START':
    case 'UPDATE_DATA_MART_TITLE_START':
    case 'UPDATE_DATA_MART_DESCRIPTION_START':
    case 'DELETE_DATA_MART_START':
      return { ...state, isLoading: true, error: null };

    case 'CREATE_DATA_MART_SUCCESS':
      return { ...state, isLoading: false, error: null };
    case 'FETCH_DATA_MART_SUCCESS':
    case 'UPDATE_DATA_MART_SUCCESS':
      return { ...state, isLoading: false, error: null, dataMart: action.payload };

    case 'UPDATE_DATA_MART_TITLE_SUCCESS':
      return state.dataMart
        ? {
            ...state,
            isLoading: false,
            error: null,
            dataMart: {
              ...state.dataMart,
              title: action.payload,
              modifiedAt: new Date(),
            },
          }
        : state;

    case 'UPDATE_DATA_MART_DESCRIPTION_SUCCESS':
      return state.dataMart
        ? {
            ...state,
            isLoading: false,
            error: null,
            dataMart: {
              ...state.dataMart,
              description: action.payload,
              modifiedAt: new Date(),
            },
          }
        : state;

    case 'DELETE_DATA_MART_SUCCESS':
      return { ...state, isLoading: false, error: null, dataMart: null };

    case 'FETCH_DATA_MART_ERROR':
    case 'CREATE_DATA_MART_ERROR':
    case 'UPDATE_DATA_MART_ERROR':
    case 'UPDATE_DATA_MART_TITLE_ERROR':
    case 'UPDATE_DATA_MART_DESCRIPTION_ERROR':
    case 'DELETE_DATA_MART_ERROR':
      return { ...state, isLoading: false, error: action.payload };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}
