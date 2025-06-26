import type { DataMart } from '../types';
import type { CreateDataMartRequestDto, UpdateDataMartRequestDto } from '../../../shared/types/api';
import type { DataMartDefinitionType } from '../../../shared';
import type { DataMartDefinitionConfig } from '../types';

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
  | { type: 'UPDATE_DATA_MART_TITLE_START' }
  | { type: 'UPDATE_DATA_MART_TITLE_SUCCESS'; payload: string }
  | { type: 'UPDATE_DATA_MART_TITLE_ERROR'; payload: string }
  | { type: 'UPDATE_DATA_MART_DESCRIPTION_START' }
  | { type: 'UPDATE_DATA_MART_DESCRIPTION_SUCCESS'; payload: string }
  | { type: 'UPDATE_DATA_MART_DESCRIPTION_ERROR'; payload: string }
  | { type: 'UPDATE_DATA_MART_STORAGE'; payload: DataMart['storage'] }
  | { type: 'UPDATE_DATA_MART_DEFINITION_START' }
  | {
      type: 'UPDATE_DATA_MART_DEFINITION_SUCCESS';
      payload: { definitionType: DataMartDefinitionType; definition: DataMartDefinitionConfig };
    }
  | { type: 'UPDATE_DATA_MART_DEFINITION_ERROR'; payload: string }
  | { type: 'DELETE_DATA_MART_START' }
  | { type: 'DELETE_DATA_MART_SUCCESS' }
  | { type: 'DELETE_DATA_MART_ERROR'; payload: string }
  | { type: 'PUBLISH_DATA_MART_START' }
  | { type: 'PUBLISH_DATA_MART_SUCCESS'; payload: DataMart }
  | { type: 'PUBLISH_DATA_MART_ERROR'; payload: string }
  | { type: 'RESET' };

export interface DataMartContextType extends DataMartState {
  getDataMart: (id: string) => Promise<void>;
  createDataMart: (data: CreateDataMartRequestDto) => Promise<Pick<DataMart, 'id' | 'title'>>;
  updateDataMart: (id: string, data: UpdateDataMartRequestDto) => Promise<void>;
  deleteDataMart: (id: string) => Promise<void>;
  updateDataMartTitle: (id: string, title: string) => Promise<void>;
  updateDataMartDescription: (id: string, description: string) => Promise<void>;
  updateDataMartStorage: (storage: DataMart['storage']) => void;
  updateDataMartDefinition: (
    id: string,
    definitionType: DataMartDefinitionType,
    definition: DataMartDefinitionConfig
  ) => Promise<void>;
  publishDataMart: (id: string) => Promise<void>;
  reset: () => void;
}
