import type { GoogleSheetsReportsListState, GoogleSheetsReportsListAction } from './types';

export const initialState: GoogleSheetsReportsListState = {
  items: [],
  loading: false,
  error: null,
};

export function reducer(
  state: GoogleSheetsReportsListState,
  action: GoogleSheetsReportsListAction
): GoogleSheetsReportsListState {
  switch (action.type) {
    case 'SET_ITEMS':
      return { ...state, items: action.payload, loading: false, error: null };
    case 'SET_LOADING':
      return { ...state, loading: true, error: null };
    case 'SET_ERROR':
      return { ...state, loading: false, error: action.payload };
    default:
      return state;
  }
}
