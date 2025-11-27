import type { DataMart } from '../types';
import type {
  CreateDataMartRequestDto,
  RunDataMartRequestDto,
  UpdateDataMartRequestDto,
} from '../../../shared/types/api';
import type { DataMartDefinitionType } from '../../../shared';
import type { DataMartDefinitionConfig } from '../types';
import type { ApiError } from '../../../../../app/api';
import type { DataMartSchema } from '../../../shared/types/data-mart-schema.types';
import type { DataMartRunItem } from '../types';

export interface DataMartState {
  dataMart: DataMart | null;
  isLoading: boolean;
  error: ApiError | null;
  runs: DataMartRunItem[];
}

export type DataMartAction =
  | { type: 'FETCH_DATA_MART_START' }
  | { type: 'FETCH_DATA_MART_SUCCESS'; payload: DataMart }
  | { type: 'FETCH_DATA_MART_ERROR'; payload: ApiError }
  | { type: 'CREATE_DATA_MART_START' }
  | { type: 'CREATE_DATA_MART_SUCCESS'; payload: Pick<DataMart, 'id' | 'title'> }
  | { type: 'CREATE_DATA_MART_ERROR'; payload: ApiError }
  | { type: 'UPDATE_DATA_MART_START' }
  | { type: 'UPDATE_DATA_MART_SUCCESS'; payload: DataMart }
  | { type: 'UPDATE_DATA_MART_ERROR'; payload: ApiError }
  | { type: 'UPDATE_DATA_MART_TITLE_START' }
  | { type: 'UPDATE_DATA_MART_TITLE_SUCCESS'; payload: string }
  | { type: 'UPDATE_DATA_MART_TITLE_ERROR'; payload: ApiError }
  | { type: 'UPDATE_DATA_MART_DESCRIPTION_START' }
  | { type: 'UPDATE_DATA_MART_DESCRIPTION_SUCCESS'; payload: string }
  | { type: 'UPDATE_DATA_MART_DESCRIPTION_ERROR'; payload: ApiError }
  | { type: 'UPDATE_DATA_MART_STORAGE'; payload: DataMart['storage'] }
  | { type: 'UPDATE_DATA_MART_DEFINITION_START' }
  | {
      type: 'UPDATE_DATA_MART_DEFINITION_SUCCESS';
      payload: { definitionType: DataMartDefinitionType; definition: DataMartDefinitionConfig };
    }
  | { type: 'UPDATE_DATA_MART_DEFINITION_ERROR'; payload: ApiError }
  | { type: 'DELETE_DATA_MART_START' }
  | { type: 'DELETE_DATA_MART_SUCCESS' }
  | { type: 'DELETE_DATA_MART_ERROR'; payload: ApiError }
  | { type: 'PUBLISH_DATA_MART_START' }
  | { type: 'PUBLISH_DATA_MART_SUCCESS'; payload: DataMart }
  | { type: 'PUBLISH_DATA_MART_ERROR'; payload: ApiError }
  | { type: 'RUN_DATA_MART_START' }
  | { type: 'RUN_DATA_MART_SUCCESS' }
  | { type: 'RUN_DATA_MART_ERROR'; payload: ApiError }
  | { type: 'ACTUALIZE_DATA_MART_SCHEMA_START' }
  | { type: 'ACTUALIZE_DATA_MART_SCHEMA_SUCCESS'; payload: DataMart }
  | { type: 'ACTUALIZE_DATA_MART_SCHEMA_ERROR'; payload: ApiError }
  | { type: 'UPDATE_DATA_MART_SCHEMA_START' }
  | { type: 'UPDATE_DATA_MART_SCHEMA_SUCCESS'; payload: DataMart }
  | { type: 'UPDATE_DATA_MART_SCHEMA_ERROR'; payload: ApiError }
  | { type: 'FETCH_DATA_MART_RUNS_START' }
  | { type: 'FETCH_DATA_MART_RUNS_SUCCESS'; payload: DataMartRunItem[] }
  | { type: 'FETCH_DATA_MART_RUNS_ERROR'; payload: ApiError }
  | { type: 'LOAD_MORE_DATA_MART_RUNS_START' }
  | { type: 'LOAD_MORE_DATA_MART_RUNS_SUCCESS'; payload: DataMartRunItem[] }
  | { type: 'LOAD_MORE_DATA_MART_RUNS_ERROR'; payload: ApiError }
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
  runDataMart: (data: RunDataMartRequestDto) => Promise<void>;
  cancelDataMartRun: (id: string, runId: string) => Promise<void>;
  actualizeDataMartSchema: (id: string) => Promise<void>;
  updateDataMartSchema: (id: string, schema: DataMartSchema) => Promise<void>;
  getDataMartRuns: (
    id: string,
    limit?: number,
    offset?: number,
    options?: { silent?: boolean }
  ) => Promise<DataMartRunItem[]>;
  getDataMartRunById: (dataMartId: string, runId: string) => Promise<DataMartRunItem>;
  loadMoreDataMartRuns: (id: string, offset: number, limit?: number) => Promise<DataMartRunItem[]>;
  runSchemaActualization?: () => Promise<void>;
  isSchemaActualizationLoading?: boolean;
  error: ApiError | null;
  getErrorMessage: () => string | null;
  reset: () => void;
}
