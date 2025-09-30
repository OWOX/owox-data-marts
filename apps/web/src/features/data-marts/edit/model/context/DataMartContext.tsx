import { type ReactNode, useCallback, useReducer } from 'react';
import { DataMartContext } from './context.ts';
import { initialState, reducer } from './reducer.ts';
import { mapDataMartFromDto, mapLimitedDataMartFromDto } from '../mappers';
import {
  mapConnectorDefinitionToDto,
  mapSqlDefinitionToDto,
  mapTableDefinitionToDto,
  mapTablePatternDefinitionToDto,
  mapViewDefinitionToDto,
} from '../mappers/definition-mappers';
import { dataMartService } from '../../../shared';
import type {
  CreateDataMartRequestDto,
  RunDataMartRequestDto,
  UpdateDataMartConnectorDefinitionRequestDto,
  UpdateDataMartDefinitionRequestDto,
  UpdateDataMartRequestDto,
  UpdateDataMartSqlDefinitionRequestDto,
  UpdateDataMartTableDefinitionRequestDto,
  UpdateDataMartTablePatternDefinitionRequestDto,
  UpdateDataMartViewDefinitionRequestDto,
} from '../../../shared/types/api';
import type { DataStorage } from '../../../../data-storage/shared/model/types/data-storage';
import { DataMartDefinitionType } from '../../../shared';
import type {
  ConnectorDefinitionConfig,
  DataMartDefinitionConfig,
  SqlDefinitionConfig,
  TableDefinitionConfig,
  TablePatternDefinitionConfig,
  ViewDefinitionConfig,
} from '../types';
import { extractApiError } from '../../../../../app/api';
import type { DataMartSchema } from '../../../shared/types/data-mart-schema.types';
import toast from 'react-hot-toast';

// Props interface
interface DataMartProviderProps {
  children: ReactNode;
}

// Provider component
export function DataMartProvider({ children }: DataMartProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Get a data mart by ID
  const getDataMart = useCallback(async (id: string) => {
    try {
      dispatch({ type: 'FETCH_DATA_MART_START' });
      const response = await dataMartService.getDataMartById(id);
      const dataMart = mapDataMartFromDto(response);
      dispatch({ type: 'FETCH_DATA_MART_SUCCESS', payload: dataMart });
    } catch (error) {
      dispatch({
        type: 'FETCH_DATA_MART_ERROR',
        payload: extractApiError(error),
      });
    }
  }, []);

  // Create a new data mart
  const createDataMart = async (data: CreateDataMartRequestDto) => {
    try {
      dispatch({ type: 'CREATE_DATA_MART_START' });
      const response = await dataMartService.createDataMart(data);
      const dataMart = mapLimitedDataMartFromDto(response);
      dispatch({ type: 'CREATE_DATA_MART_SUCCESS', payload: dataMart });
      toast.success('Data Mart created');
      return dataMart;
    } catch (error) {
      dispatch({
        type: 'CREATE_DATA_MART_ERROR',
        payload: extractApiError(error),
      });
      throw error;
    }
  };

  // Update an existing data mart
  const updateDataMart = async (id: string, data: UpdateDataMartRequestDto) => {
    try {
      dispatch({ type: 'UPDATE_DATA_MART_START' });
      const response = await dataMartService.updateDataMart(id, data);
      const dataMart = mapDataMartFromDto(response);
      dispatch({ type: 'UPDATE_DATA_MART_SUCCESS', payload: dataMart });
    } catch (error) {
      dispatch({
        type: 'UPDATE_DATA_MART_ERROR',
        payload: extractApiError(error),
      });
    }
  };

  // Delete a data mart
  const deleteDataMart = async (id: string) => {
    try {
      dispatch({ type: 'DELETE_DATA_MART_START' });
      await dataMartService.deleteDataMart(id);
      dispatch({ type: 'DELETE_DATA_MART_SUCCESS' });
      toast.success('Data Mart deleted');
    } catch (error) {
      dispatch({
        type: 'DELETE_DATA_MART_ERROR',
        payload: extractApiError(error),
      });
    }
  };

  // Update data mart title
  const updateDataMartTitle = async (id: string, title: string) => {
    try {
      dispatch({ type: 'UPDATE_DATA_MART_TITLE_START' });
      await dataMartService.updateDataMartTitle(id, title);
      dispatch({ type: 'UPDATE_DATA_MART_TITLE_SUCCESS', payload: title });
      toast.success('Title updated');
    } catch (error) {
      dispatch({
        type: 'UPDATE_DATA_MART_TITLE_ERROR',
        payload: extractApiError(error),
      });
    }
  };

  // Update data mart description
  const updateDataMartDescription = async (id: string, description: string | null) => {
    try {
      dispatch({ type: 'UPDATE_DATA_MART_DESCRIPTION_START' });
      await dataMartService.updateDataMartDescription(id, description);
      dispatch({ type: 'UPDATE_DATA_MART_DESCRIPTION_SUCCESS', payload: description ?? '' });
      toast.success('Description updated');
    } catch (error) {
      dispatch({
        type: 'UPDATE_DATA_MART_DESCRIPTION_ERROR',
        payload: extractApiError(error),
      });
    }
  };

  // Update data mart storage
  const updateDataMartStorage = useCallback((storage: DataStorage) => {
    dispatch({ type: 'UPDATE_DATA_MART_STORAGE', payload: storage });
  }, []);

  // Update data mart definition
  const updateDataMartDefinition = async (
    id: string,
    definitionType: DataMartDefinitionType,
    definition: DataMartDefinitionConfig
  ) => {
    try {
      dispatch({ type: 'UPDATE_DATA_MART_DEFINITION_START' });

      let requestData: UpdateDataMartDefinitionRequestDto;

      switch (definitionType) {
        case DataMartDefinitionType.SQL:
          requestData = {
            definitionType,
            definition: mapSqlDefinitionToDto(definition as SqlDefinitionConfig),
          } as UpdateDataMartSqlDefinitionRequestDto;
          break;

        case DataMartDefinitionType.TABLE:
          requestData = {
            definitionType,
            definition: mapTableDefinitionToDto(definition as TableDefinitionConfig),
          } as UpdateDataMartTableDefinitionRequestDto;
          break;

        case DataMartDefinitionType.VIEW:
          requestData = {
            definitionType,
            definition: mapViewDefinitionToDto(definition as ViewDefinitionConfig),
          } as UpdateDataMartViewDefinitionRequestDto;
          break;

        case DataMartDefinitionType.TABLE_PATTERN:
          requestData = {
            definitionType,
            definition: mapTablePatternDefinitionToDto(definition as TablePatternDefinitionConfig),
          } as UpdateDataMartTablePatternDefinitionRequestDto;
          break;

        case DataMartDefinitionType.CONNECTOR: {
          requestData = {
            definitionType: DataMartDefinitionType.CONNECTOR,
            definition: mapConnectorDefinitionToDto(definition as ConnectorDefinitionConfig),
          } as UpdateDataMartConnectorDefinitionRequestDto;
          break;
        }

        default:
          throw new Error(`Unsupported definition type: ${String(definitionType)}`);
      }

      const response = await dataMartService.updateDataMartDefinition(id, requestData);
      const dataMart = mapDataMartFromDto(response);

      dispatch({
        type: 'UPDATE_DATA_MART_DEFINITION_SUCCESS',
        payload: { definitionType, definition },
      });
      dispatch({ type: 'UPDATE_DATA_MART_SUCCESS', payload: dataMart });
    } catch (error) {
      dispatch({
        type: 'UPDATE_DATA_MART_DEFINITION_ERROR',
        payload: extractApiError(error),
      });
    }
  };

  // Publish a data mart
  const publishDataMart = async (id: string) => {
    try {
      dispatch({ type: 'PUBLISH_DATA_MART_START' });
      const response = await dataMartService.publishDataMart(id);
      const dataMart = mapDataMartFromDto(response);
      dispatch({ type: 'PUBLISH_DATA_MART_SUCCESS', payload: dataMart });
      toast.success('Data Mart published');
    } catch (error) {
      dispatch({
        type: 'PUBLISH_DATA_MART_ERROR',
        payload: extractApiError(error),
      });
      throw error;
    }
  };

  // Run a data mart
  const runDataMart = async (request: RunDataMartRequestDto) => {
    try {
      dispatch({ type: 'RUN_DATA_MART_START' });
      toast.loading('Manual run started');
      await dataMartService.runDataMart(request.id, request.payload);
      dispatch({ type: 'RUN_DATA_MART_SUCCESS' });
    } catch (error) {
      dispatch({
        type: 'RUN_DATA_MART_ERROR',
        payload: extractApiError(error),
      });
    }
  };

  const cancelDataMartRun = async (id: string, runId: string): Promise<void> => {
    try {
      await dataMartService.cancelDataMartRun(id, runId);
      await getDataMartRuns(id);
      toast.success('Data Mart run canceled');
    } catch (error) {
      dispatch({
        type: 'RUN_DATA_MART_ERROR',
        payload: extractApiError(error),
      });
    }
  };

  // Actualize data mart schema
  const actualizeDataMartSchema = async (id: string) => {
    try {
      dispatch({ type: 'ACTUALIZE_DATA_MART_SCHEMA_START' });
      const response = await dataMartService.actualizeDataMartSchema(id);
      const dataMart = mapDataMartFromDto(response);
      dispatch({ type: 'ACTUALIZE_DATA_MART_SCHEMA_SUCCESS', payload: dataMart });
      toast.success('Output schema actualized');
    } catch (error) {
      dispatch({
        type: 'ACTUALIZE_DATA_MART_SCHEMA_ERROR',
        payload: extractApiError(error),
      });
    }
  };

  // Update data mart schema
  const updateDataMartSchema = async (id: string, schema: DataMartSchema) => {
    try {
      dispatch({ type: 'UPDATE_DATA_MART_SCHEMA_START' });
      const response = await dataMartService.updateDataMartSchema(id, { schema });
      const dataMart = mapDataMartFromDto(response);
      dispatch({ type: 'UPDATE_DATA_MART_SCHEMA_SUCCESS', payload: dataMart });
      toast.success('Output schema updated');
    } catch (error) {
      dispatch({
        type: 'UPDATE_DATA_MART_SCHEMA_ERROR',
        payload: extractApiError(error),
      });
    }
  };

  // Get run history for a data mart
  const getDataMartRuns = useCallback(async (id: string, limit = 5, offset = 0) => {
    try {
      dispatch({ type: 'FETCH_DATA_MART_RUNS_START' });
      const response = await dataMartService.getDataMartRuns(id, limit, offset);
      dispatch({ type: 'FETCH_DATA_MART_RUNS_SUCCESS', payload: response });
      return response;
    } catch (error) {
      dispatch({
        type: 'FETCH_DATA_MART_RUNS_ERROR',
        payload: extractApiError(error),
      });
      throw error;
    }
  }, []);

  // Load more run history for a data mart
  const loadMoreDataMartRuns = useCallback(async (id: string, offset: number, limit = 5) => {
    try {
      dispatch({ type: 'LOAD_MORE_DATA_MART_RUNS_START' });
      const response = await dataMartService.getDataMartRuns(id, limit, offset);
      dispatch({ type: 'LOAD_MORE_DATA_MART_RUNS_SUCCESS', payload: response });
      return response;
    } catch (error) {
      dispatch({
        type: 'LOAD_MORE_DATA_MART_RUNS_ERROR',
        payload: extractApiError(error),
      });
      throw error;
    }
  }, []);

  // Reset state
  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  // Get an error message for UI display
  const getErrorMessage = useCallback(() => {
    if (!state.error) {
      return null;
    }
    return state.error.message;
  }, [state.error]);

  const value = {
    ...state,
    getDataMart,
    createDataMart,
    updateDataMart,
    deleteDataMart,
    updateDataMartTitle,
    updateDataMartDescription,
    updateDataMartStorage,
    updateDataMartDefinition,
    publishDataMart,
    runDataMart,
    cancelDataMartRun,
    actualizeDataMartSchema,
    updateDataMartSchema,
    getDataMartRuns,
    loadMoreDataMartRuns,
    getErrorMessage,
    reset,
  };

  return <DataMartContext.Provider value={value}>{children}</DataMartContext.Provider>;
}
