import type { GoogleSheetsReport } from '../types';

export interface GoogleSheetsReportsListState {
  items: GoogleSheetsReport[];
  loading: boolean;
  error: string | null;
}

export type GoogleSheetsReportsListAction =
  | { type: 'SET_ITEMS'; payload: GoogleSheetsReport[] }
  | { type: 'DELETE_ITEM'; payload: string }
  | { type: 'SET_LOADING' }
  | { type: 'SET_ERROR'; payload: string };

export interface GoogleSheetsReportsListContextValue {
  state: GoogleSheetsReportsListState;
  dispatch: React.Dispatch<GoogleSheetsReportsListAction>;
}
