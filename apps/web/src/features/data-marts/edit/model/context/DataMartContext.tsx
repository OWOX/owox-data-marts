import { type ReactNode, useCallback, useReducer } from 'react';
import { DataMartContext } from './context.ts';
import { initialState, reducer } from './reducer.ts';
import {
  mapDataMartFromDto,
  mapDataMartRunListResponseDtoToEntity,
  mapLimitedDataMartFromDto,
  mapConnectorDefinitionToDto,
  mapSqlDefinitionToDto,
  mapTableDefinitionToDto,
  mapTablePatternDefinitionToDto,
  mapViewDefinitionToDto,
} from '../mappers';
import { useAutoRefresh } from '../../../../../hooks/useAutoRefresh';
import { isDataMartRunFinalStatus } from '../../../shared/utils/status.utils';
import { DataMartDefinitionType, dataMartService } from '../../../shared';
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
import { pushToDataLayer, trackEvent } from '../../../../../utils';

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
      const dataMart = await mapDataMartFromDto(response);
      dispatch({ type: 'FETCH_DATA_MART_SUCCESS', payload: dataMart });
      pushToDataLayer({
        context: dataMart.id,
        value: dataMart.title,
      });
    } catch (error) {
      dispatch({
        type: 'FETCH_DATA_MART_ERROR',
        payload: extractApiError(error),
      });
    }
  }, []);

  // Create a new data mart
  const createDataMart = useCallback(async (data: CreateDataMartRequestDto) => {
    try {
      dispatch({ type: 'CREATE_DATA_MART_START' });
      const response = await dataMartService.createDataMart(data);
      const dataMart = mapLimitedDataMartFromDto(response);
      dispatch({ type: 'CREATE_DATA_MART_SUCCESS', payload: dataMart });
      trackEvent({
        event: 'data_mart_created',
        category: 'DataMart',
        action: 'Create',
        label: dataMart.id,
        value: dataMart.title,
      });
      toast.success('Data Mart created');
      return dataMart;
    } catch (error) {
      const apiError = extractApiError(error);
      dispatch({
        type: 'CREATE_DATA_MART_ERROR',
        payload: apiError,
      });
      trackEvent({
        event: 'data_mart_error',
        category: 'DataMart',
        action: 'CreateError',
        value: data.title,
        error: apiError.message,
      });
      throw error;
    }
  }, []);

  // Update an existing data mart
  const updateDataMart = useCallback(async (id: string, data: UpdateDataMartRequestDto) => {
    try {
      dispatch({ type: 'UPDATE_DATA_MART_START' });
      const response = await dataMartService.updateDataMart(id, data);
      const dataMart = await mapDataMartFromDto(response);
      dispatch({ type: 'UPDATE_DATA_MART_SUCCESS', payload: dataMart });
      trackEvent({
        event: 'data_mart_updated',
        category: 'DataMart',
        action: 'Update',
        label: dataMart.id,
        value: dataMart.title,
      });
    } catch (error) {
      const apiError = extractApiError(error);
      dispatch({
        type: 'UPDATE_DATA_MART_ERROR',
        payload: apiError,
      });
      trackEvent({
        event: 'data_mart_error',
        category: 'DataMart',
        action: 'UpdateError',
        label: id,
        value: data.title,
      });
    }
  }, []);

  // Delete a data mart
  const deleteDataMart = useCallback(async (id: string) => {
    try {
      dispatch({ type: 'DELETE_DATA_MART_START' });
      await dataMartService.deleteDataMart(id);
      dispatch({ type: 'DELETE_DATA_MART_SUCCESS' });
      trackEvent({
        event: 'data_mart_deleted',
        category: 'DataMart',
        action: 'Delete',
        label: id,
      });
      toast.success('Data Mart deleted');
    } catch (error) {
      const apiError = extractApiError(error);
      dispatch({
        type: 'DELETE_DATA_MART_ERROR',
        payload: apiError,
      });
      trackEvent({
        event: 'data_mart_error',
        category: 'DataMart',
        action: 'DeleteError',
        label: id,
        error: apiError.message,
      });
    }
  }, []);

  // Update data mart title
  const updateDataMartTitle = useCallback(async (id: string, title: string) => {
    try {
      dispatch({ type: 'UPDATE_DATA_MART_TITLE_START' });
      await dataMartService.updateDataMartTitle(id, title);
      dispatch({ type: 'UPDATE_DATA_MART_TITLE_SUCCESS', payload: title });
      trackEvent({
        event: 'data_mart_updated',
        category: 'DataMart',
        action: 'UpdateTitle',
        label: id,
        value: title,
      });
      toast.success('Title updated');
    } catch (error) {
      const apiError = extractApiError(error);
      dispatch({
        type: 'UPDATE_DATA_MART_TITLE_ERROR',
        payload: apiError,
      });
      trackEvent({
        event: 'data_mart_error',
        category: 'DataMart',
        action: 'UpdateTitleError',
        label: id,
        error: apiError.message,
      });
    }
  }, []);

  // Update data mart description
  const updateDataMartDescription = useCallback(async (id: string, description: string | null) => {
    try {
      dispatch({ type: 'UPDATE_DATA_MART_DESCRIPTION_START' });
      await dataMartService.updateDataMartDescription(id, description);
      dispatch({ type: 'UPDATE_DATA_MART_DESCRIPTION_SUCCESS', payload: description ?? '' });
      trackEvent({
        event: 'data_mart_updated',
        category: 'DataMart',
        action: 'UpdateDescription',
        label: id,
      });
      toast.success('Description updated');
    } catch (error) {
      const apiError = extractApiError(error);
      dispatch({
        type: 'UPDATE_DATA_MART_DESCRIPTION_ERROR',
        payload: apiError,
      });
      trackEvent({
        event: 'data_mart_error',
        category: 'DataMart',
        action: 'UpdateDescriptionError',
        label: id,
        error: apiError.message,
      });
    }
  }, []);

  // Update data mart storage
  const updateDataMartStorage = useCallback((storage: DataStorage) => {
    dispatch({ type: 'UPDATE_DATA_MART_STORAGE', payload: storage });
  }, []);

  // Update data mart definition
  const updateDataMartDefinition = useCallback(
    async (
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
              definition: mapTablePatternDefinitionToDto(
                definition as TablePatternDefinitionConfig
              ),
            } as UpdateDataMartTablePatternDefinitionRequestDto;
            break;

          case DataMartDefinitionType.CONNECTOR: {
            const connectorDef = definition as ConnectorDefinitionConfig;

            let sourceDataMartId: string | undefined;

            for (const config of connectorDef.connector.source.configuration) {
              const configWithMetadata = config as Record<string, unknown> & {
                _copiedFrom?: {
                  dataMartId: string;
                  dataMartTitle: string;
                  configId: string;
                };
              };
              if (configWithMetadata._copiedFrom) {
                sourceDataMartId = configWithMetadata._copiedFrom.dataMartId;
                break;
              }
            }

            requestData = {
              definitionType: DataMartDefinitionType.CONNECTOR,
              definition: mapConnectorDefinitionToDto(connectorDef),
              sourceDataMartId,
            } as UpdateDataMartConnectorDefinitionRequestDto;
            break;
          }

          default:
            throw new Error(`Unsupported definition type: ${String(definitionType)}`);
        }

        const response = await dataMartService.updateDataMartDefinition(id, requestData);
        const dataMart = await mapDataMartFromDto(response);
        dispatch({
          type: 'UPDATE_DATA_MART_DEFINITION_SUCCESS',
          payload: { definitionType, definition },
        });
        dispatch({ type: 'UPDATE_DATA_MART_SUCCESS', payload: dataMart });
        trackEvent({
          event: 'data_mart_updated',
          category: 'DataMart',
          action: 'UpdateDefinition',
          label: definitionType,
          context: dataMart.id,
          value: dataMart.title,
        });
      } catch (error) {
        const apiError = extractApiError(error);
        dispatch({
          type: 'UPDATE_DATA_MART_DEFINITION_ERROR',
          payload: apiError,
        });
        trackEvent({
          event: 'data_mart_error',
          category: 'DataMart',
          action: 'UpdateDefinitionError',
          label: definitionType,
          context: id,
          error: apiError.message,
        });
      }
    },
    []
  );

  // Publish a data mart
  const publishDataMart = useCallback(async (id: string) => {
    try {
      dispatch({ type: 'PUBLISH_DATA_MART_START' });
      const response = await dataMartService.publishDataMart(id);
      const dataMart = await mapDataMartFromDto(response);
      dispatch({ type: 'PUBLISH_DATA_MART_SUCCESS', payload: dataMart });
      toast.success('Data Mart published');
      trackEvent({
        event: 'data_mart_published',
        category: 'DataMart',
        action: 'Publish',
        label: dataMart.storage.type,
        context: dataMart.id,
        value: dataMart.title,
        details: dataMart.definitionType ?? 'No definition',
      });
    } catch (error) {
      const apiError = extractApiError(error);
      dispatch({
        type: 'PUBLISH_DATA_MART_ERROR',
        payload: apiError,
      });
      trackEvent({
        event: 'data_mart_error',
        category: 'DataMart',
        action: 'PublishError',
        label: id,
        error: apiError.message,
      });
      throw error;
    }
  }, []);

  /**
   * Retrieves a list of Data Mart runs from the server with the specified parameters.
   * Dispatches actions to indicate the state of the asynchronous operation.
   *
   * @param {string} id - The identifier of the Data Mart for which runs are to be retrieved.
   * @param {number} [limit=5] - The maximum number of runs to retrieve. Defaults to 5 if not specified.
   * @param {number} [offset=0] - The starting index for the retrieval. Defaults to 0 if not specified.
   * @param {Object} [options] - Optional parameters controlling the behavior of the operation.
   * @param {boolean} [options.silent=false] - If true, suppresses the dispatch of a loading indicator. Defaults to false.
   * @returns {Promise<Object>} A promise that resolves to the response containing the Data Mart runs.
   * @throws {Error} Throws an error if the operation fails, with the error being dispatched for error handling.
   */
  const getDataMartRuns = useCallback(
    async (id: string, limit = 5, offset = 0, options?: { silent?: boolean }) => {
      try {
        if (!options?.silent) {
          dispatch({ type: 'FETCH_DATA_MART_RUNS_START' });
        }
        const response = await dataMartService.getDataMartRuns(
          id,
          limit,
          offset,
          options?.silent ? { skipLoadingIndicator: true } : undefined
        );
        const dataMartRuns = mapDataMartRunListResponseDtoToEntity(response);
        dispatch({ type: 'FETCH_DATA_MART_RUNS_SUCCESS', payload: dataMartRuns });
        return dataMartRuns;
      } catch (error) {
        dispatch({
          type: 'FETCH_DATA_MART_RUNS_ERROR',
          payload: extractApiError(error),
        });
        throw error;
      }
    },
    []
  );

  /**
   * A callback function to load more Data Mart runs from the API.
   *
   * This function dispatches actions to manage the state of loading data mart runs.
   * On successful API response, it dispatches a success action with the response payload.
   * If an error occurs, it dispatches an error action with the extracted error payload.
   *
   * @function
   * @param {string} id - The unique identifier for the Data Mart.
   * @param {number} offset - The starting point for fetching the next batch of Data Mart runs.
   * @param {number} [limit=5] - The maximum number of Data Mart runs to fetch. Default is 5.
   * @returns {Promise<Object>} A promise that resolves to the API response containing the Data Mart runs.
   * @throws {Error} Throws an error if the API call fails.
   */
  const loadMoreDataMartRuns = useCallback(async (id: string, offset: number, limit = 5) => {
    try {
      dispatch({ type: 'LOAD_MORE_DATA_MART_RUNS_START' });
      const response = await dataMartService.getDataMartRuns(id, limit, offset);
      const dataMartRuns = mapDataMartRunListResponseDtoToEntity(response);
      dispatch({ type: 'LOAD_MORE_DATA_MART_RUNS_SUCCESS', payload: dataMartRuns });
      trackEvent({
        event: 'data_mart_runs_loaded',
        category: 'DataMart',
        action: 'LoadMore',
        context: id,
      });
      return dataMartRuns;
    } catch (error) {
      dispatch({
        type: 'LOAD_MORE_DATA_MART_RUNS_ERROR',
        payload: extractApiError(error),
      });
      throw error;
    }
  }, []);

  // Run a data mart
  const runDataMart = useCallback(async (request: RunDataMartRequestDto) => {
    const toastId = toast.loading('Manual run started');
    try {
      dispatch({ type: 'RUN_DATA_MART_START' });
      trackEvent({
        event: 'data_mart_run_started',
        category: 'DataMart',
        action: 'Run',
        label: 'Manual',
        context: request.id,
      });

      await dataMartService.runDataMart(request.id, request.payload);
      dispatch({ type: 'RUN_DATA_MART_SUCCESS' });
    } catch (error) {
      toast.dismiss(toastId);
      const apiError = extractApiError(error);
      dispatch({
        type: 'RUN_DATA_MART_ERROR',
        payload: apiError,
      });
      trackEvent({
        event: 'data_mart_error',
        category: 'DataMart',
        action: 'RunError',
        label: 'Manual',
        context: request.id,
        error: apiError.message,
      });
    }
  }, []);

  const cancelDataMartRun = useCallback(
    async (id: string, runId: string): Promise<void> => {
      try {
        await dataMartService.cancelDataMartRun(id, runId);
        await getDataMartRuns(id);
        toast.success('Data Mart run canceled');
        trackEvent({
          event: 'data_mart_run_canceled',
          category: 'DataMart',
          action: 'CancelRun',
          label: 'Manual',
        });
      } catch (error) {
        const apiError = extractApiError(error);
        dispatch({
          type: 'RUN_DATA_MART_ERROR',
          payload: apiError,
        });
        trackEvent({
          event: 'data_mart_error',
          category: 'DataMart',
          action: 'CancelRunError',
          error: apiError.message,
        });
      }
    },
    [getDataMartRuns]
  );

  // Get a data mart run by ID
  const getDataMartRunById = useCallback(async (dataMartId: string, runId: string) => {
    try {
      return await dataMartService.getDataMartRunById(dataMartId, runId);
    } catch (error) {
      const apiError = extractApiError(error);
      trackEvent({
        event: 'data_mart_error',
        category: 'DataMart',
        action: 'FetchRunDetailsError',
        error: apiError.message,
      });
      throw error;
    }
  }, []);

  // Actualize data mart schema
  const actualizeDataMartSchema = useCallback(async (id: string) => {
    try {
      dispatch({ type: 'ACTUALIZE_DATA_MART_SCHEMA_START' });
      const response = await dataMartService.actualizeDataMartSchema(id);
      const dataMart = await mapDataMartFromDto(response);
      dispatch({ type: 'ACTUALIZE_DATA_MART_SCHEMA_SUCCESS', payload: dataMart });
      toast.success('Output schema actualized');
      trackEvent({
        event: 'data_mart_schema_actualized',
        category: 'DataMart',
        action: 'ActualizeSchema',
        label: 'Automatic',
      });
    } catch (error) {
      const apiError = extractApiError(error);
      dispatch({
        type: 'ACTUALIZE_DATA_MART_SCHEMA_ERROR',
        payload: apiError,
      });
      trackEvent({
        event: 'data_mart_error',
        category: 'DataMart',
        action: 'ActualizeSchemaError',
        error: apiError.message,
      });
    }
  }, []);

  // Update data mart schema
  const updateDataMartSchema = useCallback(async (id: string, schema: DataMartSchema) => {
    try {
      dispatch({ type: 'UPDATE_DATA_MART_SCHEMA_START' });
      const response = await dataMartService.updateDataMartSchema(id, { schema });
      const dataMart = await mapDataMartFromDto(response);
      dispatch({ type: 'UPDATE_DATA_MART_SCHEMA_SUCCESS', payload: dataMart });
      toast.success('Output schema updated');
      trackEvent({
        event: 'data_mart_schema_updated',
        category: 'DataMart',
        action: 'UpdateSchema',
        label: 'Manual',
      });
    } catch (error) {
      const apiError = extractApiError(error);
      dispatch({
        type: 'UPDATE_DATA_MART_SCHEMA_ERROR',
        payload: apiError,
      });
      trackEvent({
        event: 'data_mart_error',
        category: 'DataMart',
        action: 'UpdateSchemaError',
        error: apiError.message,
      });
    }
  }, []);

  // Reset state
  const resetManualRunTriggered = useCallback(() => {
    dispatch({ type: 'RESET_MANUAL_RUN_TRIGGERED' });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  // Unified polling for runs completion
  useAutoRefresh({
    enabled:
      !!state.dataMart?.id &&
      (state.isManualRunTriggered || state.runs.some(run => !isDataMartRunFinalStatus(run.status))),
    intervalMs: 5000,
    onTick: () => {
      if (!state.dataMart?.id) return;
      void getDataMartRuns(state.dataMart.id, 20, 0, { silent: true });
    },
  });

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
    getDataMartRunById,
    loadMoreDataMartRuns,
    getErrorMessage,
    resetManualRunTriggered,
    reset,
  };

  return <DataMartContext.Provider value={value}>{children}</DataMartContext.Provider>;
}
