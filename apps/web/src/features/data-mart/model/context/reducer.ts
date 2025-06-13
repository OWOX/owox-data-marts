import type { DataMartState, DataMartAction } from './types';

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
    case 'DELETE_DATA_MART_START':
      return { ...state, isLoading: true, error: null };

    case 'CREATE_DATA_MART_SUCCESS':
      return { ...state, isLoading: false, error: null };
    case 'FETCH_DATA_MART_SUCCESS':
    case 'UPDATE_DATA_MART_SUCCESS':
      return { ...state, isLoading: false, error: null, dataMart: action.payload };

    case 'DELETE_DATA_MART_SUCCESS':
      return { ...state, isLoading: false, error: null, dataMart: null };

    case 'FETCH_DATA_MART_ERROR':
    case 'CREATE_DATA_MART_ERROR':
    case 'UPDATE_DATA_MART_ERROR':
    case 'DELETE_DATA_MART_ERROR':
      return { ...state, isLoading: false, error: action.payload };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}
