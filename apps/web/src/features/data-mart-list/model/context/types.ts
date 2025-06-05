import type { DataMartListItem } from '../types';

export interface DataMartListState {
  items: DataMartListItem[];
  loading: boolean;
  error: string | null;
}

export type DataMartListAction =
  | { type: 'SET_ITEMS'; payload: DataMartListItem[] }
  | { type: 'SET_LOADING' }
  | { type: 'SET_ERROR'; payload: string };

export interface DataMartListContextValue {
  state: DataMartListState;
  dispatch: React.Dispatch<DataMartListAction>;
}
