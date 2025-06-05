import { DataStorageType } from '../../../../shared';

export interface DataMartListItem {
  id: string;
  title: string;
  storageType: DataStorageType;
  createdAt: Date;
  modifiedAt: Date;
}

export interface DataMartListState {
  items: DataMartListItem[];
  loading: boolean;
  error: string | null;
}

export type DataMartListAction =
  | { type: 'SET_LOADING' }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'SET_ITEMS'; payload: DataMartListItem[] }
  | { type: 'RESET' };
