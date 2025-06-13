import type { CreateDataMartRequestDto, UpdateDataMartRequestDto } from '../../../../shared';
import type { DataMart } from '../types';

export interface DataMartState {
  dataMart: DataMart | null;
  isLoading: boolean;
  error: string | null;
}

export type DataMartAction =
  | { type: 'FETCH_DATA_MART_START' }
  | { type: 'FETCH_DATA_MART_SUCCESS'; payload: DataMart }
  | { type: 'FETCH_DATA_MART_ERROR'; payload: string }
  | { type: 'CREATE_DATA_MART_START' }
  | { type: 'CREATE_DATA_MART_SUCCESS'; payload: Pick<DataMart, 'id' | 'title'> }
  | { type: 'CREATE_DATA_MART_ERROR'; payload: string }
  | { type: 'UPDATE_DATA_MART_START' }
  | { type: 'UPDATE_DATA_MART_SUCCESS'; payload: DataMart }
  | { type: 'UPDATE_DATA_MART_ERROR'; payload: string }
  | { type: 'DELETE_DATA_MART_START' }
  | { type: 'DELETE_DATA_MART_SUCCESS' }
  | { type: 'DELETE_DATA_MART_ERROR'; payload: string }
  | { type: 'RESET' };

export interface DataMartContextType extends DataMartState {
  getDataMart: (id: string) => Promise<void>;
  createDataMart: (data: CreateDataMartRequestDto) => Promise<Pick<DataMart, 'id' | 'title'>>;
  updateDataMart: (id: string, data: UpdateDataMartRequestDto) => Promise<void>;
  deleteDataMart: (id: string) => Promise<void>;
  reset: () => void;
}
