// features/data-mart-list/model/context/reducer.ts
import type { DataMartListState, DataMartListAction } from './types';

export const initialState: DataMartListState = {
  items: [],
  loading: false,
  error: null,
};

export function reducer(state: DataMartListState, action: DataMartListAction): DataMartListState {
  switch (action.type) {
    case 'SET_ITEMS':
      return {
        ...state,
        items: action.payload,
        loading: false,
        error: null,
      };
    case 'SET_LOADING':
      return {
        ...state,
        loading: true,
        error: null,
      };
    case 'SET_ERROR':
      return {
        ...state,
        loading: false,
        error: action.payload,
      };
    default:
      return state;
  }
}
